/**
 * One-off: assign `id` on trips.attractions[] elements that lack one.
 * Reuses the subdocument `_id` as a string when present, otherwise a uuid.
 * Idempotent. Defaults to dry-run.
 *
 *   node scripts/backfill-attraction-ids.js
 *   node scripts/backfill-attraction-ids.js --dry-run
 *   node scripts/backfill-attraction-ids.js --apply
 */
import { randomUUID } from "crypto";
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";

function resolveAttractionId(item) {
  if (item?.id) return String(item.id);
  if (item?._id != null) return String(item._id);
  return randomUUID();
}

function attractionsNeedingId(attractions) {
  if (!Array.isArray(attractions)) return [];
  return attractions.filter((item) => item && !item.id);
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

  for (const trip of trips) {
    const missing = attractionsNeedingId(trip.attractions);
    if (missing.length === 0) continue;
    tripsTouched += 1;
    attractionsFilled += missing.length;
    const next = trip.attractions.map((item) => {
      if (!item || item.id) return item;
      return { ...item, id: resolveAttractionId(item) };
    });
    if (dryRun) continue;
    const query = trip.id ? { id: trip.id } : { _id: trip._id };
    await db.collection("trips").updateOne(query, {
      $set: { attractions: next, updatedAt: new Date().toISOString() },
    });
  }

  console.log(
    `[backfill-attraction-ids] trips=${tripsTouched} attractionsMissingId=${attractionsFilled} dryRun=${dryRun}`,
  );
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
