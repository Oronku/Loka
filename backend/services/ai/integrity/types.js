import { randomUUID } from "crypto";

/** @typedef {'broken'|'at_risk'|'unknown'} FindingKind */
/** @typedef {1|2|3} FindingSeverity */
/** @typedef {'propose_change'|'verify_fact'|'ask_user'|'user_action_required'} ResolutionKind */

/**
 * @typedef {Object} FindingEvidence
 * @property {string} what
 * @property {unknown} value
 * @property {string} source
 * @property {string} [sourceUrl]
 */

/**
 * @typedef {Object} FindingEntity
 * @property {string} entity
 * @property {string} [itemId]
 */

/**
 * @typedef {Object} FindingResolution
 * @property {ResolutionKind} kind
 * @property {string} hint
 */

/**
 * @typedef {Object} Finding
 * @property {string} id
 * @property {string} code
 * @property {string[]} axisIds
 * @property {FindingKind} kind
 * @property {FindingSeverity} severity
 * @property {boolean} blocking
 * @property {string|null} deadline
 * @property {number} urgency
 * @property {string} title
 * @property {string} detail
 * @property {string} titleKey
 * @property {string} detailKey
 * @property {Record<string, unknown>} titleParams
 * @property {Record<string, unknown>} detailParams
 * @property {FindingEvidence[]} evidence
 * @property {FindingEntity[]} entities
 * @property {FindingResolution} resolution
 */

/** @param {string} key @param {Record<string, unknown>} [params] */
export function loc(key, params = {}) {
  return { key, params };
}

/**
 * @param {Object} partial
 * @returns {Omit<Finding, 'urgency'>}
 */
export function buildFinding(partial) {
  const {
    code,
    axisIds,
    kind,
    severity,
    blocking = false,
    deadline = null,
    title,
    detail,
    titleKey,
    detailKey,
    titleParams = {},
    detailParams = {},
    evidence = [],
    entities = [],
    resolution,
  } = partial;

  return {
    id: randomUUID(),
    code,
    axisIds,
    kind,
    severity,
    blocking,
    deadline,
    title,
    detail,
    titleKey,
    detailKey,
    titleParams,
    detailParams,
    evidence,
    entities,
    resolution,
  };
}
