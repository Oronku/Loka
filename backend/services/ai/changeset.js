import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import * as tripService from "../trip.service.js";
import { scheduleTimelineRebuild } from "../timelineService/rebuildTripTimeline.js";

export const PROPOSALS_COLLECTION = "ai_proposals";

/** entity name -> embedded array field on the trip document */
const ENTITY_FIELD = {
  flight: "flights",
  hotel: "hotels",
  ride: "rides",
  attraction: "attractions",
};

/** Placeholder tripId the assistant uses for items belonging to a not-yet-created trip. */
export const NEW_TRIP_REF = "__new__";

/**
 * @typedef {Object} ChangeOperation
 * @property {string} id
 * @property {'add'|'update'|'remove'} op
 * @property {'trip'|'flight'|'hotel'|'ride'|'attraction'} entity
 * @property {string|null} itemId  id of the embedded item (update/remove)
 * @property {object|null} before
 * @property {object|null} after
 * @property {string} label  human one-liner for the diff UI
 */

export function newOperation({ op, entity, itemId = null, before = null, after = null, label = "" }) {
  return { id: randomUUID(), op, entity, itemId, before, after, label };
}

/** Build a short human summary from a list of operations. */
export function summarizeOperations(operations = []) {
  const added = operations.filter((o) => o.op === "add").length;
  const updated = operations.filter((o) => o.op === "update").length;
  const removed = operations.filter((o) => o.op === "remove").length;
  const parts = [];
  if (added) parts.push(`+${added}`);
  if (updated) parts.push(`~${updated}`);
  if (removed) parts.push(`-${removed}`);
  return parts.join(" ") || "no changes";
}

/** Summary tuned for the diff card header (new-trip vs edit-trip). */
export function summarizeChangeSet(operations = [], { createsTrip = false, tripName = "" } = {}) {
  if (createsTrip) {
    const tripOp = operations.find((o) => o.entity === "trip" && o.op === "add");
    const name = tripName || tripOp?.after?.name || "New trip";
    const items = operations.filter((o) => o.entity !== "trip");
    if (items.length === 0) return name;
    return `${name} · ${items.length} item${items.length === 1 ? "" : "s"}`;
  }
  return summarizeOperations(operations);
}

/**
 * Persist a new ChangeSet (status: pending).
 * @returns {Promise<object>} the stored changeset with a string `_id`
 */
export async function createChangeSet(db, {
  tripId = null,
  tripName = "",
  createsTrip = false,
  chatId = null,
  messageId = null,
  userId,
  source = "chat",
  summary = "",
  rationale = "",
  operations = [],
  target = null,
}) {
  const doc = {
    tripId,
    tripName,
    createsTrip: !!createsTrip,
    chatId,
    messageId,
    userId,
    source,
    status: "pending",
    summary:
      summary ||
      summarizeChangeSet(operations, { createsTrip, tripName }),
    rationale,
    target: target || null,
    operations,
    createdAt: new Date(),
    appliedAt: null,
    rejectedAt: null,
  };
  const result = await db.collection(PROPOSALS_COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId.toString() };
}

export async function getChangeSet(db, id) {
  if (!ObjectId.isValid(id)) return null;
  const doc = await db.collection(PROPOSALS_COLLECTION).findOne({ _id: new ObjectId(id) });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString() };
}

function canonicalTripId(trip) {
  return trip?.id || trip?._id?.toString() || null;
}

async function pushItem(db, trip, entity, item) {
  const field = ENTITY_FIELD[entity];
  if (!field) return;
  await db.collection("trips").updateOne(tripService.buildIdQuery(canonicalTripId(trip)), {
    $push: { [field]: item },
    $set: { updatedAt: new Date().toISOString() },
  });
}

