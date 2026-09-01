import { randomUUID } from "crypto";
import { isUnknown } from "./constants.js";
import { withCriterionValue } from "./criteria.js";
import { buildScorecard } from "./scorecard.js";

/**
 * Plausible resolutions for an unknown criterion, derived from candidate spread.
 * @param {string} criterionId
 * @param {import('./constants.js').Candidate[]} candidates
 * @returns {unknown[]}
 */
export function resolutionsFromCandidates(criterionId, candidates) {
  switch (criterionId) {
    case "alcohol_preference": {
      const hasAlcoholFree = candidates.some((c) => c.attributes?.alcoholFree === true);
      const hasDrinks = candidates.some(
        (c) =>
          c.attributes?.servesAlcohol === true ||
          (c.attributes?.alcoholFree !== true && c.attributes?.servesAlcohol !== false),
      );
      /** @type {unknown[]} */
      const values = [];
      if (hasDrinks) values.push("prefers_drinks");
      if (hasAlcoholFree) values.push("alcohol_free_ok");
      return values.length ? values : ["prefers_drinks", "alcohol_free_ok"];
    }
    case "mobility":
      return ["needs_accessible", "no_constraint"];
    case "dietary":
      return ["no_restrictions", "vegetarian"];
    case "noise_tolerance":
      return ["quiet", "lively_ok"];
    default:
      return [];
  }
}

/**
 * @typedef {import('./scorecard.js').BuildScorecardOptions} BuildScorecardOptions
 */

/**
 * @param {import('./constants.js').Criterion[]} criteria
 * @param {import('./constants.js').Candidate[]} candidates
 * @param {import('./constants.js').DeliberationSlot} slot
 * @param {Date} now
 * @param {BuildScorecardOptions} [scorecardOptions]
 */
function leaderForResolution(criteria, candidates, slot, now, criterionId, value, scorecardOptions) {
  const resolved = withCriterionValue(criteria, criterionId, value);
  const { ranking } = buildScorecard(candidates, resolved, slot, now, scorecardOptions);
  const topViable = ranking.find((r) => !r.eliminated);
  return { leaderId: topViable?.candidateId || null, ranking };
}

/**
 * Measure how much a resolution reshuffles the field.
 * @param {import('./constants.js').RankedCandidate[]} baseRanking
 * @param {import('./constants.js').RankedCandidate[]} newRanking
 */
function shuffleImpact(baseRanking, newRanking) {
  const baseOrder = baseRanking.filter((r) => !r.eliminated).map((r) => r.candidateId);
  const newOrder = newRanking.filter((r) => !r.eliminated).map((r) => r.candidateId);
  const baseLeader = baseOrder[0] || null;
  const newLeader = newOrder[0] || null;
  let eligibilityChanges = 0;
  const baseEligible = new Set(baseRanking.filter((r) => !r.eliminated).map((r) => r.candidateId));
  const newEligible = new Set(newRanking.filter((r) => !r.eliminated).map((r) => r.candidateId));
  for (const id of new Set([...baseEligible, ...newEligible])) {
    if (baseEligible.has(id) !== newEligible.has(id)) eligibilityChanges += 1;
  }
  const leaderFlips = baseLeader !== newLeader ? 1 : 0;
  return { eligibilityChanges, leaderFlips, baseLeader, newLeader };
}

/**
 * @param {import('./constants.js').Criterion[]} criteria
 * @param {import('./constants.js').Candidate[]} candidates
 * @param {import('./constants.js').RankedCandidate[]} baseRanking
 * @param {import('./constants.js').DeliberationSlot} slot
 * @param {Date} now
 * @returns {Array<{ criterion: import('./constants.js').Criterion, impact: number, resolutions: unknown[], leaders: unknown[] }>}
 */
/**
 * @param {import('./constants.js').Criterion[]} criteria
 * @param {import('./constants.js').Candidate[]} candidates
 * @param {import('./constants.js').RankedCandidate[]} baseRanking
 * @param {import('./constants.js').DeliberationSlot} slot
 * @param {Date} now
 * @param {{ scorecardOptions?: BuildScorecardOptions, resolutionsForCriterion?: (criterionId: string, candidates: import('./constants.js').Candidate[]) => unknown[] }} [options]
 */
