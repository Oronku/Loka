import express from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import { getCaption, detectPlatform } from "../services/socialImport.js";
import { extractAndEnrich } from "../services/ai/extractPlaces.js";
import {
  PLACES_CACHE_COLLECTION,
  getOrCreatePlaceCache,
  addSourceToPlace,
  ensurePlaceSummary,
  denormalizedFromCache,
} from "../services/placeCache.js";
import {
  buildDiscoverFeed,
  getDiscoverPlaceById,
} from "../services/discoverFeed.js";

const router = express.Router();

const COLLECTIONS = "explore_collections";
const PLACES = "saved_places";

const VALID_SOURCE_TYPES = ["manual", "instagram", "tiktok", "web"];

router.use(verifyGoogleToken);

/** Parse a string id into an ObjectId, returning null when invalid. */
function toObjectId(id) {
  if (!id || !ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function publicSources(sources = []) {
  return sources.map((s) => ({
    type: s.type,
    url: s.url,
    caption: s.caption ?? null,
    addedAt: s.addedAt,
  }));
}

/**
 * Merge a saved_places row with its places_cache doc into the SavedPlace API shape.
 */
function formatSavedPlace(saved, cache) {
  const types =
    Array.isArray(saved.types) && saved.types.length
      ? saved.types
      : cache?.types || [];
  const images =
    Array.isArray(saved.images) && saved.images.length
      ? saved.images
      : cache?.images || [];
  const tags =
    Array.isArray(saved.tags) && saved.tags.length
      ? saved.tags
      : cache?.tags || [];

  return {
    id: saved._id.toString(),
    placeId: saved.placeId || cache?.placeId || null,
    name: saved.name || cache?.name || "",
    address: saved.address ?? cache?.address ?? null,
    location: saved.location || cache?.location || null,
    city: saved.city ?? cache?.city ?? null,
    country: saved.country ?? cache?.country ?? null,
    countryCode: saved.countryCode ?? cache?.countryCode ?? null,
    category: saved.category || cache?.category || "",
    types,
    rating: saved.rating ?? cache?.rating ?? null,
    priceLevel: saved.priceLevel ?? cache?.priceLevel ?? null,
    imageUrl: saved.imageUrl || images[0] || null,
    images,
    summary: saved.summary ?? cache?.summary ?? null,
    tags,
    notes: saved.notes || "",
    collectionId: saved.collectionId ?? null,
    sources: publicSources(cache?.sources || saved.sources || []),
    createdAt: saved.createdAt,
  };
}

function formatSavedPlaceDetail(saved, cache) {
  const base = formatSavedPlace(saved, cache);
  return {
    ...base,
    website: cache?.website ?? null,
    googleMapsUrl: cache?.googleMapsUrl ?? null,
    openingHours: cache?.openingHours?.weekday_text ?? cache?.openingHours ?? null,
    reviews: cache?.reviews ?? null,
  };
}

function savedPlaceNeedsEnrichment(saved) {
  return !saved.country || !saved.summary || !saved.city;
}

/** Persist denormalized cache fields back onto a saved_places row. */
async function persistDenormalized(db, savedId, cacheDoc) {
  if (!cacheDoc) return;
  const patch = denormalizedFromCache(cacheDoc);
  await db.collection(PLACES).updateOne(
    { _id: savedId },
    { $set: { ...patch, updatedAt: new Date() } }
  );
}

/**
 * Best-effort lazy enrichment for legacy saved_places rows. Respects a ~1s budget;
 * continues in the background when slow.
 */
async function lazyEnrichSavedPlace(db, savedPlace, cacheDoc) {
  const work = async () => {
    let cache = cacheDoc;
    if (!cache) {
      cache = await getOrCreatePlaceCache(db, {
        placeId: savedPlace.placeId || undefined,
        name: savedPlace.name || undefined,
        cityContext: savedPlace.city || savedPlace.country || null,
      });
    }
    if (!cache) return null;

    const captionHint =
      savedPlace.source?.caption ||
      (Array.isArray(savedPlace.sources) && savedPlace.sources[0]?.caption) ||
      null;
    cache = await ensurePlaceSummary(db, cache, captionHint);
    await persistDenormalized(db, savedPlace._id, cache);
    return cache;
  };

  const timeoutMs = 900;
  let timedOut = false;

  const result = await Promise.race([
    work().catch((err) => {
      console.error("[explore] lazy enrich failed:", err.message);
      return null;
    }),
    new Promise((resolve) =>
      setTimeout(() => {
        timedOut = true;
        resolve(undefined);
      }, timeoutMs)
    ),
  ]);

  if (timedOut) {
    work().catch((err) =>
      console.error("[explore] async lazy enrich failed:", err.message)
    );
    return cacheDoc;
  }

  return result ?? cacheDoc;
}

async function loadCacheMap(db, placeIds) {
  const ids = [...new Set(placeIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const docs = await db
    .collection(PLACES_CACHE_COLLECTION)
    .find({ placeId: { $in: ids } })
    .toArray();
  return Object.fromEntries(docs.map((d) => [d.placeId, d]));
}

/**
 * Build a persistable saved-place document from client input, backed by places_cache.
 *
 * @returns {Promise<{ ok: true, doc: object } | { ok: false, error: string }>}
 */
async function buildSavedPlace(db, userId, input, fallbackCollectionId) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid place payload" };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const placeId =
    typeof input.placeId === "string" && input.placeId.trim()
      ? input.placeId.trim()
      : null;

  if (!name && !placeId) {
    return { ok: false, error: "A place name or placeId is required" };
  }

  const collectionId =
    (typeof input.collectionId === "string" && input.collectionId.trim()) ||
    fallbackCollectionId ||
    null;

  const rawSource = input.source || {};
  const sourceType = VALID_SOURCE_TYPES.includes(rawSource.type)
    ? rawSource.type
    : "manual";

  const cityContext =
    input.city || input.country || input.cityContext || null;

  let cacheDoc = await getOrCreatePlaceCache(db, {
    placeId: placeId || undefined,
    name: name || undefined,
    cityContext,
  });

  if (cacheDoc) {
    const captionHint =
      typeof rawSource.caption === "string" ? rawSource.caption : null;
    cacheDoc = await ensurePlaceSummary(db, cacheDoc, captionHint);

    if (typeof rawSource.url === "string" && rawSource.url.trim()) {
      cacheDoc =
        (await addSourceToPlace(db, cacheDoc.placeId, {
          type: sourceType,
          url: rawSource.url.trim(),
          caption: captionHint,
          addedByUserId: userId,
        })) || cacheDoc;
    }
  }

  const hasLocation =
    input.location &&
    typeof input.location.lat === "number" &&
    typeof input.location.lng === "number";

  const now = new Date();
  const denorm = denormalizedFromCache(cacheDoc);

  const doc = {
    userId,
    collectionId,
    placeId: denorm.placeId || placeId || null,
    name: denorm.name || name,
    address: input.address ?? denorm.address ?? null,
    location: hasLocation
      ? { lat: input.location.lat, lng: input.location.lng }
      : denorm.location || null,
    city: input.city ?? denorm.city ?? null,
    country: input.country ?? denorm.country ?? null,
    countryCode: denorm.countryCode ?? null,
    category:
      (typeof input.category === "string" && input.category.trim()) ||
      (typeof input.type === "string" && input.type.trim()) ||
      denorm.category ||
      "",
    types: Array.isArray(input.types) ? input.types : denorm.types || [],
    rating: input.rating ?? denorm.rating ?? null,
    priceLevel: input.priceLevel ?? denorm.priceLevel ?? null,
    imageUrl: input.imageUrl ?? denorm.imageUrl ?? null,
    images: Array.isArray(input.images) ? input.images : denorm.images || [],
    summary: denorm.summary ?? null,
    tags: denorm.tags || [],
    notes:
      (typeof input.notes === "string" && input.notes) ||
      (typeof input.tip === "string" && input.tip) ||
      "",
    createdAt: now,
    updatedAt: now,
  };

  return { ok: true, doc };
}

/* ----------------------------- Collections ----------------------------- */

// List collections (with saved-place counts)
router.get("/collections", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const collections = await db
      .collection(COLLECTIONS)
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    const counts = await db
      .collection(PLACES)
      .aggregate([
        { $match: { userId, collectionId: { $ne: null } } },
        { $group: { _id: "$collectionId", count: { $sum: 1 } } },
      ])
      .toArray();
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

    res.json(
      collections.map((c) => ({
        ...c,
        placeCount: countMap[c._id.toString()] || 0,
      }))
    );
  } catch (error) {
    console.error("Error fetching collections:", error);
    res.status(500).json({ error: "Failed to fetch collections" });
  }
});

// Create a collection
router.post("/collections", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { name, emoji, coverImage } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Collection name is required" });
    }

    const now = new Date();
    const collection = {
      userId,
      name: name.trim(),
      emoji: emoji || null,
      coverImage: coverImage || null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection(COLLECTIONS).insertOne(collection);
    res.status(201).json({ ...collection, _id: result.insertedId });
  } catch (error) {
    console.error("Error creating collection:", error);
    res.status(500).json({ error: "Failed to create collection" });
  }
});

