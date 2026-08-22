/**
 * One-off: assign `id` on trip checklist items that lack one.
 * Covers the shared packing list (`trips.checklist[]`) and personal lists
 * (`trips.userChecklists[].checklist[]`, including nested category items).
 * Reuses the subdocument `_id` as a string when present, otherwise a uuid.
 * Idempotent. Defaults to dry-run.
 *
 *   node scripts/backfill-checklist-ids.js
 *   node scripts/backfill-checklist-ids.js --dry-run
 *   node scripts/backfill-checklist-ids.js --apply
 */
import { randomUUID } from "crypto";
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";

function resolveItemId(item) {
  if (item?.id) return String(item.id);
  if (item?._id != null) return String(item._id);
  return randomUUID();
}

function withId(item) {
  if (!item || typeof item !== "object" || item.id) return item;
  return { ...item, id: resolveItemId(item) };
}

function fillCategoryShaped(entries) {
  if (!Array.isArray(entries)) return { next: entries, filled: 0 };
  let filled = 0;
  const next = entries.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    let category = entry;
    if (!category.id) {
      category = withId(category);
      filled += 1;
    }
    if (!Array.isArray(category.items)) return category;
    const items = category.items.map((item) => {
      if (!item || item.id) return item;
      filled += 1;
      return withId(item);
    });
    return { ...category, items };
  });
  return { next, filled };
}

function fillFlatOrNested(list) {
  if (!Array.isArray(list)) return { next: list, filled: 0 };
  const looksNested = list.some((item) => item && Array.isArray(item.items));
  if (looksNested) return fillCategoryShaped(list);
  let filled = 0;
  const next = list.map((item) => {
    if (!item || item.id) return item;
    filled += 1;
    return withId(item);
  });
  return { next, filled };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const db = await connectToDatabase();
  const trips = await db
    .collection("trips")
    .find({
      $or: [
        { "checklist.0": { $exists: true } },
        { "userChecklists.0": { $exists: true } },
      ],
    })
    .toArray();

  let tripsTouched = 0;
  let itemsFilled = 0;

  for (const trip of trips) {
    const shared = fillFlatOrNested(trip.checklist);
    let personalFilled = 0;
    const userChecklists = Array.isArray(trip.userChecklists)
      ? trip.userChecklists.map((entry) => {
          const filled = fillFlatOrNested(entry?.checklist);
          personalFilled += filled.filled;
          return { ...entry, checklist: filled.next };
        })
      : trip.userChecklists;

    const filled = shared.filled + personalFilled;
    if (filled === 0) continue;
    tripsTouched += 1;
    itemsFilled += filled;
    if (dryRun) continue;
    const query = trip.id ? { id: trip.id } : { _id: trip._id };
    const $set = { updatedAt: new Date().toISOString() };
    if (Array.isArray(trip.checklist)) $set.checklist = shared.next;
    if (Array.isArray(trip.userChecklists)) $set.userChecklists = userChecklists;
    await db.collection("trips").updateOne(query, { $set });
  }

  console.log(
    `[backfill-checklist-ids] trips=${tripsTouched} itemsMissingId=${itemsFilled} dryRun=${dryRun}`,
  );
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