async function updateItem(db, trip, entity, itemId, changes) {
  const field = ENTITY_FIELD[entity];
  if (!field || !itemId) return;
  const setFields = {};
  for (const [k, v] of Object.entries(changes || {})) {
    if (k === "id") continue;
    setFields[`${field}.$[el].${k}`] = v;
  }
  if (Object.keys(setFields).length === 0) return;
  setFields.updatedAt = new Date().toISOString();
  await db.collection("trips").updateOne(
    tripService.buildIdQuery(canonicalTripId(trip)),
    { $set: setFields },
    { arrayFilters: [{ "el.id": itemId }] },
  );
}

async function removeItem(db, trip, entity, itemId) {
  const field = ENTITY_FIELD[entity];
  if (!field || !itemId) return;
  await db.collection("trips").updateOne(tripService.buildIdQuery(canonicalTripId(trip)), {
    $pull: { [field]: { id: itemId } },
    $set: { updatedAt: new Date().toISOString() },
  });
}

/**
 * Apply a pending ChangeSet to the database. Creates the trip first if the
 * changeset contains a `trip` add op, then applies every embedded-item op,
 * then schedules a timeline rebuild. Idempotent-ish: refuses to re-apply.
 *
 * @param {object} db
 * @param {string} id changeset id
 * @param {{ id: string, email: string, name?: string }} user
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, trip?: object, changeSet?: object }>}
 */
export async function applyChangeSet(db, id, user) {
  const changeSet = await getChangeSet(db, id);
  if (!changeSet) return { ok: false, status: 404, error: "Proposal not found" };
  if (changeSet.userId !== user.id) return { ok: false, status: 403, error: "Not your proposal" };
  if (changeSet.status !== "pending") {
    return { ok: false, status: 409, error: `Proposal already ${changeSet.status}` };
  }

  // 1. Resolve (or create) the target trip.
  let trip = null;
  const createOp = changeSet.operations.find((o) => o.entity === "trip" && o.op === "add");
  if (createOp) {
    const data = createOp.after || {};
    trip = await tripService.createTrip(
      {
        name: data.name || `Trip to ${data.destination || "somewhere"}`,
        destination: data.destination,
        destinations: data.destinations ||
          (data.destination
            ? [{ name: data.destination, startDate: data.startDate, endDate: data.endDate }]
            : []),
        startDate: data.startDate,
        endDate: data.endDate,
      },
      { id: user.id, email: user.email, name: user.name },
    );
  } else if (changeSet.tripId) {
    trip = await tripService.findById(changeSet.tripId);
  }

  if (!trip && !createOp) {
    return { ok: false, status: 404, error: "Target trip not found" };
  }

  // 2. Apply each embedded-item operation in order.
  for (const op of changeSet.operations) {
    if (op.entity === "trip") continue; // already handled
    if (!trip) continue;
    if (op.op === "add") await pushItem(db, trip, op.entity, op.after);
    else if (op.op === "update") await updateItem(db, trip, op.entity, op.itemId, op.after);
    else if (op.op === "remove") await removeItem(db, trip, op.entity, op.itemId);
  }

  // 3. Mark applied and reload the fresh trip.
  const tripId = canonicalTripId(trip);
  await db.collection(PROPOSALS_COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "applied", appliedAt: new Date(), tripId } },
  );

  if (tripId) scheduleTimelineRebuild(tripId);

  const fresh = tripId ? tripService.normalizeDocument(await tripService.findById(tripId)) : trip;
  return {
    ok: true,
    trip: fresh,
    changeSet: { ...changeSet, status: "applied", tripId },
  };
}

export async function rejectChangeSet(db, id, userId) {
  const changeSet = await getChangeSet(db, id);
  if (!changeSet) return { ok: false, status: 404, error: "Proposal not found" };
  if (changeSet.userId !== userId) return { ok: false, status: 403, error: "Not your proposal" };
  if (changeSet.status !== "pending") {
    return { ok: false, status: 409, error: `Proposal already ${changeSet.status}` };
  }
  await db.collection(PROPOSALS_COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "rejected", rejectedAt: new Date() } },
  );
  return { ok: true, changeSet: { ...changeSet, status: "rejected" } };
}
