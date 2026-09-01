import { deriveCriteria } from "./criteria.js";
import { gatherCandidates } from "./candidates.js";
import { buildScorecard, pickLeader } from "./scorecard.js";
import { deriveDecisionFlippingQuestions } from "./valueOfInfo.js";
import { getLatestDeliberation, persistAxisDecision, saveDeliberation } from "./persist.js";
import { DEFAULT_SEARCH_BUDGET, MIN_CANDIDATES } from "./constants.js";

/**
 * Deliberate over one or more trip slots — find real candidates, score against
 * traveler-specific criteria, and ask only decision-flipping questions.
 *
 * @param {import('mongodb').Db} db
 * @param {object} opts
 * @param {string} opts.tripId
 * @param {string} opts.userId
 * @param {object} opts.trip
 * @param {object[]} [opts.axes]
 * @param {object|null} [opts.profile]
 * @param {import('./constants.js').DeliberationSlot[]} opts.slots
 * @param {(query: string, opts?: object) => Promise<{ ok: boolean, text: string, citations: object[] }>} [opts.search]
 * @param {(name: string, cityContext?: string|null, db?: import('mongodb').Db|null) => Promise<object|null>} [opts.places]
 * @param {(input: object) => Promise<object>} [opts.llm]
 * @param {() => Date} [opts.now]
 * @param {number} [opts.searchBudget]
 * @param {boolean} [opts.skipCache]
 * @returns {Promise<{
 *   decisions: object[],
 *   questions: object[],
 *   blocked: object[],
 *   searchesUsed: number
 * }>}
 */
export async function deliberate(db, {
  tripId,
  userId,
  trip,
  axes = [],
  profile = null,
  slots,
  search,
  places,
  llm,
  now = () => new Date(),
  searchBudget = DEFAULT_SEARCH_BUDGET,
  skipCache = false,
}) {
  const nowDate = now();
  /** @type {object[]} */
  const decisions = [];
  /** @type {object[]} */
  const questions = [];
  /** @type {object[]} */
  const blocked = [];
  let totalSearches = 0;

  for (const slot of slots) {
    const dayItems = (trip?.attractions || []).filter(
      (a) => a.scheduledDate === slot.scheduledDate && a.id !== slot.slotId,
    );

    if (!skipCache) {
      const cached = await getLatestDeliberation(db, tripId, slot.slotId);
      if (cached?.chosen && cached.confidence === "high") {
        decisions.push(formatDecisionFromCache(slot, cached));
        continue;
      }
    }

    const criteria = deriveCriteria({
      slot,
      trip,
      profile,
      axes,
      dayItems,
      now: nowDate,
    });

    const remainingBudget = Math.max(0, searchBudget - totalSearches);
    const { candidates, searchesUsed } = await gatherCandidates(db, {
      slot,
      trip,
      search,
      places,
      llm,
      searchBudget: remainingBudget,
    });
    totalSearches += searchesUsed;

    if (candidates.length < MIN_CANDIDATES) {
      blocked.push({
        slotId: slot.slotId,
        axisId: slot.axisId,
        why: `Only found ${candidates.length} real candidate(s); need at least ${MIN_CANDIDATES}`,
      });
      continue;
    }

    const { scorecard, ranking, rejected } = buildScorecard(
      candidates,
      criteria,
      slot,
      nowDate,
    );

    const flippingQuestions = deriveDecisionFlippingQuestions(
      criteria,
      candidates,
      ranking,
      slot,
      nowDate,
    );

    if (flippingQuestions.length) {
      questions.push(...flippingQuestions);
      const shortlist = candidates.filter((c) =>
        ranking.some((r) => r.candidateId === c.id && !r.eliminated),
      );

      const record = {
        tripId,
        userId,
        slotId: slot.slotId,
        axisId: slot.axisId,
        criteria,
        candidates,
        scorecard,
        ranking,
        questions: flippingQuestions,
        chosen: null,
        confidence: "low",
        reasoning: "Need your input before I pick — it changes the best fit.",
        rejected,
        searchesUsed,
        createdAt: nowDate,
      };
      await saveDeliberation(db, record);

      decisions.push({
        slotId: slot.slotId,
        chosen: null,
        shortlist,
        scorecard,
        rejected,
        confidence: "low",
        reasoning: record.reasoning,
      });
      continue;
    }

    const { leader, confidence, topRow } = pickLeader(ranking, candidates);

    if (!leader) {
      const viable = ranking.filter((r) => !r.eliminated);
      if (!viable.length) {
        blocked.push({
          slotId: slot.slotId,
          axisId: slot.axisId,
          why: rejected[0]?.why || "Every candidate failed a hard requirement",
        });
      } else {
        blocked.push({
          slotId: slot.slotId,
          axisId: slot.axisId,
          why: "No clear winner among remaining options",
        });
      }

      await saveDeliberation(db, {
        tripId,
        userId,
        slotId: slot.slotId,
        axisId: slot.axisId,
        criteria,
        candidates,
        scorecard,
        ranking,
        chosen: null,
        confidence: "low",
        reasoning: blocked[blocked.length - 1].why,
        rejected,
        searchesUsed,
        createdAt: nowDate,
      });
      continue;
    }

    const reasoning = topRow?.reason || `${leader.name} — best fit for this slot`;
    const shortlist = candidates.filter((c) =>
      ranking.some((r) => r.candidateId === c.id && !r.eliminated),
    );

    await saveDeliberation(db, {
      tripId,
      userId,
      slotId: slot.slotId,
      axisId: slot.axisId,
      criteria,
      candidates,
      scorecard,
      ranking,
      chosen: leader,
      confidence,
      reasoning,
      rejected,
      searchesUsed,
      createdAt: nowDate,
    });

    await persistAxisDecision(db, {
      tripId,
      userId,
      axisId: slot.axisId,
      chosen: leader,
      why: reasoning,
      rejected,
      field: slot.field || null,
      confidence: confidence === "high" ? 0.9 : confidence === "medium" ? 0.75 : 0.6,
    });

    decisions.push({
      slotId: slot.slotId,
      chosen: leader,
      shortlist,
      scorecard,
      rejected,
      confidence,
      reasoning,
    });
  }

  return {
    decisions,
    questions: questions.slice(0, 3),
    blocked,
    searchesUsed: totalSearches,
  };
}

function formatDecisionFromCache(slot, cached) {
  return {
    slotId: slot.slotId,
    chosen: cached.chosen,
    shortlist: cached.candidates || [],
    scorecard: cached.scorecard || [],
    rejected: cached.rejected || [],
    confidence: cached.confidence || "high",
    reasoning: cached.reasoning || "Previously deliberated",
  };
}

export { deriveCriteria } from "./criteria.js";
export { gatherCandidates } from "./candidates.js";
export { buildScorecard, pickLeader } from "./scorecard.js";
export {
  deriveDecisionFlippingQuestions,
  findDecisionFlippingUnknowns,
} from "./valueOfInfo.js";
export { UNKNOWN, DEFAULT_SEARCH_BUDGET } from "./constants.js";
