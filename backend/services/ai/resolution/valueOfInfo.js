import { randomUUID } from "crypto";
import {
  findDecisionFlippingUnknowns,
  resolutionsFromCandidates,
} from "../deliberation/valueOfInfo.js";
import { RESOLUTION_SCORECARD_OPTIONS } from "./scorecard.js";

/**
 * Resolution-axis value-of-information — breakfast_preference resolutions only; flip detection is shared.
 *
 * @param {import('../deliberation/constants.js').Criterion[]} criteria
 * @param {import('../deliberation/constants.js').Candidate[]} candidates
 * @param {import('../deliberation/constants.js').RankedCandidate[]} ranking
 * @param {import('../deliberation/constants.js').DeliberationSlot} slot
 * @param {Date} now
 */
export function deriveResolutionFlippingQuestions(criteria, candidates, ranking, slot, now) {
  const flipping = findDecisionFlippingUnknowns(criteria, candidates, ranking, slot, now, {
    scorecardOptions: RESOLUTION_SCORECARD_OPTIONS,
    resolutionsForCriterion: resolutionValuesForCriterion,
  });

  /** @type {object[]} */
  const questions = [];
  for (const item of flipping) {
    const q = questionForResolutionCriterion(item.criterion, item.resolutions, candidates, slot);
    if (q) questions.push(q);
  }

  return questions.slice(0, 3);
}

/**
 * @param {string} criterionId
 * @param {import('../deliberation/constants.js').Candidate[]} candidates
 */
function resolutionValuesForCriterion(criterionId, candidates) {
  if (criterionId === "breakfast_preference") {
    const hasBreakfast = candidates.some((c) => c.attributes?.breakfastIncluded === true);
    const noBreakfast = candidates.some((c) => c.attributes?.breakfastIncluded === false);
    /** @type {string[]} */
    const values = [];
    if (hasBreakfast) values.push("wants_breakfast");
    if (noBreakfast) values.push("no_breakfast_ok");
    return values.length ? values : ["wants_breakfast", "no_breakfast_ok"];
  }
  return resolutionsFromCandidates(criterionId, candidates);
}

function questionForResolutionCriterion(criterion, resolutions, candidates, slot) {
  if (criterion.id === "breakfast_preference") {
    /** @type {{ id: string, label: string, description: string }[]} */
    const options = [];
    if (resolutions.includes("wants_breakfast")) {
      const withBreakfast = candidates.find((c) => c.attributes?.breakfastIncluded === true);
      options.push({
        id: randomUUID(),
        label: "Breakfast included matters",
        description: withBreakfast ? `Like ${withBreakfast.name}` : "",
      });
    }
    if (resolutions.includes("no_breakfast_ok")) {
      const without = candidates.find((c) => c.attributes?.breakfastIncluded === false);
      options.push({
        id: randomUUID(),
        label: "Skip breakfast — save money",
        description: without ? `${without.name} is cheaper` : "",
      });
    }
    if (options.length < 2) return null;
    return {
      id: randomUUID(),
      axisId: slot.axisId,
      field: slot.field || "breakfastPreference",
      header: "Breakfast?",
      question: "For these hotels — is breakfast included important, or save the money?",
      options: options.slice(0, 4),
    };
  }
  return null;
}
