import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import * as tripService from "../trip.service.js";
import { scheduleTimelineRebuild } from "../timeline/index.js";
import { skipDuplicateProposal } from "./proposalDedup.js";

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
  const tripDelete = operations.find((o) => o.entity === "trip" && o.op === "remove");
  if (tripDelete) return `Delete ${tripName || tripDelete.before?.name || "trip"}`;
  const tripUpdate = operations.find((o) => o.entity === "trip" && o.op === "update");
  if (tripUpdate) return `Update ${tripName || tripUpdate.before?.name || "trip"}`;
  return summarizeOperations(operations);
}

/**
 * Persist a new ChangeSet (status: pending).
 * Skips (returns null) when an equivalent proposal is already pending,
 * already applied / present on the item, or — for background sources —
 * recently rejected. Logs a short server-side reason; never user-facing.
 *
 * @returns {Promise<object|null>} the stored changeset with a string `_id`, or null if skipped
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
  skipDedup = false,
  now = new Date(),
}) {
  if (!skipDedup && operations.length > 0) {
    const skip = await skipDuplicateProposal(db, {
      userId,
      tripId,
      operations,
      source,
      now,
    });
    if (skip) return null;
  }

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

function ensureItemId(item) {
  const payload = item && typeof item === "object" ? item : {};
  if (!payload.id) payload.id = randomUUID();
  return payload;
}

function itemExistsOnTrip(trip, entity, itemId) {
  const field = ENTITY_FIELD[entity];
  if (!field || !itemId) return false;
  return (trip?.[field] || []).some((el) => el && el.id === itemId);
}

/** @returns {{ matched: number, modified: number }} */
async function pushItem(db, trip, entity, item) {
  const field = ENTITY_FIELD[entity];
  if (!field) return { matched: 0, modified: 0 };
  const payload = ensureItemId(item);
  const result = await db.collection("trips").updateOne(tripService.buildIdQuery(canonicalTripId(trip)), {
    $push: { [field]: payload },
    $set: { updatedAt: new Date().toISOString() },
  });
  return { matched: result.matchedCount ?? 0, modified: result.modifiedCount ?? 0 };
}

/**
 * Query includes the embedded item id so matchedCount is 0 when no element matches.
 * @returns {{ matched: number, modified: number }}
 */
async function updateItem(db, trip, entity, itemId, changes) {
  const field = ENTITY_FIELD[entity];
  if (!field || !itemId) return { matched: 0, modified: 0 };
  const setFields = {};
  for (const [k, v] of Object.entries(changes || {})) {
    if (k === "id") continue;
    setFields[`${field}.$[el].${k}`] = v;
  }
  setFields.updatedAt = new Date().toISOString();
  const result = await db.collection("trips").updateOne(
    { ...tripService.buildIdQuery(canonicalTripId(trip)), [`${field}.id`]: itemId },
    { $set: setFields },
    { arrayFilters: [{ "el.id": itemId }] },
  );
  return { matched: result.matchedCount ?? 0, modified: result.modifiedCount ?? 0 };
}

/**
 * @returns {{ matched: number, modified: number }}
 */
async function removeItem(db, trip, entity, itemId) {
  const field = ENTITY_FIELD[entity];
  if (!field || !itemId) return { matched: 0, modified: 0 };
  const result = await db.collection("trips").updateOne(
    { ...tripService.buildIdQuery(canonicalTripId(trip)), [`${field}.id`]: itemId },
    {
      $pull: { [field]: { id: itemId } },
      $set: { updatedAt: new Date().toISOString() },
    },
  );
  return { matched: result.matchedCount ?? 0, modified: result.modifiedCount ?? 0 };
}

/** @returns {string[]} operation ids that cannot match a row */
function preflightFailedOps(trip, operations) {
  const added = new Set();
  const failed = [];
  for (const op of operations || []) {
    if (!op || op.entity === "trip") continue;
    if (!ENTITY_FIELD[op.entity]) continue;
    if (op.op === "add") {
      const payload = ensureItemId(op.after);
      op.after = payload;
      if (payload.id) added.add(`${op.entity}:${payload.id}`);
      continue;
    }
    if (op.op !== "update" && op.op !== "remove") continue;
    const exists =
      itemExistsOnTrip(trip, op.entity, op.itemId) ||
      (op.itemId && added.has(`${op.entity}:${op.itemId}`));
    if (!exists) failed.push(op.id);
  }
  return failed;
}

