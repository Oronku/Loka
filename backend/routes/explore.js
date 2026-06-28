import express from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import { enrichPlace } from "../services/ai/places.js";
import googleApi from "../services/googleApi.js";
import { getCaption, detectPlatform } from "../services/socialImport.js";
import { extractAndEnrich } from "../services/ai/extractPlaces.js";

const router = express.Router();

const COLLECTIONS = "explore_collections";
const PLACES = "saved_places";

const VALID_SOURCE_TYPES = ["manual", "instagram", "tiktok"];

router.use(verifyGoogleToken);

/** Parse a string id into an ObjectId, returning null when invalid. */
function toObjectId(id) {
  if (!id || !ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function imageUrlFrom(enriched) {
  if (!enriched?.photoReference) return enriched?.imageUrl || null;
  return googleApi.getPhotoUrl(enriched.photoReference, 800);
}

/**
 * Build a persistable saved-place document from arbitrary client input.
 *
 * Accepts either a `placeId` or a raw `name`. When location data is missing we
 * enrich via Google Places (enrichPlace -> searchPlaceByText). Already-enriched
 * import candidates pass through without an extra geocode call.
 *
 * @returns {Promise<{ ok: true, doc: object } | { ok: false, error: string }>}
 */
async function buildSavedPlace(userId, input, fallbackCollectionId) {
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

  const hasLocation =
    input.location &&
    typeof input.location.lat === "number" &&
    typeof input.location.lng === "number";

  let enriched = null;
  // Only spend a Google call when the candidate isn't already geocoded.
  if (!hasLocation && name) {
    const cityContext = input.city || input.country || null;
    enriched = await enrichPlace(name, cityContext);
  }

  const location = hasLocation
    ? { lat: input.location.lat, lng: input.location.lng }
    : enriched?.location
    ? { lat: enriched.location.lat, lng: enriched.location.lng }
    : null;

  const collectionId =
    (typeof input.collectionId === "string" && input.collectionId.trim()) ||
    fallbackCollectionId ||
    null;

  const rawSource = input.source || {};
  const sourceType = VALID_SOURCE_TYPES.includes(rawSource.type)
    ? rawSource.type
    : "manual";

  const now = new Date();
  const doc = {
    userId,
    collectionId,
    placeId: placeId || enriched?.placeId || null,
    name: name || enriched?.name || "",
    address: input.address ?? enriched?.address ?? null,
    location,
    photoReference: input.photoReference ?? enriched?.photoReference ?? null,
    imageUrl: input.imageUrl ?? imageUrlFrom(enriched) ?? null,
    rating: input.rating ?? enriched?.rating ?? null,
    types: Array.isArray(input.types)
      ? input.types
      : enriched?.types || [],
    category:
      (typeof input.category === "string" && input.category.trim()) ||
      (typeof input.type === "string" && input.type.trim()) ||
      "",
    notes:
      (typeof input.notes === "string" && input.notes) ||
      (typeof input.tip === "string" && input.tip) ||
      "",
    source: {
      type: sourceType,
      url: typeof rawSource.url === "string" ? rawSource.url : null,
      caption: typeof rawSource.caption === "string" ? rawSource.caption : null,
    },
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

    res.json(places);
  } catch (error) {
    console.error("Error fetching saved places:", error);
    res.status(500).json({ error: "Failed to fetch saved places" });
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
      inputs.map((input) => buildSavedPlace(userId, input, fallbackCollectionId))
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
    const saved = docs.map((doc, i) => ({
      ...doc,
      _id: result.insertedIds[i],
    }));

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
    res.json(updated);
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
