/**
 * MongoDB collection `ai_deliberations` stores Loka's deliberation audit trail
 * per trip slot — criteria, candidates, scorecard, ranking, questions, and choice.
 */

export const AI_DELIBERATIONS_COLLECTION = "ai_deliberations";

/**
 * @typedef {Object} DeliberationRecord
 * @property {string} tripId
 * @property {string} userId
 * @property {string} slotId
 * @property {string} axisId
 * @property {object[]} criteria
 * @property {object[]} candidates
 * @property {object[]} scorecard
 * @property {object[]} ranking
 * @property {object[]} [questions]
 * @property {object|null} [chosen]
 * @property {string} [confidence]
 * @property {string} [reasoning]
 * @property {{ option: string, why: string }[]} [rejected]
 * @property {number} searchesUsed
 * @property {Date} createdAt
 */

/**
 * @param {Object} params
 * @param {string} params.tripId
 * @param {string} params.userId
 * @param {string} params.slotId
 * @param {string} params.axisId
 * @param {object[]} params.criteria
 * @param {object[]} params.candidates
 * @param {object[]} params.scorecard
 * @param {object[]} params.ranking
 * @param {object[]} [params.questions]
 * @param {object|null} [params.chosen]
 * @param {string} [params.confidence]
 * @param {string} [params.reasoning]
 * @param {{ option: string, why: string }[]} [params.rejected]
 * @param {number} [params.searchesUsed]
 * @param {Date} [params.createdAt]
 * @returns {DeliberationRecord}
 */
export function buildDeliberationDocument({
  tripId,
  userId,
  slotId,
  axisId,
  criteria,
  candidates,
  scorecard,
  ranking,
  questions = [],
  chosen = null,
  confidence = "low",
  reasoning = "",
  rejected = [],
  searchesUsed = 0,
  createdAt = new Date(),
}) {
  return {
    tripId,
    userId,
    slotId,
    axisId,
    criteria,
    candidates,
    scorecard,
    ranking,
    questions,
    chosen,
    confidence,
    reasoning,
    rejected,
    searchesUsed,
    createdAt,
  };
}