/**
 * Apply a pending ChangeSet to the database. Creates the trip first if the
 * changeset contains a `trip` add op, then applies every embedded-item op,
 * then schedules a timeline rebuild. Idempotent-ish: refuses to re-apply.
 *
 * @param {object} db
 * @param {string} id changeset id
 * @param {{ id: string, email: string, name?: string }} user
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, code?: string, failedOps?: string[], trip?: object, changeSet?: object, deleted?: boolean }>}
 */
export async function applyChangeSet(db, id, user) {
  const changeSet = await getChangeSet(db, id);
  if (!changeSet) return { ok: false, status: 404, error: "Proposal not found" };
  if (changeSet.userId !== user.id) return { ok: false, status: 403, error: "Not your proposal" };
  if (changeSet.status !== "pending") {
    return { ok: false, status: 409, error: `Proposal already ${changeSet.status}` };
  }

  const deleteTripOp = changeSet.operations.find((o) => o.entity === "trip" && o.op === "remove");
  if (deleteTripOp) {
    const tripId = changeSet.tripId;
    if (!tripId) return { ok: false, status: 404, error: "Target trip not found" };
    const existing = await tripService.findById(tripId);
    if (!existing) return { ok: false, status: 404, error: "Target trip not found" };
    if (!tripService.isOwner(existing, user.id)) {
      return { ok: false, status: 403, error: "Only trip owner can delete" };
    }
    await tripService.deleteById(tripId);
    await db.collection(PROPOSALS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "applied", appliedAt: new Date(), tripId } },
    );
    return {
      ok: true,
      deleted: true,
      trip: null,
      changeSet: { ...changeSet, status: "applied", tripId },
    };
  }

  const updateTripOp = changeSet.operations.find((o) => o.entity === "trip" && o.op === "update");

  // 1. Resolve (or create) the target trip.
  let trip = null;
  const createOp = changeSet.operations.find((o) => o.entity === "trip" && o.op === "add");
  if (!createOp && changeSet.tripId) {
    trip = await tripService.findById(changeSet.tripId);
  }

  if (!trip && !createOp) {
    return { ok: false, status: 404, error: "Target trip not found" };
  }

  const noOpIds = preflightFailedOps(trip, changeSet.operations);
  if (noOpIds.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Nothing was written — an item in this change is no longer on the trip.",
      code: "APPLY_NO_OP",
      failedOps: noOpIds,
    };
  }

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
  }

  if (updateTripOp && trip) {
    const access = tripService.getAccess(trip, user.id);
    if (!access.canEdit) {
      return { ok: false, status: 403, error: "You cannot edit this trip" };
    }
    const updateData = tripService.sanitizeUpdatePayload(updateTripOp.after || {}, access);
    await db.collection("trips").updateOne(tripService.buildIdQuery(canonicalTripId(trip)), {
      $set: updateData,
    });
    trip = await tripService.findById(canonicalTripId(trip));
  }

  const hasEmbeddedOps = changeSet.operations.some(
    (o) => o.entity !== "trip" && ENTITY_FIELD[o.entity],
  );
  if (trip && hasEmbeddedOps && !tripService.canEdit(trip, user.id)) {
    return { ok: false, status: 403, error: "You cannot edit this trip" };
  }

  // 2. Apply each embedded-item operation in order.
  const failedOps = [];
  for (const op of changeSet.operations) {
    if (op.entity === "trip") continue; // already handled
    if (!trip) continue;
    if (!ENTITY_FIELD[op.entity]) continue;
    let write = { matched: 1, modified: 0 };
    if (op.op === "add") write = await pushItem(db, trip, op.entity, op.after);
    else if (op.op === "update") write = await updateItem(db, trip, op.entity, op.itemId, op.after);
    else if (op.op === "remove") write = await removeItem(db, trip, op.entity, op.itemId);
    if ((op.op === "add" || op.op === "update" || op.op === "remove") && write.matched === 0) {
      failedOps.push(op.id);
    }
  }

  if (failedOps.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Nothing was written — an item in this change is no longer on the trip.",
      code: "APPLY_NO_OP",
      failedOps,
    };
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