// Update a collection
router.patch("/collections/:id", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid collection id" });

    const updates = { updatedAt: new Date() };
    if (typeof req.body.name === "string") updates.name = req.body.name.trim();
    if ("emoji" in req.body) updates.emoji = req.body.emoji || null;
    if ("coverImage" in req.body)
      updates.coverImage = req.body.coverImage || null;

    const result = await db
      .collection(COLLECTIONS)
      .findOneAndUpdate(
        { _id, userId },
        { $set: updates },
        { returnDocument: "after" }
      );

    const updated = result?.value ?? result;
    if (!updated) {
      return res.status(404).json({ error: "Collection not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating collection:", error);
    res.status(500).json({ error: "Failed to update collection" });
  }
});

// Delete a collection (detaches its places, does not delete them)
router.delete("/collections/:id", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid collection id" });

    const result = await db
      .collection(COLLECTIONS)
      .deleteOne({ _id, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Collection not found" });
    }

    await db
      .collection(PLACES)
      .updateMany(
        { userId, collectionId: req.params.id },
        { $set: { collectionId: null, updatedAt: new Date() } }
      );

    res.json({ message: "Collection deleted" });
  } catch (error) {
    console.error("Error deleting collection:", error);
    res.status(500).json({ error: "Failed to delete collection" });
  }
});

