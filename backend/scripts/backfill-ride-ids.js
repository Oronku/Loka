/**
 * One-off: assign `id` on trips.rides[] elements that lack one.
 * Reuses the subdocument `_id` as a string when present, otherwise a uuid.
 * Idempotent. Defaults to dry-run.
 *
 *   node scripts/backfill-ride-ids.js
 *   node scripts/backfill-ride-ids.js --dry-run
 *   node scripts/backfill-ride-ids.js --apply
 */
import { randomUUID } from "crypto";
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";

function resolveRideId(item) {
  if (item?.id) return String(item.id);
  if (item?._id != null) return String(item._id);
  return randomUUID();
}

function ridesNeedingId(rides) {
  if (!Array.isArray(rides)) return [];
  return rides.filter((item) => item && !item.id);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const db = await connectToDatabase();
  const trips = await db
    .collection("trips")
    .find({ "rides.0": { $exists: true } })
    .toArray();

  let tripsTouched = 0;
  let ridesFilled = 0;

  for (const trip of trips) {
    const missing = ridesNeedingId(trip.rides);
    if (missing.length === 0) continue;
    tripsTouched += 1;
    ridesFilled += missing.length;
    const next = trip.rides.map((item) => {
      if (!item || item.id) return item;
      return { ...item, id: resolveRideId(item) };
    });
    if (dryRun) continue;
    const query = trip.id ? { id: trip.id } : { _id: trip._id };
    await db.collection("trips").updateOne(query, {
      $set: { rides: next, updatedAt: new Date().toISOString() },
    });
  }

  console.log(
    `[backfill-ride-ids] trips=${tripsTouched} ridesMissingId=${ridesFilled} dryRun=${dryRun}`,
  );
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
