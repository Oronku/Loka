import googleApi from "./googleApi.js";
import { normalizeUrl } from "./socialImport.js";
import { enrichPlaceSummary } from "./ai/enrichPlaceSummary.js";
import { UTILITY_MODEL } from "./ai/openaiClient.js";

export const PLACES_CACHE_COLLECTION = "places_cache";

const MAX_IMAGES = 6;
const CACHE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export { CACHE_REFRESH_MS };
const SUMMARY_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const PLACE_DETAILS_FIELDS = [
  "place_id",
  "name",
  "formatted_address",
  "address_components",
  "rating",
  "geometry",
  "website",
  "url",
  "opening_hours",
  "current_opening_hours",
  "photos",
  "reviews",
  "types",
  "price_level",
  "editorial_summary",
  "formatted_phone_number",
  "user_ratings_total",
  "business_status",
  "utc_offset",
];

/** Fields requested only for GET /api/places/details (same long-cache refresh). */
const PLACE_DETAILS_API_FIELDS = [
  "place_id",
  "name",
  "formatted_address",
  "rating",
  "geometry",
  "formatted_phone_number",
  "website",
  "opening_hours",
  "current_opening_hours",
  "photos",
  "reviews",
  "price_level",
  "types",
  "editorial_summary",
  "user_ratings_total",
  "business_status",
  "url",
  "utc_offset",
];

/** @param {import('mongodb').Db} db */
function placesCache(db) {
  return db.collection(PLACES_CACHE_COLLECTION);
}

/**
 * Parse city / country / countryCode from Google address_components.
 * @param {Array<{ long_name: string, short_name: string, types: string[] }>} components
 */
export function parseAddressComponents(components = []) {
  let city = null;
  let country = null;
  let countryCode = null;

  for (const c of components) {
    const types = c.types || [];
    if (types.includes("locality")) {
      city = c.long_name;
    } else if (!city && types.includes("postal_town")) {
      city = c.long_name;
    } else if (!city && types.includes("administrative_area_level_2")) {
      city = c.long_name;
    } else if (!city && types.includes("sublocality") && types.includes("sublocality_level_1")) {
      city = c.long_name;
    } else if (types.includes("country")) {
      country = c.long_name;
      countryCode = c.short_name;
    }
  }

  return { city, country, countryCode };
}

function buildImagesFromPhotos(photos = [], maxWidth = 800) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  return photos
    .slice(0, MAX_IMAGES)
    .map((p) => googleApi.getPhotoUrl(p.photo_reference, maxWidth))
    .filter(Boolean);
}

function buildPhotosMeta(photos = []) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  return photos.slice(0, 10).map((photo) => ({
    photoReference: photo.photo_reference,
    width: photo.width,
    height: photo.height,
  }));
}

/**
 * Parse Google HHMM time string to minutes since midnight.
 * @param {string|undefined} time
 */
function parseHHMM(time) {
  if (!time || typeof time !== "string") return 0;
  const h = parseInt(time.slice(0, 2), 10);
  const m = parseInt(time.slice(2, 4), 10);
  return h * 60 + m;
}

/**
 * Compute whether a place is open now from cached weekday periods and utc_offset.
 * Does not handle special/holiday hours (date-keyed periods are skipped).
 *
 * @param {{ periods?: Array<{ open?: { day?: number, time?: string, date?: string }, close?: { day?: number, time?: string, date?: string } }> }|null|undefined} hours
 * @param {number|null|undefined} utcOffsetMinutes
 * @returns {boolean|null}
 */
export function computeOpenNow(hours, utcOffsetMinutes) {
  if (!hours?.periods?.length || utcOffsetMinutes == null) return null;

  const local = new Date(Date.now() + utcOffsetMinutes * 60_000);
  const day = local.getUTCDay();
  const nowMinutes = day * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();

  for (const period of hours.periods) {
    if (!period.open || period.open.date || period.close?.date) continue;

    const openDay = period.open.day ?? 0;
    const openMinutes = openDay * 1440 + parseHHMM(period.open.time);
    let closeMinutes;

    if (!period.close) {
      if (day === openDay) return true;
      continue;
    }

    const closeDay = period.close.day ?? openDay;
    closeMinutes = closeDay * 1440 + parseHHMM(period.close.time);
    if (closeMinutes <= openMinutes) closeMinutes += 7 * 1440;

    let adjustedNow = nowMinutes;
    if (adjustedNow < openMinutes) adjustedNow += 7 * 1440;

    if (adjustedNow >= openMinutes && adjustedNow < closeMinutes) return true;
  }

  return false;
}