/* ------------------------------- Discover ------------------------------ */

// Recommended places from shared places_cache, grouped into sections.
router.get("/discover", async (req, res) => {
  try {
    const db = getDb();
    const { country, category } = req.query;
    const feed = await buildDiscoverFeed(db, { country, category });
    res.json(feed);
  } catch (error) {
    console.error("Error fetching discover feed:", error);
    res.status(500).json({ error: "Failed to fetch discover feed" });
  }
});

// Full cache-backed detail for a discovered place (Google place_id).
router.get("/discover/place/:placeId", async (req, res) => {
  try {
    const db = getDb();
    const placeId =
      typeof req.params.placeId === "string" ? req.params.placeId.trim() : "";
    if (!placeId) {
      return res.status(400).json({ error: "placeId is required" });
    }

    const place = await getDiscoverPlaceById(db, placeId);
    if (!place) {
      return res.status(404).json({ error: "Place not found" });
    }

    res.json(place);
  } catch (error) {
    console.error("Error fetching discover place:", error);
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

/* ------------------------------- Places -------------------------------- */

// List saved places (optionally filtered by collection)
router.get("/places", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { collectionId } = req.query;

    const query = { userId };
    if (collectionId) query.collectionId = collectionId;

    const places = await db
      .collection(PLACES)
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    let cacheMap = await loadCacheMap(
      db,
      places.map((p) => p.placeId)
    );

    const needsEnrich = places.filter(savedPlaceNeedsEnrichment);
    if (needsEnrich.length > 0) {
      await Promise.all(
        needsEnrich.map((p) =>
          lazyEnrichSavedPlace(db, p, cacheMap[p.placeId])
        )
      );
      cacheMap = await loadCacheMap(
        db,
        places.map((p) => p.placeId)
      );
    }

    const formatted = places.map((p) => formatSavedPlace(p, cacheMap[p.placeId]));
    res.json(formatted);
  } catch (error) {
    console.error("Error fetching saved places:", error);
    res.status(500).json({ error: "Failed to fetch saved places" });
  }
});

// Full saved-place detail (merged with places_cache)
router.get("/places/:id", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid place id" });

    const saved = await db.collection(PLACES).findOne({ _id, userId });
    if (!saved) return res.status(404).json({ error: "Place not found" });

    let cacheMap = await loadCacheMap(db, [saved.placeId]);
    let cache = cacheMap[saved.placeId];

    if (savedPlaceNeedsEnrichment(saved)) {
      cache = await lazyEnrichSavedPlace(db, saved, cache);
      if (!cache && saved.placeId) {
        const refreshed = await loadCacheMap(db, [saved.placeId]);
        cache = refreshed[saved.placeId];
      }
    }

    res.json(formatSavedPlaceDetail(saved, cache));
  } catch (error) {
    console.error("Error fetching saved place detail:", error);
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

// Create one or many saved places. Body is either a single place object or
// { places: [...] } / an array for batch confirmation of import candidates.
router.post("/places", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const body = req.body || {};
    const isBatch = Array.isArray(body) || Array.isArray(body.places);
    const inputs = Array.isArray(body)
      ? body
      : Array.isArray(body.places)
      ? body.places
      : [body];

    if (inputs.length === 0) {
      return res.status(400).json({ error: "No places provided" });
    }

    const fallbackCollectionId =
      !Array.isArray(body) && typeof body.collectionId === "string"
        ? body.collectionId
        : null;

    const built = await Promise.all(
      inputs.map((input) =>
        buildSavedPlace(db, userId, input, fallbackCollectionId)
      )
    );

    const docs = [];
    const errors = [];
    built.forEach((b, i) => {
      if (b.ok) docs.push(b.doc);
      else errors.push({ index: i, error: b.error });
    });

    if (docs.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid places to save", errors });
    }

    const result = await db.collection(PLACES).insertMany(docs);

    const cacheMap = await loadCacheMap(
      db,
      docs.map((d) => d.placeId)
    );

    const saved = docs.map((doc, i) =>
      formatSavedPlace(
        { ...doc, _id: result.insertedIds[i] },
        cacheMap[doc.placeId]
      )
    );

    if (isBatch) {
      return res.status(201).json({ saved, errors });
    }
    return res.status(201).json(saved[0]);
  } catch (error) {
    console.error("Error saving place(s):", error);
    res.status(500).json({ error: "Failed to save place" });
  }
});

