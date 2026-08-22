/**
 * Shared proposal-dedup for every ChangeSet create path (chat + background).
 *
 * Stable key = tripId + itemId (or placeId) + op type + normalized field set.
 * Not “any enrich on this trip.”
 */

import { buildIdQuery } from "../trip.service.js";

const PROPOSALS_COLLECTION = "ai_proposals";

export const REJECTED_DEDUP_MS = 7 * 24 * 60 * 60 * 1000;

const ENTITY_FIELD = {
  flight: "flights",
  hotel: "hotels",
  ride: "rides",
  attraction: "attractions",
};

const VOLATILE_AFTER_KEYS = new Set(["id", "createdAt", "updatedAt"]);

export function isBackgroundSource(source) {
  const s = String(source || "");
  return s === "agent" || s.startsWith("agent:");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function openingHoursShape(value) {
  if (!isPlainObject(value)) return value;
  const weekdayText = value.weekdayText || value.weekday_text;
  const periods = value.periods;
  const out = {};
  if (Array.isArray(weekdayText)) out.weekdayText = weekdayText;
  if (Array.isArray(periods)) out.periods = periods;
  return Object.keys(out).length ? out : value;
}

function normalizeScalar(value) {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Canonical JSON for after-values (ignores volatile keys, sorts keys). */
export function stableSerialize(value, key = "") {
  if (value == null) return "null";
  if (key === "openingHours") return stableSerialize(openingHoursShape(value), "");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(normalizeScalar(value));
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((k) => !VOLATILE_AFTER_KEYS.has(k) && value[k] != null)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(value[k], k)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stripVolatileAfter(after) {
  if (!isPlainObject(after)) return after || null;
  const out = {};
  for (const [k, v] of Object.entries(after)) {
    if (VOLATILE_AFTER_KEYS.has(k) || v == null) continue;
    out[k] = k === "openingHours" ? openingHoursShape(v) : v;
  }
  return out;
}

export function fieldSetKey(after) {
  return Object.keys(stripVolatileAfter(after) || {}).sort().join(",");
}

export function opAnchors(op) {
  const ids = new Set();
  if (!op) return ids;
  if (op.itemId) ids.add(String(op.itemId));
  const after = isPlainObject(op.after) ? op.after : {};
  const before = isPlainObject(op.before) ? op.before : {};
  if (after.placeId) ids.add(String(after.placeId));
  if (before.placeId) ids.add(String(before.placeId));
  if (op.op !== "add" && after.id) ids.add(String(after.id));
  if (before.id) ids.add(String(before.id));
  return ids;
}

export function primaryAnchor(op) {
  if (op?.itemId) return String(op.itemId);
  const after = isPlainObject(op?.after) ? op.after : {};
  const before = isPlainObject(op?.before) ? op.before : {};
  return after.placeId || before.placeId || (op?.op !== "add" ? after.id : null) || null;
}

function anchorsOverlap(a, b) {
  const left = opAnchors(a);
  if (left.size === 0) return false;
  for (const id of opAnchors(b)) {
    if (left.has(id)) return true;
  }
  return false;
}

export function valuesEqual(a, b, key = "") {
  return stableSerialize(a, key) === stableSerialize(b, key);
}

function itemFieldValue(item, key) {
  if (!item) return undefined;
  if (key === "location") return item.location ?? item.address;
  if (key === "address") return item.address ?? item.location;
  return item[key];
}

/**
 * Fields in `after` that are not already present on `current`
 * (item snapshot or a previous proposal's after).
 */
export function leftoverAfter(current, after) {
  const incoming = stripVolatileAfter(after);
  if (!incoming) return {};
  const leftover = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!valuesEqual(itemFieldValue(current, key), value, key)) leftover[key] = value;
  }
  return leftover;
}

/**
 * True when every non-volatile field in `after` already matches `current`
 * (item snapshot or a previous proposal's after).
 */
export function afterAlreadyPresent(current, after) {
  return Object.keys(leftoverAfter(current, after)).length === 0;
}

export function operationFingerprint(tripId, op) {
  const entity = op?.entity || "";
  const kind = op?.op || "";
  if (kind === "add" && !op?.itemId) {
    return `${tripId || ""}|${entity}|add|${stableSerialize(stripVolatileAfter(op.after))}`;
  }
  const item = primaryAnchor(op) || "?";
  const fields = fieldSetKey(op?.after);
  return `${tripId || ""}|${entity}|${kind}|${item}|${fields}`;
}

export function proposalDedupKey(tripId, operations = []) {
  return (operations || []).map((op) => operationFingerprint(tripId, op)).sort().join(";");
}

function findTripItem(trip, entity, anchors) {
  const field = ENTITY_FIELD[entity];
  if (!field || !trip || !anchors?.size) return null;
  return (
    (trip[field] || []).find((el) => {
      if (!el) return false;
      if (el.id && anchors.has(String(el.id))) return true;
      if (el._id != null && anchors.has(String(el._id))) return true;
      if (el.placeId && anchors.has(String(el.placeId))) return true;
      return false;
    }) || null
  );
}

function opsAreSameItemUpdate(existingOp, incomingOp) {
  if (!existingOp || !incomingOp) return false;
  if (existingOp.op !== incomingOp.op) return false;
  if (existingOp.entity !== incomingOp.entity) return false;
  if (incomingOp.op === "add") {
    return (
      operationFingerprint("", existingOp) === operationFingerprint("", incomingOp)
    );
  }
  return anchorsOverlap(existingOp, incomingOp);
}

function existingCoversIncoming(existing, incoming, trip = null) {
  const incomingOps = incoming.operations || [];
  if (incomingOps.length === 0) return false;
  return incomingOps.every((op) =>
    (existing.operations || []).some((existingOp) => {
      if (!opsAreSameItemUpdate(existingOp, op)) return false;
      if (op.op === "remove") return true;
      if (op.op === "add") return true;
      const item = trip ? findTripItem(trip, op.entity, opAnchors(op)) : null;
      const leftover = leftoverAfter(item, op.after);
      if (Object.keys(leftover).length === 0) return true;
      return afterAlreadyPresent(existingOp.after, leftover);
    }),
  );
}

function pendingBlocksIncoming(existing, incoming) {
  const incomingOps = incoming.operations || [];
  if (incomingOps.length === 0) return false;
  return incomingOps.every((op) =>
    (existing.operations || []).some((existingOp) => opsAreSameItemUpdate(existingOp, op)),
  );
}

function tripHasIncomingValues(trip, operations) {
  if (!trip) return false;
  const ops = operations || [];
  if (ops.length === 0) return false;
  return ops.every((op) => {
    if (op.entity === "trip") {
      if (op.op === "remove") return false;
      return afterAlreadyPresent(trip, op.after);
    }
    if (op.op === "add") {
      const field = ENTITY_FIELD[op.entity];
      if (!field) return false;
      const incoming = stripVolatileAfter(op.after);
      return (trip[field] || []).some((el) => afterAlreadyPresent(el, incoming));
    }
    if (op.op === "remove") return false;
    const item = findTripItem(trip, op.entity, opAnchors(op));
    return afterAlreadyPresent(item, op.after);
  });
}

async function findProposals(db, query, { sort, limit = 60 } = {}) {
  const cursor = db.collection(PROPOSALS_COLLECTION).find(query);
  if (sort && typeof cursor.sort === "function") cursor.sort(sort);
  if (typeof cursor.limit === "function") cursor.limit(limit);
  if (typeof cursor.toArray === "function") return cursor.toArray();
  return [];
}

async function loadTrip(db, tripId) {
  if (!db || !tripId) return null;
  try {
    return await db.collection("trips").findOne(buildIdQuery(tripId));
  } catch {
    return null;
  }
}

function logSkip(reason, { tripId, source, key, itemId }) {
  const item = itemId ? ` item=${itemId}` : "";
  console.log(
    `[proposalDedup] skip reason=${reason} trip=${tripId || "none"} source=${source || "unknown"}${item} key=${key}`,
  );
}

/**
 * @returns {Promise<{ reason: string, key: string, itemId?: string|null }|null>}
 */
export async function findSkipReason(db, {
  userId,
  tripId = null,
  operations = [],
  source = "chat",
  now = new Date(),
} = {}) {
  if (!db || !userId || !operations.length) return null;
  if (!tripId) return null;

  const key = proposalDedupKey(tripId, operations);
  const firstItem = primaryAnchor(operations[0]);

  const pending = await findProposals(db, { userId, tripId, status: "pending" }, {
    sort: { createdAt: -1 },
    limit: 80,
  });
  const pendingHit = pending.find((doc) => pendingBlocksIncoming(doc, { operations }));
  if (pendingHit) {
    return { reason: "pending_same_item", key, itemId: firstItem, existingId: pendingHit._id };
  }

  const trip = await loadTrip(db, tripId);
  if (tripHasIncomingValues(trip, operations)) {
    return { reason: "already_on_item", key, itemId: firstItem };
  }

  const applied = await findProposals(db, { userId, tripId, status: "applied" }, {
    sort: { appliedAt: -1, createdAt: -1 },
    limit: 60,
  });
  const appliedHit = applied.find((doc) => existingCoversIncoming(doc, { operations }, trip));
  if (appliedHit) {
    return { reason: "already_applied", key, itemId: firstItem, existingId: appliedHit._id };
  }

  if (isBackgroundSource(source)) {
    const since = new Date(now.getTime() - REJECTED_DEDUP_MS);
    const rejected = await findProposals(
      db,
      { userId, tripId, status: "rejected", rejectedAt: { $gte: since } },
      { sort: { rejectedAt: -1 }, limit: 60 },
    );
    const rejectedHit = rejected.find((doc) => existingCoversIncoming(doc, { operations }, trip));
    if (rejectedHit) {
      return { reason: "recently_rejected", key, itemId: firstItem, existingId: rejectedHit._id };
    }
  }

  return null;
}

/**
 * Cheap pre-Places check: a pending update already exists for this item
 * (any source — chat or background).
 */
export async function hasPendingItemProposal(db, { userId, tripId, itemId, entity = "attraction", op = "update" }) {
  if (!db || !userId || !tripId || !itemId) return false;
  const pending = await findProposals(db, { userId, tripId, status: "pending" }, {
    sort: { createdAt: -1 },
    limit: 80,
  });
  const probe = { op, entity, itemId, after: {}, before: {} };
  return pending.some((doc) =>
    (doc.operations || []).some((existingOp) => opsAreSameItemUpdate(existingOp, probe)),
  );
}

export async function skipDuplicateProposal(db, payload) {
  const skip = await findSkipReason(db, payload);
  if (skip) {
    logSkip(skip.reason, {
      tripId: payload.tripId,
      source: payload.source,
      key: skip.key,
      itemId: skip.itemId,
    });
  }
  return skip;
}