function inferCategory(types = []) {
  const skip = new Set([
    "point_of_interest",
    "establishment",
    "food",
    "store",
    "political",
    "geocode",
  ]);
  const hit = types.find((t) => !skip.has(t));
  return hit || types[0] || "";
}

/**
 * Normalize a Google Place Details / Text Search payload into a places_cache doc.
 * @param {object} googlePlace
 * @param {object|null} existing
 */
function buildCacheDoc(googlePlace, existing = null) {
  const placeId = googlePlace.place_id || googlePlace.placeId;
  const { city, country, countryCode } = parseAddressComponents(
    googlePlace.address_components || []
  );
  const types = googlePlace.types || [];
  const photos = googlePlace.photos || [];
  const images = buildImagesFromPhotos(photos);
  const now = new Date();

  const editorial =
    typeof googlePlace.editorial_summary?.overview === "string"
      ? googlePlace.editorial_summary.overview.trim()
      : null;

  return {
    placeId,
    name: googlePlace.name || existing?.name || "",
    address: googlePlace.formatted_address || existing?.address || null,
    location: googlePlace.geometry?.location
      ? {
          lat: googlePlace.geometry.location.lat,
          lng: googlePlace.geometry.location.lng,
        }
      : existing?.location || null,
    city: city || existing?.city || null,
    country: country || existing?.country || null,
    countryCode: countryCode || existing?.countryCode || null,
    category: inferCategory(types) || existing?.category || "",
    types,
    rating: googlePlace.rating ?? existing?.rating ?? null,
    priceLevel: googlePlace.price_level ?? existing?.priceLevel ?? null,
    website: googlePlace.website || existing?.website || null,
    googleMapsUrl: googlePlace.url || existing?.googleMapsUrl || null,
    images: images.length ? images : existing?.images || [],
    summary: editorial || existing?.summary || null,
    summaryModel: editorial ? "google_editorial" : existing?.summaryModel || null,
    tags: existing?.tags || [],
    sources: existing?.sources || [],
    openingHours:
      googlePlace.current_opening_hours ||
      googlePlace.opening_hours ||
      existing?.openingHours ||
      null,
    formattedPhoneNumber:
      googlePlace.formatted_phone_number ?? existing?.formattedPhoneNumber ?? null,
    userRatingsTotal:
      googlePlace.user_ratings_total ?? existing?.userRatingsTotal ?? 0,
    businessStatus:
      googlePlace.business_status ?? existing?.businessStatus ?? null,
    utcOffsetMinutes:
      googlePlace.utc_offset ?? existing?.utcOffsetMinutes ?? null,
    photosMeta:
      buildPhotosMeta(googlePlace.photos).length > 0
        ? buildPhotosMeta(googlePlace.photos)
        : existing?.photosMeta || [],
    reviews: googlePlace.reviews || existing?.reviews || null,
    enrichedAt: existing?.enrichedAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function fetchGooglePlace({ placeId, name, cityContext, fields = PLACE_DETAILS_FIELDS, language = "en" }) {
  if (!googleApi.apiKey) return null;

  try {
    if (placeId) {
      const details = await googleApi.getPlaceDetails(placeId, fields, language);
      return details || null;
    }

    if (name) {
      const searchResult = await googleApi.searchPlaceByText(
        cityContext ? `${name} ${cityContext}` : name
      );
      if (!searchResult?.placeId) return null;
      const details = await googleApi.getPlaceDetails(
        searchResult.placeId,
        fields,
        language
      );
      return details || null;
    }
  } catch (err) {
    console.error("[placeCache] Google fetch failed:", err.message);
  }

  return null;
}

function cacheNeedsRefresh(doc) {
  if (!doc?.updatedAt) return true;
  return Date.now() - new Date(doc.updatedAt).getTime() > CACHE_REFRESH_MS;
}

/**
 * Resolve a place via Google and upsert into places_cache. Returns the cache doc or null.
 *
 * @param {import('mongodb').Db} db
 * @param {{ placeId?: string, name?: string, cityContext?: string|null }} params
 */
export async function getOrCreatePlaceCache(db, { placeId, name, cityContext } = {}) {
  if (!db) return null;

  const resolvedPlaceId =
    typeof placeId === "string" && placeId.trim() ? placeId.trim() : null;
  const resolvedName = typeof name === "string" ? name.trim() : "";

  if (!resolvedPlaceId && !resolvedName) return null;

  let existing = null;
  if (resolvedPlaceId) {
    existing = await placesCache(db).findOne({ placeId: resolvedPlaceId });
    if (existing && !cacheNeedsRefresh(existing)) {
      return existing;
    }
  }

  const googlePlace = await fetchGooglePlace({
    placeId: resolvedPlaceId,
    name: resolvedName,
    cityContext: cityContext || null,
  });

  if (!googlePlace) {
    return existing;
  }

  const doc = buildCacheDoc(googlePlace, existing);
  if (!doc.placeId) return existing;

  const { createdAt, ...setFields } = doc;
  await placesCache(db).updateOne(
    { placeId: doc.placeId },
    { $set: setFields, $setOnInsert: { createdAt } },
    { upsert: true }
  );

  return placesCache(db).findOne({ placeId: doc.placeId });
}

/**
 * Append a provenance source to places_cache, deduped by normalized URL.
 *
 * @param {import('mongodb').Db} db
 * @param {string} placeId
 * @param {{ type?: string, url: string, caption?: string|null, addedByUserId?: string|null }} source
 */
export async function addSourceToPlace(db, placeId, source) {
  if (!db || !placeId || !source?.url) return null;

  const normalized = normalizeUrl(source.url);
  const existing = await placesCache(db).findOne({ placeId });
  if (!existing) return null;

  const already = (existing.sources || []).some(
    (s) => s.url && normalizeUrl(s.url) === normalized
  );
  if (already) return existing;

  const entry = {
    type: source.type || "manual",
    url: source.url,
    caption: source.caption || null,
    addedByUserId: source.addedByUserId || null,
    addedAt: new Date(),
  };

  await placesCache(db).updateOne(
    { placeId },
    {
      $push: { sources: entry },
      $set: { updatedAt: new Date() },
    }
  );

  return placesCache(db).findOne({ placeId });
}

function summaryIsStale(doc) {
  if (!doc?.summary) return true;
  if (!doc.enrichedAt) return true;
  return Date.now() - new Date(doc.enrichedAt).getTime() > SUMMARY_STALE_MS;
}

/**
 * Ensure AI summary/tags exist on a places_cache doc. Never throws.
 *
 * @param {import('mongodb').Db} db
 * @param {object} placeDoc places_cache document
 * @param {string|null} [captionHint]
 */
export async function ensurePlaceSummary(db, placeDoc, captionHint = null) {
  if (!db || !placeDoc?.placeId) return placeDoc;
  if (!summaryIsStale(placeDoc)) return placeDoc;

  const result = await enrichPlaceSummary(
    {
      name: placeDoc.name,
      city: placeDoc.city,
      country: placeDoc.country,
      types: placeDoc.types,
      rating: placeDoc.rating,
    },
    captionHint
  );

  if (!result) return placeDoc;

  const now = new Date();
  await placesCache(db).updateOne(
    { placeId: placeDoc.placeId },
    {
      $set: {
        summary: result.summary,
        tags: result.tags,
        summaryModel: UTILITY_MODEL,
        enrichedAt: now,
        updatedAt: now,
      },
    }
  );

  return {
    ...placeDoc,
    summary: result.summary,
    tags: result.tags,
    summaryModel: UTILITY_MODEL,
    enrichedAt: now,
    updatedAt: now,
  };
}

/**
 * Map a places_cache document to the GET /api/places/details response place object.
 *
 * @param {object|null} cacheDoc
 * @param {{ stale?: boolean }} [options]
 */
export function formatPlaceDetailsFromCache(cacheDoc, { stale = false } = {}) {
  if (!cacheDoc) return null;

  const hours = cacheDoc.openingHours;
  const openNow = computeOpenNow(hours, cacheDoc.utcOffsetMinutes);

  const place = {
    placeId: cacheDoc.placeId,
    name: cacheDoc.name,
    formattedAddress: cacheDoc.address,
    rating: cacheDoc.rating,
    userRatingsTotal: cacheDoc.userRatingsTotal ?? 0,
    priceLevel: cacheDoc.priceLevel,
    geometry: cacheDoc.location
      ? { location: { lat: cacheDoc.location.lat, lng: cacheDoc.location.lng } }
      : null,
    description: cacheDoc.summary || null,
    formattedPhoneNumber: cacheDoc.formattedPhoneNumber ?? null,
    website: cacheDoc.website,
    googleMapsUrl: cacheDoc.googleMapsUrl || null,
    businessStatus: cacheDoc.businessStatus || null,
    types: cacheDoc.types || [],
    openingHours: hours
      ? {
          openNow: openNow ?? hours.open_now ?? null,
          weekdayText: hours.weekday_text || [],
        }
      : null,
    photos: cacheDoc.photosMeta || [],
    reviews:
      cacheDoc.reviews?.slice(0, 5).map((review) => ({
        authorName: review.author_name,
        rating: review.rating,
        text: review.text,
        time: review.time,
      })) || [],
  };

  if (stale) place.cacheStale = true;

  return place;
}

/**
 * Resolve place details for GET /api/places/details — long-lived cache with
 * openNow computed from cached periods + utc_offset (never served stale from cache).
 *
 * @param {import('mongodb').Db} db
 * @param {string} placeId
 * @param {string} [language]
 * @returns {Promise<{ place: object|null, fromCache: boolean, stale: boolean }|null>}
 */
export async function getPlaceDetailsForApi(db, placeId, language = "en") {
  if (!db || !placeId) return null;

  const trimmedId = placeId.trim();
  let existing = await placesCache(db).findOne({ placeId: trimmedId });
  const needsRefresh = !existing || cacheNeedsRefresh(existing);

  if (!needsRefresh) {
    return {
      place: formatPlaceDetailsFromCache(existing, { stale: false }),
      fromCache: true,
      stale: false,
    };
  }

  const googlePlace = await fetchGooglePlace({
    placeId: trimmedId,
    fields: PLACE_DETAILS_API_FIELDS,
    language,
  });

  if (googlePlace) {
    const doc = buildCacheDoc(googlePlace, existing);
    if (doc.placeId) {
      const { createdAt, ...setFields } = doc;
      await placesCache(db).updateOne(
        { placeId: doc.placeId },
        { $set: setFields, $setOnInsert: { createdAt } },
        { upsert: true },
      );
      existing = await placesCache(db).findOne({ placeId: doc.placeId });
    }
    return {
      place: formatPlaceDetailsFromCache(existing, { stale: false }),
      fromCache: false,
      stale: false,
    };
  }

  if (existing) {
    return {
      place: formatPlaceDetailsFromCache(existing, { stale: true }),
      fromCache: true,
      stale: true,
    };
  }

  return null;
}

/** Denormalized fields copied onto saved_places for fast list reads. */
export function denormalizedFromCache(cacheDoc) {
  if (!cacheDoc) return {};
  return {
    placeId: cacheDoc.placeId,
    name: cacheDoc.name,
    address: cacheDoc.address,
    location: cacheDoc.location,
    city: cacheDoc.city,
    country: cacheDoc.country,
    countryCode: cacheDoc.countryCode,
    category: cacheDoc.category,
    types: cacheDoc.types || [],
    rating: cacheDoc.rating,
    priceLevel: cacheDoc.priceLevel,
    imageUrl: cacheDoc.images?.[0] || null,
    images: cacheDoc.images || [],
    summary: cacheDoc.summary,
    tags: cacheDoc.tags || [],
  };
}
