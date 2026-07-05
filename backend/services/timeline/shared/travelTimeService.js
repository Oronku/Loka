import { getDatabase } from "../../../config/database.js";
import googleApi from "../../googleApi.js";

const memoryTravelCache = new Map();

/** Cached Google Distance Matrix lookup for a single origin/destination pair. */
export async function getTravelTime(origin, destination, mode = "driving") {
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
