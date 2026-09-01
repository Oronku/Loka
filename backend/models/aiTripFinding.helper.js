/**
 * MongoDB collection `ai_trip_findings` stores point-in-time integrity assessment
 * snapshots keyed by `{ tripId, generatedAt }` for tracking when findings first
 * appeared and when they were resolved.
 */

export const TRIP_FINDINGS_COLLECTION = "ai_trip_findings";

/**
 * @typedef {Object} TripFindingSnapshot
 * @property {string} tripId
 * @property {string} generatedAt ISO timestamp — matches assessTripIntegrity output
 * @property {object[]} findings Full Finding[] at snapshot time
 * @property {object} summary brokenCount, atRiskCount, unknownCount, nextDeadline
 * @property {Date} createdAt
 */

/**
 * @param {Object} params
 * @param {string} params.tripId
 * @param {string} params.generatedAt
 * @param {object[]} params.findings
 * @param {object} params.summary
 * @returns {TripFindingSnapshot}
 */
export function buildTripFindingDocument({ tripId, generatedAt, findings, summary }) {
  const now = new Date();
  return {
    tripId,
    generatedAt,
    findings: Array.isArray(findings) ? findings : [],
    summary: summary || {
      brokenCount: 0,
      atRiskCount: 0,
      unknownCount: 0,
      nextDeadline: null,
    },
    createdAt: now,
  };
}