export function findDecisionFlippingUnknowns(criteria, candidates, baseRanking, slot, now, options = {}) {
  const scorecardOptions = options.scorecardOptions;
  const getResolutions = options.resolutionsForCriterion ?? resolutionsFromCandidates;

  /** @type {Array<{ criterion: import('./constants.js').Criterion, impact: number, resolutions: unknown[], leaders: unknown[] }>} */
  const flipping = [];

  for (const criterion of criteria) {
    if (!isUnknown(criterion.value)) continue;

    const resolutions = getResolutions(criterion.id, candidates);
    if (resolutions.length < 2) continue;

    /** @type {unknown[]} */
    const leaders = [];
    let totalImpact = 0;

    for (const value of resolutions) {
      const { leaderId, ranking } = leaderForResolution(
        criteria,
        candidates,
        slot,
        now,
        criterion.id,
        value,
        scorecardOptions,
      );
      leaders.push(leaderId);
      const impact = shuffleImpact(baseRanking, ranking);
      totalImpact = Math.max(totalImpact, impact.eligibilityChanges + impact.leaderFlips * 3);
    }

    const uniqueLeaders = new Set(leaders.filter(Boolean));
    if (uniqueLeaders.size <= 1) continue;

    flipping.push({
      criterion,
      impact: totalImpact,
      resolutions,
      leaders,
    });
  }

  flipping.sort((a, b) => b.impact - a.impact);
  return flipping;
}

/**
 * @param {Array<{ criterion: import('./constants.js').Criterion, impact: number, resolutions: unknown[] }>} flipping
 * @param {import('./constants.js').Candidate[]} candidates
 * @param {import('./constants.js').DeliberationSlot} slot
 * @returns {object[]}
 */
export function buildQuestionsFromFlipping(flipping, candidates, slot) {
  /** @type {object[]} */
  const questions = [];

  for (const item of flipping.slice(0, 3)) {
    const q = questionForCriterion(item.criterion, item.resolutions, candidates, slot);
    if (q) questions.push(q);
  }

  return questions;
}

function questionForCriterion(criterion, resolutions, candidates, slot) {
  switch (criterion.id) {
    case "alcohol_preference":
      return {
        id: randomUUID(),
        axisId: slot.axisId,
        field: slot.field || "alcoholPreference",
        header: "Drinks?",
        question: "For this sail — drinks on board, or alcohol-free is fine?",
        options: buildAlcoholOptions(resolutions, candidates),
      };
    case "mobility":
      return {
        id: randomUUID(),
        axisId: slot.axisId,
        field: slot.field || "mobility",
        header: "Access?",
        question: "Do you need step-free / wheelchair access here?",
        options: [
          { id: randomUUID(), label: "Yes — needs to be accessible", description: "" },
          { id: randomUUID(), label: "No special access needed", description: "" },
        ],
      };
    case "dietary":
      return {
        id: randomUUID(),
        axisId: slot.axisId,
        field: slot.field || "dietary",
        header: "Food?",
        question: "Any dietary needs I should filter for?",
        options: [
          { id: randomUUID(), label: "No restrictions", description: "" },
          { id: randomUUID(), label: "Vegetarian / vegan", description: "" },
          { id: randomUUID(), label: "Allergies — I'll note them", description: "" },
        ],
      };
    default:
      return null;
  }
}

function buildAlcoholOptions(resolutions, candidates) {
  /** @type {{ id: string, label: string, description: string }[]} */
  const options = [];

  if (resolutions.includes("prefers_drinks")) {
    const withDrinks = candidates.find((c) => c.attributes?.servesAlcohol !== false && !c.attributes?.alcoholFree);
    options.push({
      id: randomUUID(),
      label: "We'd like drinks on board",
      description: withDrinks ? `Like ${withDrinks.name}` : "",
    });
  }

  if (resolutions.includes("alcohol_free_ok")) {
    const dry = candidates.find((c) => c.attributes?.alcoholFree === true);
    options.push({
      id: randomUUID(),
      label: "Alcohol-free is fine — save the money",
      description: dry ? `${dry.name} is the budget pick` : "",
    });
  }

  return options.slice(0, 4);
}

/**
 * @param {import('./constants.js').Criterion[]} criteria
 * @param {import('./constants.js').Candidate[]} candidates
 * @param {import('./constants.js').RankedCandidate[]} ranking
 * @param {import('./constants.js').DeliberationSlot} slot
 * @param {Date} now
 */
export function deriveDecisionFlippingQuestions(criteria, candidates, ranking, slot, now) {
  const flipping = findDecisionFlippingUnknowns(criteria, candidates, ranking, slot, now);
  return buildQuestionsFromFlipping(flipping, candidates, slot);
}
