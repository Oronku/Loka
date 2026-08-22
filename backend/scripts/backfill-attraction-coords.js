/**
 * Backfill lat/lng on trips.attractions[] that have a placeId or address
 * but no coordinates. Idempotent. Defaults to dry-run.
 *
 *   node scripts/backfill-attraction-coords.js
 *   node scripts/backfill-attraction-coords.js --dry-run
 *   node scripts/backfill-attraction-coords.js --apply
 */
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";
import googleApi from "../services/googleApi.js";

const DETAILS_FIELDS = ["place_id", "geometry", "formatted_address", "name"];
const DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasCoords(item) {
  if (!item) return false;
  if (isFiniteNumber(item.lat) && isFiniteNumber(item.lng)) return true;
  const loc = item.location;
  if (loc && typeof loc === "object") {
    const lat = loc.lat ?? loc.latitude;
    const lng = loc.lng ?? loc.longitude;
    return isFiniteNumber(lat) && isFiniteNumber(lng);
  }
  return false;
}

function usableAddress(item) {
  if (typeof item?.address === "string" && item.address.trim().length >= 2) {
    return item.address.trim();
  }
  if (typeof item?.location === "string" && item.location.trim().length >= 2) {
    return item.location.trim();
  }
  if (
    typeof item?.meetingPoint === "string" &&
    item.meetingPoint.trim().length >= 2
  ) {
    return item.meetingPoint.trim();
  }
  return null;
}

function attractionsNeedingCoords(attractions) {
  if (!Array.isArray(attractions)) return [];
  return attractions.filter((item) => {
    if (!item || item.attractionType === "note" || item.type === "note") {
      return false;
    }
    if (hasCoords(item)) return false;
    return Boolean(item.placeId || usableAddress(item) || item.name);
  });
}

function latLngFromLocation(location) {
  if (!location || typeof location !== "object") return null;
  const lat = location.lat ?? location.latitude;
  const lng = location.lng ?? location.longitude;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { lat, lng };
}

async function resolveCoords(item, destination) {
  const placeId = typeof item.placeId === "string" ? item.placeId.trim() : "";
  if (placeId) {
    try {
      const details = await googleApi.getPlaceDetails(placeId, DETAILS_FIELDS);
      const coords = latLngFromLocation(details?.geometry?.location);
      if (coords) {
        return { ...coords, placeId: details.place_id || placeId };
      }
    } catch {
      // fall through to text search
    }
  }

  const address = usableAddress(item);
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const dest = typeof destination === "string" ? destination.trim() : "";
  const query = [address || name, dest].filter(Boolean).join(", ");
  if (query.length < 2) return null;

  const search = await googleApi.searchPlaceByText(query);
  if (!search?.placeId) return null;
  const fromSearch = latLngFromLocation(search.location);
  if (fromSearch) {
    return { ...fromSearch, placeId: search.placeId };
  }
  try {
    const details = await googleApi.getPlaceDetails(search.placeId, DETAILS_FIELDS);
    const coords = latLngFromLocation(details?.geometry?.location);
    if (!coords) return null;
    return { ...coords, placeId: details.place_id || search.placeId };
  } catch {
    return null;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const db = await connectToDatabase();
  const trips = await db
    .collection("trips")
    .find({ "attractions.0": { $exists: true } })
    .toArray();

  let tripsTouched = 0;
  let attractionsFilled = 0;
  let attractionsSkipped = 0;

  for (const trip of trips) {
    const missing = attractionsNeedingCoords(trip.attractions);
    if (missing.length === 0) continue;

    const next = [];
    let tripChanged = false;
    for (const item of trip.attractions) {
      if (!item || hasCoords(item)) {
        next.push(item);
        continue;
      }
      if (item.attractionType === "note" || item.type === "note") {
        next.push(item);
        continue;
      }
      if (!item.placeId && !usableAddress(item) && !item.name) {
        next.push(item);
        continue;
      }

      const resolved = await resolveCoords(item, trip.destination);
      await sleep(DELAY_MS);
      if (!resolved) {
        attractionsSkipped += 1;
        next.push(item);
        continue;
      }

      tripChanged = true;
      attractionsFilled += 1;
      next.push({
        ...item,
        lat: resolved.lat,
        lng: resolved.lng,
        placeId: item.placeId || resolved.placeId,
      });
    }

    if (!tripChanged) continue;
    tripsTouched += 1;
    if (dryRun) continue;
    const query = trip.id ? { id: trip.id } : { _id: trip._id };
    await db.collection("trips").updateOne(query, {
      $set: { attractions: next, updatedAt: new Date().toISOString() },
    });
  }

  console.log(
    `[backfill-attraction-coords] trips=${tripsTouched} attractionsFilled=${attractionsFilled} unresolved=${attractionsSkipped} dryRun=${dryRun}`,
  );
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
