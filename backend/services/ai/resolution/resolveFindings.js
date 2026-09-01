import { deliberate } from "../deliberation/deliberate.js";
import { DEFAULT_SEARCH_BUDGET } from "../deliberation/constants.js";
import { hasPendingQuestionSet, sanitizeQuestionSet } from "../questions.js";
import { resolverForCode } from "./registry.js";
import { localDeliberate } from "./localDeliberate.js";
import { tripWithSyntheticIdeas } from "./helpers.js";
import {
  MAX_QUESTIONS_PER_PASS,
  SKIP_DELIBERATION_KINDS,
} from "./types.js";

/** @typedef {import('./types.js').Resolution} Resolution */
/** @typedef {import('../integrity/types.js').Finding} Finding */

/**
 * @param {import('mongodb').Db} db
 * @param {object} opts
 * @param {object} opts.trip
 * @param {string} opts.tripId
 * @param {string} opts.userId
 * @param {object[]} [opts.axes]
 * @param {object|null} [opts.profile]
 * @param {Finding[]} opts.findings
 * @param {number} [opts.limit]
 * @param {(query: string, opts?: object) => Promise<{ ok: boolean, text: string, citations: object[] }>} [opts.search]
 * @param {(name: string, cityContext?: string|null, db?: import('mongodb').Db|null) => Promise<object|null>} [opts.places]
 * @param {(input: object) => Promise<object>} [opts.llm]
 * @param {() => Date} [opts.now]
 * @param {number} [opts.searchBudget]
 * @returns {Promise<{
 *   resolutions: Resolution[],
 *   questions: object[],
 *   blocked: object[],
 *   searchesUsed: number,
 *   unhandled: Finding[]
 * }>}
 */
export async function resolveFindings(db, {
  trip,
  tripId,
  userId,
  axes = [],
  profile = null,
  findings,
  limit,
  search,
  places,
  llm,
  now = () => new Date(),
  searchBudget = DEFAULT_SEARCH_BUDGET,
}) {
  const nowDate = now();
  /** @type {Resolution[]} */
  const resolutions = [];
  /** @type {object[]} */
  const collectedQuestions = [];
  /** @type {object[]} */
  const blocked = [];
  /** @type {Finding[]} */
  const unhandled = [];
  let searchesUsed = 0;
  let searchBudgetRemaining = searchBudget;

  const ordered = limit ? findings.slice(0, limit) : findings;
  const pendingExists = await hasPendingQuestionSet(db, tripId);

  for (const finding of ordered) {
    if (collectedQuestions.length >= MAX_QUESTIONS_PER_PASS) break;
    if (pendingExists && wouldAskQuestion(finding)) continue;

    const resolver = resolverForCode(finding.code);
    if (!resolver) {
      unhandled.push(finding);
      resolutions.push({
        finding,
        kind: "unhandled",
        blockedWhy: `No resolver registered for ${finding.code}`,
      });
      continue;
    }

    /** @type {import('./types.js').ResolverContext} */
    const ctx = {
      db,
      tripId,
      userId,
      trip,
      axes,
      profile,
      now: nowDate,
      searchBudgetRemaining,
      search,
      places,
      llm,
    };

    if (SKIP_DELIBERATION_KINDS.has(finding.resolution?.kind)) {
      const direct = resolver.resolveDirect?.(finding, ctx)
        || resolver.interpret(finding, { decisions: [], questions: [], blocked: [], searchesUsed: 0 }, ctx);
      resolutions.push(direct);
      if (direct.questions?.length) {
        collectedQuestions.push(...direct.questions);
      }
      if (direct.kind === "blocked" && direct.blockedWhy) {
        blocked.push({ findingId: finding.id, code: finding.code, why: direct.blockedWhy });
      }
      continue;
    }

    if (finding.resolution?.kind === "verify_fact") {
      const direct = resolver.resolveDirect?.(finding, ctx)
        || resolver.interpret(finding, { decisions: [], questions: [], blocked: [], searchesUsed: 0 }, ctx);
      resolutions.push(direct);
      if (direct.questions?.length) {
        collectedQuestions.push(...direct.questions);
      }
      continue;
    }

    if (resolver.resolveDirect) {
      const direct = resolver.resolveDirect(finding, ctx);
      if (direct) {
        resolutions.push(direct);
        if (direct.questions?.length) {
          collectedQuestions.push(...direct.questions);
        }
        if (direct.kind === "blocked" && direct.blockedWhy) {
          blocked.push({ findingId: finding.id, code: finding.code, why: direct.blockedWhy });
        }
        continue;
      }
    }

    const slots = resolver.buildSlots(finding, ctx);
    if (!slots.length) {
      const fallback = resolver.interpret(finding, { decisions: [], questions: [], blocked: [], searchesUsed: 0 }, ctx);
      resolutions.push(fallback);
      continue;
    }

    const deliberationResult = await runDeliberation(db, {
      tripId,
      userId,
      trip,
      axes,
      profile,
      slots,
      search,
      places,
      llm,
      now: () => nowDate,
      searchBudget: searchBudgetRemaining,
      finding,
      ctx,
    });

    searchesUsed += deliberationResult.searchesUsed;
    searchBudgetRemaining = Math.max(0, searchBudget - searchesUsed);

    const resolution = resolver.interpret(finding, deliberationResult, ctx);
    resolutions.push(resolution);

    if (resolution.questions?.length) {
      collectedQuestions.push(...resolution.questions);
    }
    if (resolution.kind === "blocked" && resolution.blockedWhy) {
      blocked.push({ findingId: finding.id, code: finding.code, why: resolution.blockedWhy });
    }
    for (const b of deliberationResult.blocked) {
      blocked.push({ findingId: finding.id, code: finding.code, ...b });
    }
  }

  const sanitized = await sanitizeQuestionSet(db, collectedQuestions.slice(0, MAX_QUESTIONS_PER_PASS), {
    tripId,
    userId,
  });

  return {
    resolutions,
    questions: sanitized.ok ? sanitized.questions : [],
    blocked,
    searchesUsed,
    unhandled,
  };
}

