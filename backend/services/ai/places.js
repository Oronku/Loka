import googleApi from "../googleApi.js";
import { getDb } from "../../config/database.js";
import { getOrCreatePlaceCache } from "../placeCache.js";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;
const cache = new Map();

const DETAILS_FIELDS = [
  "place_id",
  "name",
  "formatted_address",
  "rating",
  "geometry",
  "website",
  "opening_hours",
  "current_opening_hours",
  "photos",
];

function getCached(query) {
  const entry = cache.get(query.toLowerCase());
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCached(query, data) {
  cache.set(query.toLowerCase(), { data, timestamp: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * Persist openingHours in the GET /api/places/details contract shape:
 * `{ weekdayText?: string[], periods?: unknown[] }`.
 * @param {object|null|undefined} hours
 * @returns {{ weekdayText?: string[], periods?: unknown[] }|null}
 */
export function normalizeOpeningHours(hours) {
  if (!hours || typeof hours !== "object") return null;
  const weekdayText = hours.weekdayText || hours.weekday_text;
  const periods = hours.periods;
  const out = {};
  if (Array.isArray(weekdayText) && weekdayText.length) out.weekdayText = weekdayText;
  if (Array.isArray(periods) && periods.length) out.periods = periods;
  return Object.keys(out).length ? out : null;
}

function latLngOf(location) {
  if (!location || typeof location !== "object") return { lat: null, lng: null };
  const lat = location.lat ?? location.latitude ?? null;
  const lng = location.lng ?? location.longitude ?? null;
  return { lat, lng };
}

function fromCacheDoc(doc) {
  if (!doc) return null;
  const { lat, lng } = latLngOf(doc.location);
  return {
    name: doc.name || null,
    address: doc.address || null,
    rating: doc.rating ?? null,
    placeId: doc.placeId || null,
    photoReference: null,
    location: doc.location || null,
    website: doc.website || null,
    openingHours: normalizeOpeningHours(doc.openingHours),
    lat,
    lng,
  };
}

function fromGoogle(search, details) {
  const hours =
    details?.current_opening_hours || details?.opening_hours || null;
  const geometryLocation = details?.geometry?.location || search?.location || null;
  const { lat, lng } = latLngOf(geometryLocation);
  return {
    name: details?.name || search?.name || null,
    address: details?.formatted_address || search?.address || null,
    rating: details?.rating ?? search?.rating ?? null,
    placeId: details?.place_id || search?.placeId || null,
    photoReference:
      details?.photos?.[0]?.photo_reference || search?.photoReference || null,
    location: geometryLocation,
    website: details?.website || null,
    openingHours: normalizeOpeningHours(hours),
    lat,
    lng,
  };
}

async function fetchDetails(placeId) {
  if (!placeId || !googleApi.apiKey) return null;
  try {
    return await googleApi.getPlaceDetails(placeId, DETAILS_FIELDS);
  } catch (err) {
    console.error("[ai/places] getPlaceDetails failed:", err.message);
    return null;
  }
}

async function enrichFromGoogle(query) {
  if (!googleApi.apiKey) return null;
  let search = null;
  try {
    search = await googleApi.searchPlaceByText(query);
  } catch (err) {
    console.error("[ai/places] searchPlaceByText failed:", err.message);
    return null;
  }
  if (!search?.placeId) return null;
  const details = await fetchDetails(search.placeId);
  return fromGoogle(search, details);
}

/**
 * Resolve a free-text place name (optionally biased to a city) into rich
 * Google Places details, including website and openingHours. Reuses
 * places_cache when a db is available. Cached in-process, and safe to call
 * when no API key is set (returns null). Never throws.
 * @param {string} name
 * @param {string|null} [cityContext]
 * @param {import('mongodb').Db|null} [db]
 * @returns {Promise<null|{ name, address, rating, placeId, photoReference, location, website, openingHours, lat, lng }>}
 */
export async function enrichPlace(name, cityContext = null, db = null) {
  if (!name) return null;
  const query = cityContext ? `${name} ${cityContext}` : name;
  const cached = getCached(query);
  if (cached) return cached;

  try {
    const database = db || getDb();
    if (database) {
      try {
        const doc = await getOrCreatePlaceCache(database, {
          name,
          cityContext: cityContext || null,
        });
        let mapped = fromCacheDoc(doc);
        if (mapped?.placeId) {
          if (!mapped.openingHours || !mapped.website) {
            const details = await fetchDetails(mapped.placeId);
            if (details) {
              mapped = {
                ...mapped,
                ...fromGoogle(
                  {
                    placeId: mapped.placeId,
                    name: mapped.name,
                    address: mapped.address,
                    rating: mapped.rating,
                    location: mapped.location,
                    photoReference: mapped.photoReference,
                  },
                  details,
                ),
              };
            }
          }
          setCached(query, mapped);
          return mapped;
        }
      } catch (err) {
        console.error("[ai/places] cache lookup failed:", err.message);
      }
    }

    const details = await enrichFromGoogle(query);
    if (details) setCached(query, details);
    return details;
  } catch (err) {
    console.error("[ai/places] enrichPlace error:", err.message);
    return null;
  }
}
