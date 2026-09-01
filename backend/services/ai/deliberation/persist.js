import {
  AI_DELIBERATIONS_COLLECTION,
  buildDeliberationDocument,
} from "../../../models/aiDeliberation.helper.js";
import { recordDecision } from "../axisMemory.js";

/**
 * @param {import('mongodb').Db} db
 * @param {string} tripId
 * @param {string} slotId
 */
export async function getLatestDeliberation(db, tripId, slotId) {
  if (!db) return null;
  return db
    .collection(AI_DELIBERATIONS_COLLECTION)
    .find({ tripId, slotId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray()
    .then((rows) => rows[0] || null);
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} record
 */
export async function saveDeliberation(db, record) {
  if (!db) return null;
  const doc = buildDeliberationDocument(record);
  await db.collection(AI_DELIBERATIONS_COLLECTION).insertOne(doc);
  return doc;
}

/**
 * Persist a resolved choice onto the axis memory.
 * @param {import('mongodb').Db} db
 * @param {object} params
 */
export async function persistAxisDecision(db, {
  tripId,
  userId,
  axisId,
  chosen,
  why,
  rejected,
  field,
  confidence = 0.85,
}) {
  if (!chosen) return null;
  return recordDecision(db, {
    tripId,
    userId,
    axisId,
    decision: chosen.name,
    why,
    rejected,
    source: "agent_inference",
    confidence,
    field: field || null,
  });
}
