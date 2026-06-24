import googleApi from "../googleApi.js";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;
const cache = new Map();

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
 * Resolve a free-text place name (optionally biased to a city) into rich
 * Google Places details. Cached, and safe to call when no API key is set
 * (returns null). Never throws.
 * @param {string} name
 * @param {string|null} [cityContext]
 * @returns {Promise<null|{ name, address, rating, placeId, photoReference, location }>}
 */
export async function enrichPlace(name, cityContext = null) {
  if (!name) return null;
  const query = cityContext ? `${name} ${cityContext}` : name;
  const cached = getCached(query);
  if (cached) return cached;

  try {
    const details = await googleApi.searchPlaceByText(query);
    if (details) setCached(query, details);
    return details;
  } catch (err) {
    console.error("[ai/places] enrichPlace error:", err.message);
    return null;
  }
}
