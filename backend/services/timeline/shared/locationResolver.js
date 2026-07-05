import { getDatabase } from "../../../config/database.js";
import googleApi from "../../googleApi.js";

const memoryGeocodeCache = new Map();

function destinationName(trip) {
  const dest = (trip?.destinations || [])[0];
  if (!dest) return "";
  if (typeof dest === "string") return dest;
  return dest.name || dest.city || "";
}

/**
 * Resolve a location string to a Distance-Matrix-usable value.
 * Uses "lat,lng"/address strings directly, otherwise geocodes the name
 * (+ trip destination) via Places text search. Results are cached.
 */
export async function resolveLocationString(value, trip) {
  if (!value || typeof value !== "string") return null;

  if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(value)) {
    // Already "lat,lng".
    return value;
  }
  if (value.includes(",")) {
    // Looks like an address string; usable directly.
    return value;
  }

  const query = destinationName(trip)
    ? `${value}, ${destinationName(trip)}`
    : value;

  const cached = await readGeocodeCache(query);
  if (cached !== undefined) return cached;

  let resolved = null;
  try {
    const place = await googleApi.searchPlaceByText(query);
    if (place?.location?.lat != null && place?.location?.lng != null) {
      resolved = `${place.location.lat},${place.location.lng}`;
    } else if (place?.address) {
      resolved = place.address;
    }
  } catch (err) {
    console.error("Timeline geocode failed:", query, err.message);
  }

  await writeGeocodeCache(query, resolved);
  return resolved;
}

async function readGeocodeCache(query) {
  const db = getDatabase();
  if (db) {
    const doc = await db.collection("geocode_cache").findOne({ query });
    return doc ? doc.result : undefined;
  }
  return memoryGeocodeCache.has(query)
    ? memoryGeocodeCache.get(query)
    : undefined;
}

async function writeGeocodeCache(query, result) {
  const db = getDatabase();
  if (db) {
    await db
      .collection("geocode_cache")
      .updateOne(
        { query },
        { $set: { query, result, updatedAt: new Date() } },
        { upsert: true }
      );
  } else {
    memoryGeocodeCache.set(query, result);
  }
}
