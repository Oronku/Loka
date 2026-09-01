/**
 * MongoDB collection `ai_trip_axes` stores Loka's durable working notes per trip
 * planning dimension. One document per `{ tripId, axisId }`.
 */

import { CATEGORY_ORDER } from "../services/trip/readiness.js";

export const TRIP_AXES_COLLECTION = "ai_trip_axes";

export const READINESS_AXIS_CHAR_LIMIT = 1200;
export const CUSTOM_AXIS_CHAR_LIMIT = 800;

const READINESS_AXIS_IDS = new Set(CATEGORY_ORDER);

/**
 * @typedef {'readiness'|'custom'} AxisKind
 * @typedef {'idle'|'working'|'blocked'|'settled'} AxisStatus
 * @typedef {'user_answer'|'user_message'|'agent_inference'} DecisionSource
 * @typedef {'open'|'resolved'|'superseded'} GapStatus
 * @typedef {'preference'|'verification'|'other'} GapKind
 *
 * @typedef {Object} AxisDecision
 * @property {string} id
 * @property {string} decision
 * @property {string} [why]
 * @property {{ option: string, why: string }[]} [rejected]
 * @property {DecisionSource} source
 * @property {number} [confidence]
 * @property {Date} at
 *
 * @typedef {Object} AxisFact
 * @property {string} id
 * @property {string} key
 * @property {string} value
 * @property {string} source
 * @property {Date|null} [validUntil]
 * @property {Date} at
 *
 * @typedef {Object} AxisGap
 * @property {string} id
 * @property {string} field
 * @property {1|2|3} severity
 * @property {string[]} [blocks]
 * @property {string} [evidence]
 * @property {GapKind} [kind]
 * @property {GapStatus} status
 * @property {number} [askedCount]
 * @property {Date|null} [lastAskedAt]
 * @property {string|null} [resolvedByQuestionId]
 *
 * @typedef {Object} TripAxis
 * @property {string} tripId
 * @property {string} userId
 * @property {string} axisId
 * @property {AxisKind} kind
 * @property {string} title
 * @property {string} [description]
 * @property {string} note
 * @property {number} charLimit
 * @property {string} summary
 * @property {AxisDecision[]} decisions
 * @property {AxisFact[]} facts
 * @property {AxisGap[]} gaps
 * @property {AxisStatus} status
 * @property {Date} lastTouchedAt
 * @property {Date} updatedAt
 * @property {Date} createdAt
 * @property {number} version
 */

/**
 * Resolve gap kind for gating and display. Legacy rows without `kind` infer from field.
 * @param {AxisGap} gap
 * @returns {GapKind}
 */
export function resolveGapKind(gap) {
  if (gap.kind === "preference" || gap.kind === "verification" || gap.kind === "other") {
    return gap.kind;
  }
  if (typeof gap.field === "string" && gap.field.startsWith("verify:")) {
    return "verification";
  }
  return "preference";
}

/** @param {string} axisId */
export function isCustomAxisId(axisId) {
  return typeof axisId === "string" && axisId.startsWith("custom:");
}

/** @param {string} axisId */
export function isReadinessAxisId(axisId) {
  return READINESS_AXIS_IDS.has(axisId);
}

/** @param {string} title */
export function customAxisIdFromTitle(title) {
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `custom:${slug}` : `custom:${Date.now()}`;
}

/**
 * @param {Object} params
 * @param {string} params.tripId
 * @param {string} params.userId
 * @param {string} params.axisId
 * @param {AxisKind} [params.kind]
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @param {string} [params.note]
 * @param {string} [params.summary]
 * @param {AxisStatus} [params.status]
 */
export function buildTripAxisDocument({
  tripId,
  userId,
  axisId,
  kind = "readiness",
  title = "",
  description = "",
  note = "",
  summary = "",
  status = "idle",
}) {
  const now = new Date();
  const resolvedKind = isCustomAxisId(axisId) ? "custom" : kind;
  const charLimit =
    resolvedKind === "custom" ? CUSTOM_AXIS_CHAR_LIMIT : READINESS_AXIS_CHAR_LIMIT;

  return {
    tripId,
    userId,
    axisId,
    kind: resolvedKind,
    title: title || axisId,
    description: description || "",
    note: note || "",
    charLimit,
    summary: summary || "",
    decisions: [],
    facts: [],
    gaps: [],
    status,
    lastTouchedAt: now,
    updatedAt: now,
    createdAt: now,
    version: 1,
  };
}
