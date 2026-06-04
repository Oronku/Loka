import { getDatabase } from "../../config/database.js";
import googleApi from "../googleApi.js";
import { toTime } from "./buildTimeline.js";

const memoryGeocodeCache = new Map();
const memoryTravelCache = new Map();

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
async function resolveLocationString(value, trip) {
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

/** Cached Google Distance Matrix lookup for a single origin/destination pair. */
async function getTravelTime(origin, destination, mode = "driving") {
  if (!origin || !destination) return null;
  const key = `${origin}|${destination}|${mode}`;

  const cached = await readTravelCache(key);
  if (cached !== undefined) return cached;

  let value = null;
  try {
    const data = await googleApi.getDistanceMatrix(origin, destination, mode);
    const element = data?.rows?.[0]?.elements?.[0];
    if (element && element.status === "OK") {
      value = {
        durationSeconds: element.duration?.value ?? null,
        durationText: element.duration?.text ?? null,
        distanceText: element.distance?.text ?? null,
        distanceMeters: element.distance?.value ?? null,
      };
    }
  } catch (err) {
    console.error("Timeline distance lookup failed:", key, err.message);
  }

  await writeTravelCache(key, value);
  return value;
}

async function readTravelCache(key) {
  const db = getDatabase();
  if (db) {
    const doc = await db.collection("travel_cache").findOne({ key });
    return doc ? doc.result : undefined;
  }
  return memoryTravelCache.has(key) ? memoryTravelCache.get(key) : undefined;
}

async function writeTravelCache(key, result) {
  const db = getDatabase();
  if (db) {
    await db
      .collection("travel_cache")
      .updateOne(
        { key },
        { $set: { key, result, updatedAt: new Date() } },
        { upsert: true }
      );
  } else {
    memoryTravelCache.set(key, result);
  }
}

/**
 * Compute travel legs between consecutive scheduled events.
 * @param {object} trip
 * @param {object[]} events ordered events from buildTimeline
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<object[]>} legs
 */
export async function calculateTravelLegs(trip, events, opts = {}) {
  const mode = opts.mode || "driving";
  if (!Array.isArray(events) || events.length < 2) return [];

  // A leg leaves from one event's departLocation and arrives at the next
  // event's arriveLocation. These differ for flights (depart airport vs
  // arrival airport); for other events both fall back to `location`.
  const departLocations = await Promise.all(
    events.map((event) =>
      resolveLocationString(event.departLocation ?? event.location, trip)
    )
  );
  const arriveLocations = await Promise.all(
    events.map((event) =>
      resolveLocationString(event.arriveLocation ?? event.location, trip)
    )
  );

  // Resolve every leg in parallel; per-pair caching keeps repeat builds cheap.
  return Promise.all(
    events.slice(0, -1).map(async (from, i) => {
      const to = events[i + 1];
      const origin = departLocations[i];
      const destination = arriveLocations[i + 1];

      const leg = {
        fromIndex: i,
        toIndex: i + 1,
        fromTitle: from.title,
        toTitle: to.title,
        mode,
        unresolved: false,
        durationSeconds: null,
        durationText: null,
        distanceText: null,
        gapSeconds: null,
        tight: false,
        leaveBy: null,
      };

      const prevEnd = toTime(from.end || from.start);
      const nextStart = toTime(to.start);
      if (!Number.isNaN(prevEnd) && !Number.isNaN(nextStart)) {
        leg.gapSeconds = Math.round((nextStart - prevEnd) / 1000);
      }

      if (!origin || !destination) {
        leg.unresolved = true;
        return leg;
      }

      const travel = await getTravelTime(origin, destination, mode);
      if (!travel) {
        leg.unresolved = true;
        return leg;
      }

      leg.durationSeconds = travel.durationSeconds;
      leg.durationText = travel.durationText;
      leg.distanceText = travel.distanceText;

      if (
        leg.gapSeconds != null &&
        travel.durationSeconds != null &&
        travel.durationSeconds > leg.gapSeconds
      ) {
        leg.tight = true;
        if (!Number.isNaN(nextStart)) {
          leg.leaveBy = new Date(
            nextStart - travel.durationSeconds * 1000
          ).toISOString();
        }
      }

      return leg;
    })
  );
}
