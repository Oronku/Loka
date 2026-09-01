/** @typedef {import('../integrity/types.js').Finding} Finding */
/** @typedef {import('../deliberation/constants.js').DeliberationSlot} DeliberationSlot */

/**
 * @typedef {Object} ResolverContext
 * @property {import('mongodb').Db} db
 * @property {string} tripId
 * @property {string} userId
 * @property {object} trip
 * @property {object[]} axes
 * @property {object|null} profile
 * @property {Date} now
 * @property {number} searchBudgetRemaining
 * @property {(query: string, opts?: object) => Promise<{ ok: boolean, text: string, citations: object[] }>} [search]
 * @property {(name: string, cityContext?: string|null, db?: import('mongodb').Db|null) => Promise<object|null>} [places]
 * @property {(input: object) => Promise<object>} [llm]
 */

/**
 * @typedef {Object} DeliberationOutcome
 * @property {object[]} decisions
 * @property {object[]} questions
 * @property {object[]} blocked
 * @property {number} searchesUsed
 */

/**
 * @typedef {Object} Resolution
 * @property {Finding} finding
 * @property {'proposed'|'question'|'blocked'|'verify'|'unhandled'} kind
 * @property {object[]} [operations]
 * @property {object[]} [questions]
 * @property {string} [reasoning]
 * @property {string} [blockedWhy]
 * @property {object} [decision]
 * @property {object} [verifyTask]
 * @property {object[]} [alternatives]
 */

/**
 * @typedef {Object} Resolver
 * @property {string[]} codes
 * @property {(finding: Finding, ctx: ResolverContext) => DeliberationSlot[]} buildSlots
 * @property {(finding: Finding, result: DeliberationOutcome, ctx: ResolverContext) => Resolution} interpret
 * @property {(finding: Finding, ctx: ResolverContext) => Resolution|null} [resolveDirect]
 */

export const SKIP_DELIBERATION_KINDS = new Set(["ask_user", "user_action_required"]);

export const MAX_QUESTIONS_PER_PASS = 3;