/**
 * @param {Finding} finding
 */
function wouldAskQuestion(finding) {
  return SKIP_DELIBERATION_KINDS.has(finding.resolution?.kind)
    || finding.resolution?.kind === "verify_fact";
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} params
 */
async function runDeliberation(db, params) {
  const { finding, ctx, slots, searchBudget, ...delibOpts } = params;

  const usesLocalOnly = slots.every((s) =>
    s.ideaIds?.length && !s.query,
  ) || resolverUsesLocalDeliberation(finding.code);

  if (usesLocalOnly) {
    /** @type {import('../deliberation/constants.js').Candidate[]} */
    const allCandidates = [];
    for (const slot of slots) {
      for (const id of slot.ideaIds || []) {
        const item = (ctx.trip.attractions || []).find((a) => a.id === id);
        if (item) {
          allCandidates.push({
            id: item.id,
            name: item.name,
            price: item.price,
            rating: item.rating,
            reviewCount: item.reviewCount,
            attributes: item.attributes || {},
            origin: /** @type {const} */ ("user_idea"),
          });
        }
      }
    }

    if (allCandidates.length >= 3) {
      const result = localDeliberate({
        slot: slots[0],
        candidates: allCandidates.slice(0, 6),
        trip: ctx.trip,
        profile: ctx.profile,
        axes: ctx.axes,
        useResolutionScoring: true,
        now: ctx.now,
      });
      return result;
    }
  }

  const tripForDelib = injectSlotIdeas(ctx.trip, slots);
  return deliberate(db, {
    ...delibOpts,
    trip: tripForDelib,
    slots,
    searchBudget,
    skipCache: true,
  });
}

/**
 * @param {string} code
 */
function resolverUsesLocalDeliberation(code) {
  return [
    "impossible_transit",
    "committed_over_budget",
    "category_over_budget",
    "booking_window_closing",
    "timed_entry_unbooked",
    "missing_arrival_transfer",
    "missing_departure_transfer",
    "late_night_no_transfer",
    "late_night_arrival",
    "ride_flight_mismatch",
    "tight_connection",
    "flight_outside_trip_range",
    "checkin_before_arrival",
    "reception_closed_on_arrival",
  ].includes(code);
}

/**
 * @param {object} trip
 * @param {import('../deliberation/constants.js').DeliberationSlot[]} slots
 */
function injectSlotIdeas(trip, slots) {
  /** @type {import('../deliberation/constants.js').Candidate[]} */
  const synthetic = [];
  for (const slot of slots) {
    for (const id of slot.ideaIds || []) {
      if ((trip.attractions || []).some((a) => a.id === id)) continue;
      synthetic.push({
        id,
        name: id.replace(/^fix-/, "").replace(/-/g, " "),
        attributes: { _resolutionPlaceholder: true },
        origin: /** @type {const} */ ("user_idea"),
      });
    }
  }
  if (!synthetic.length) return trip;
  return tripWithSyntheticIdeas(trip, synthetic);
}
