/** Sentinel for criteria values Loka has not yet inferred or learned. */
export const UNKNOWN = "__LOKA_UNKNOWN__";

export const DEFAULT_SEARCH_BUDGET = 3;

export const MIN_CANDIDATES = 3;
export const MAX_CANDIDATES = 6;

/** @typedef {'hard'|'soft'} CriterionKind */
/** @typedef {'intent'|'profile'|'axis_decision'|'trip_data'|'inferred'} CriterionSource */
/** @typedef {'pass'|'fail'|'unknown'} ScoreVerdict */
/** @typedef {'high'|'medium'|'low'} DeliberationConfidence */
/** @typedef {'user_idea'|'places_cache'|'places_lookup'|'web_search'} CandidateOrigin */

/**
 * @typedef {Object} Criterion
 * @property {string} id
 * @property {string} label
 * @property {CriterionKind} kind
 * @property {number} weight
 * @property {unknown} value known value or UNKNOWN
 * @property {CriterionSource} source
 */

/**
 * @typedef {Object} Candidate
 * @property {string} id
 * @property {string} name
 * @property {string} [placeId]
 * @property {string} [area]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {number} [priceLevel]
 * @property {number|string} [price]
 * @property {string} [currency]
 * @property {number} [rating]
 * @property {number} [reviewCount]
 * @property {object} [openingHours]
 * @property {string} [website]
 * @property {string} [bookingUrl]
 * @property {boolean} [bookingRequired]
 * @property {number} [bookingLeadDays]
 * @property {Record<string, unknown>} attributes
 * @property {CandidateOrigin} origin
 * @property {string} [sourceUrl]
 */

/**
 * @typedef {Object} ScoreEntry
 * @property {string} candidateId
 * @property {string} criterionId
 * @property {ScoreVerdict} verdict
 * @property {string} evidence
 * @property {string} [sourceUrl]
 */

/**
 * @typedef {Object} RankedCandidate
 * @property {string} candidateId
 * @property {number} score
 * @property {boolean} eliminated
 * @property {string} reason
 */

/**
 * @typedef {Object} DeliberationSlot
 * @property {string} slotId
 * @property {string} axisId
 * @property {string} label
 * @property {string} [query]
 * @property {string} [scheduledDate] YYYY-MM-DD
 * @property {string} [scheduledTime] HH:MM
 * @property {string} [field] resolves via question/decision
 * @property {string[]} [ideaIds] trip attraction ids tied to this slot
 */

export function isUnknown(value) {
  return value === UNKNOWN;
}

/** Budget level → approximate per-activity ceiling in USD. */
export const BUDGET_CEILINGS = {
  budget: 40,
  moderate: 80,
  comfortable: 150,
  splurge: 300,
};