// Update a saved place (notes / collection / category)
router.patch("/places/:id", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid place id" });

    const updates = { updatedAt: new Date() };
    if (typeof req.body.notes === "string") updates.notes = req.body.notes;
    if ("collectionId" in req.body)
      updates.collectionId = req.body.collectionId || null;
    if (typeof req.body.category === "string")
      updates.category = req.body.category;

    const result = await db
      .collection(PLACES)
      .findOneAndUpdate(
        { _id, userId },
        { $set: updates },
        { returnDocument: "after" }
      );

    const updated = result?.value ?? result;
    if (!updated) return res.status(404).json({ error: "Place not found" });

    const cacheMap = await loadCacheMap(db, [updated.placeId]);
    res.json(formatSavedPlace(updated, cacheMap[updated.placeId]));
  } catch (error) {
    console.error("Error updating place:", error);
    res.status(500).json({ error: "Failed to update place" });
  }
});

// Delete a saved place
router.delete("/places/:id", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid place id" });

    const result = await db.collection(PLACES).deleteOne({ _id, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Place not found" });
    }
    res.json({ message: "Place deleted" });
  } catch (error) {
    console.error("Error deleting place:", error);
    res.status(500).json({ error: "Failed to delete place" });
  }
});

/* ------------------------------- Import -------------------------------- */

// Import places from a shared social URL. Fetches the caption, extracts +
// enriches candidate places, and returns them WITHOUT saving. The client
// reviews and confirms via POST /places (batch).
router.post("/import", async (req, res) => {
  try {
    const db = getDb();
    const { url, collectionId, captionHint } = req.body || {};

    if (!url || typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: "A url is required" });
    }

    const platform = detectPlatform(url);
    const hint =
      typeof captionHint === "string" ? captionHint.trim() : undefined;
    const captionResult = await getCaption(db, url.trim(), { captionHint: hint });
    const caption = captionResult.caption || "";

    if (!caption) {
      return res.json({
        platform,
        url: captionResult.url,
        caption: "",
        primaryCity: null,
        candidates: [],
        collectionId: collectionId || null,
        fallback: "manual",
        captionSource: captionResult.captionSource || null,
        message:
          "Could not read a caption for this link. Add the place manually instead.",
      });
    }

    const { candidates, primaryCity } = await extractAndEnrich(caption);

    // Stamp source metadata so confirmation saves carry provenance.
    const sourceType = platform === "unknown" ? "manual" : platform;
    const withSource = candidates.map((c) => ({
      ...c,
      collectionId: collectionId || null,
      source: {
        type: sourceType,
        url: captionResult.url,
        caption,
      },
    }));

    res.json({
      platform,
      url: captionResult.url,
      caption,
      captionSource: captionResult.captionSource || null,
      primaryCity,
      candidates: withSource,
      collectionId: collectionId || null,
      fallback: withSource.length === 0 ? "manual" : null,
    });
  } catch (error) {
    console.error("Error importing from social URL:", error);
    res.status(500).json({ error: "Failed to import from link" });
  }
});

export default router;
