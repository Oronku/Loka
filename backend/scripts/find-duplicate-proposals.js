/**
 * Read-only listing of duplicate / stacked ChangeSets.
 * Defaults to dry-run. Writes are not implemented.
 *
 *   node scripts/find-duplicate-proposals.js
 *   node scripts/find-duplicate-proposals.js --tripId=c875d81e-4c15-4acf-a3e2-17a78a2e4b15
 *   node scripts/find-duplicate-proposals.js --apply   # refused — lists only
 */
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";
import {
  fieldSetKey,
  primaryAnchor,
  proposalDedupKey,
} from "../services/ai/proposalDedup.js";

const BUDAPEST_TRIP_ID = "c875d81e-4c15-4acf-a3e2-17a78a2e4b15";

function argValue(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function itemLabel(doc) {
  const op = (doc.operations || [])[0];
  if (!op) return "";
  return (
    op.label ||
    op.after?.name ||
    op.before?.name ||
    primaryAnchor(op) ||
    ""
  );
}

function clusterDocs(docs, keyFn) {
  const groups = new Map();
  for (const doc of docs) {
    const key = keyFn(doc);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, items }))
    .filter((g) => g.items.length > 1)
    .sort((a, b) => b.items.length - a.items.length);
}

function printCluster(title, cluster) {
  console.log(`\n${title} (${cluster.items.length})`);
  console.log(`  key: ${cluster.key}`);
  for (const doc of cluster.items) {
    const id = doc._id?.toString?.() || doc._id;
    const after = (doc.operations || [])
      .map((op) => `${op.op} ${op.entity} ${op.itemId || ""} [${fieldSetKey(op.after)}]`)
      .join("; ");
    console.log(
      `  - ${id}  status=${doc.status}  source=${doc.source || "?"}  ${itemLabel(doc)}  ${after}`,
    );
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tripIdFilter = argValue("--tripId=") || null;
  const db = await connectToDatabase();

  const query = {};
  if (tripIdFilter) query.tripId = tripIdFilter;

  const all = await db.collection("ai_proposals").find(query).sort({ createdAt: -1 }).toArray();
  const pending = all.filter((d) => d.status === "pending");

  const byTrip = new Map();
  for (const doc of pending) {
    const tripId = doc.tripId || "(none)";
    if (!byTrip.has(tripId)) byTrip.set(tripId, []);
    byTrip.get(tripId).push(doc);
  }

  const busyTrips = [...byTrip.entries()]
    .map(([tripId, items]) => ({
      tripId,
      tripName: items[0]?.tripName || "",
      pending: items.length,
    }))
    .sort((a, b) => b.pending - a.pending);

  console.log(`[find-duplicate-proposals] total=${all.length} pending=${pending.length} dryRun=true`);
  if (tripIdFilter) console.log(`filter tripId=${tripIdFilter}`);

  console.log("\nTrips with the most pending cards:");
  for (const row of busyTrips.slice(0, 12)) {
    console.log(`  ${row.pending}  ${row.tripId}  ${row.tripName}`);
  }

  const focusIds = tripIdFilter
    ? [tripIdFilter]
    : [BUDAPEST_TRIP_ID, ...busyTrips.slice(0, 5).map((t) => t.tripId)].filter(
        (id, i, arr) => arr.indexOf(id) === i,
      );

  for (const tripId of focusIds) {
    const docs = all.filter((d) => d.tripId === tripId);
    if (docs.length === 0) {
      console.log(`\n=== ${tripId} — no proposals ===`);
      continue;
    }
    const name = docs[0]?.tripName || "";
    const pendingCount = docs.filter((d) => d.status === "pending").length;
    console.log(`\n=== ${tripId}  ${name}  (all=${docs.length} pending=${pendingCount}) ===`);

    const strict = clusterDocs(docs.filter((d) => d.status === "pending"), (d) =>
      proposalDedupKey(d.tripId, d.operations),
    );
    const sameItem = clusterDocs(docs.filter((d) => d.status === "pending"), (d) => {
      const op = (d.operations || [])[0];
      if (!op) return null;
      const item = primaryAnchor(op);
      if (!item) return `${d.tripId}|${op.entity}|${op.op}|add-fingerprint`;
      return `${d.tripId}|${op.entity}|${op.op}|${item}`;
    });

    if (strict.length === 0 && sameItem.length === 0) {
      console.log("  no duplicate clusters");
      continue;
    }
    for (const c of strict) printCluster("strict fingerprint", c);
    for (const c of sameItem) {
      if (strict.some((s) => s.items.every((item) => c.items.includes(item)) && s.items.length === c.items.length)) {
        continue;
      }
      printCluster("same item + op (pending stack)", c);
    }
  }

  if (apply) {
    console.log("\n[--apply] writes are not implemented; this script only lists clusters.");
  }

  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
