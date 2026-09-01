import { isUnknown } from "../deliberation/constants.js";
import { RESOLUTION_RANKING, scorePair } from "../deliberation/scorecard.js";

/**
 * Resolution-specific criterion scoring — fix/budget/stay/transport axes only; delegates to scorePair for POI criteria.
 *
 * @param {import('../deliberation/constants.js').Candidate} candidate
 * @param {import('../deliberation/constants.js').Criterion} criterion
 * @param {import('../deliberation/constants.js').DeliberationSlot} slot
 * @param {Date} now
 */
export function scoreResolutionPair(candidate, criterion, slot, now) {
  switch (criterion.id) {
    case "priority_preservation":
      return scorePriorityPreservation(candidate, criterion);
    case "cut_amount":
      return scoreCutAmount(candidate, criterion);
    case "transit_viability":
      return scoreTransitViability(candidate, criterion);
    case "plan_preservation":
      return scorePlanPreservation(candidate, criterion);
    case "deadline_urgency":
      return scoreDeadlineUrgency(candidate, criterion);
    case "breakfast_preference":
      return scoreBreakfastPreference(candidate, criterion);
    case "location_central":
      return scoreLocationCentral(candidate, criterion);
    case "transfer_cost":
      return scoreTransferCost(candidate, criterion);
    case "transfer_time":
      return scoreTransferTime(candidate, criterion);
    case "tie_break":
      return scoreTieBreak(candidate, criterion);
    default:
      return scorePair(candidate, criterion, slot, now);
  }
}

/** @type {import('../deliberation/scorecard.js').BuildScorecardOptions} */
export const RESOLUTION_SCORECARD_OPTIONS = {
  scorePair: scoreResolutionPair,
  ranking: RESOLUTION_RANKING,
  criterionHandlers: {
    // tie_break scores from candidate.attributes.tieBreak, not pair verdicts
    tie_break: (candidate) => {
      const rank = candidate.attributes?.tieBreak;
      if (typeof rank !== "number") return null;
      return {
        scoreDelta: rank * 0.05,
        entry: { verdict: "pass", evidence: `Preference rank ${rank}` },
      };
    },
  },
};

function scorePriorityPreservation(candidate, criterion) {
  const priorities = Array.isArray(criterion.value) ? criterion.value : [];
  const tags = candidate.attributes?.priorityTags || [];
  if (!priorities.length) {
    return { verdict: "pass", evidence: "No stated priorities to protect" };
  }
  const overlap = tags.filter((t) => priorities.some((p) => String(p).toLowerCase().includes(String(t).toLowerCase()) || String(t).toLowerCase().includes(String(p).toLowerCase())));
  if (overlap.length === 0) {
    return { verdict: "pass", evidence: "Does not touch stated priorities" };
  }
  if (overlap.length >= 2) {
    return { verdict: "fail", evidence: `Cuts into ${overlap.join(", ")} priorities` };
  }
  return { verdict: "unknown", evidence: `May affect ${overlap[0]} priority` };
}

function scoreCutAmount(candidate, criterion) {
  const savings = candidate.attributes?.savings;
  if (typeof savings !== "number") {
    return { verdict: "unknown", evidence: "Savings unknown" };
  }
  const needed = typeof criterion.value === "number" ? criterion.value : 0;
  if (savings >= needed * 0.5) {
    return { verdict: "pass", evidence: `Saves ~${savings} toward gap` };
  }
  return { verdict: "unknown", evidence: `Saves ~${savings} — partial fix` };
}

function scoreTransitViability(candidate, criterion) {
  const fixType = candidate.attributes?.fixType;
  const required = criterion.value?.requiredMinutes;
  const gap = criterion.value?.gapMinutes;
  if (!fixType || required == null || gap == null) {
    return { verdict: "unknown", evidence: "Transit data incomplete" };
  }
  if (fixType === "move_later") {
    const buffer = candidate.attributes?.bufferMinutes || 0;
    return buffer + gap >= required
      ? { verdict: "pass", evidence: `Moving later adds ${buffer} min buffer` }
      : { verdict: "fail", evidence: "Move still too tight" };
  }
  if (fixType === "drop_item") {
    return { verdict: "pass", evidence: "Removes the conflict entirely" };
  }
  if (fixType === "add_transport") {
    const travelMin = candidate.attributes?.travelMinutes || 0;
    return travelMin <= required
      ? { verdict: "pass", evidence: `Transport ~${travelMin} min fits gap` }
      : { verdict: "fail", evidence: "Transport still too slow" };
  }
  return { verdict: "unknown", evidence: "Unknown fix type" };
}

function scorePlanPreservation(candidate, criterion) {
  const fixType = candidate.attributes?.fixType;
  if (fixType === "drop_item") {
    return { verdict: "unknown", evidence: "Drops a planned item" };
  }
  if (fixType === "move_later" || fixType === "add_transport") {
    return { verdict: "pass", evidence: "Keeps both items on the day" };
  }
  return { verdict: "pass", evidence: "Preserves the plan" };
}

function scoreDeadlineUrgency(candidate, criterion) {
  const deadline = criterion.value?.deadline;
  const action = candidate.attributes?.action;
  if (!deadline) return { verdict: "unknown", evidence: "No deadline" };
  if (action === "book_now") {
    return { verdict: "pass", evidence: `Books before ${deadline}` };
  }
  if (action === "alternative") {
    return { verdict: "pass", evidence: "Finds an alternative if window closed" };
  }
  if (action === "drop") {
    return { verdict: "unknown", evidence: "Drops the item — last resort" };
  }
  return { verdict: "unknown", evidence: "Action unclear" };
}

function scoreBreakfastPreference(candidate, criterion) {
  if (isUnknown(criterion.value)) {
    const hasBreakfast = candidate.attributes?.breakfastIncluded === true;
    const noBreakfast = candidate.attributes?.breakfastIncluded === false;
    if (hasBreakfast && noBreakfast) {
      return { verdict: "unknown", evidence: "Breakfast policy varies" };
    }
    return { verdict: "unknown", evidence: "Breakfast preference unset" };
  }
  const wantsBreakfast = criterion.value === "wants_breakfast";
  const included = candidate.attributes?.breakfastIncluded;
  if (included == null) return { verdict: "unknown", evidence: "Breakfast policy unknown" };
  if (wantsBreakfast && included) {
    return { verdict: "pass", evidence: "Breakfast included" };
  }
  if (!wantsBreakfast && !included) {
    return { verdict: "pass", evidence: "No breakfast needed — saves cost" };
  }
  if (wantsBreakfast && !included) {
    return { verdict: "fail", evidence: "No breakfast included" };
  }
  return { verdict: "pass", evidence: "Breakfast optional — lower rate" };
}

function scoreLocationCentral(candidate, criterion) {
  const score = candidate.attributes?.centralScore;
  if (typeof score !== "number") {
    return { verdict: "unknown", evidence: "Location score unknown" };
  }
  if (score >= 0.7) return { verdict: "pass", evidence: "Central location" };
  if (score >= 0.4) return { verdict: "unknown", evidence: "Moderately central" };
  return { verdict: "fail", evidence: "Far from main sights" };
}

function scoreTransferCost(candidate, criterion) {
  const cost = candidate.attributes?.cost;
  const ceiling = typeof criterion.value === "number" ? criterion.value : null;
  if (cost == null) return { verdict: "unknown", evidence: "Cost unknown" };
  if (ceiling == null) return { verdict: "pass", evidence: `~${cost}` };
  return cost <= ceiling
    ? { verdict: "pass", evidence: `~${cost} within budget` }
    : { verdict: "fail", evidence: `~${cost} exceeds transfer budget` };
}

function scoreTransferTime(candidate, criterion) {
  const minutes = candidate.attributes?.durationMinutes;
  const maxMin = typeof criterion.value === "number" ? criterion.value : null;
  if (minutes == null) return { verdict: "unknown", evidence: "Duration unknown" };
  if (maxMin == null) return { verdict: "pass", evidence: `~${minutes} min` };
  return minutes <= maxMin
    ? { verdict: "pass", evidence: `~${minutes} min` }
    : { verdict: "fail", evidence: `~${minutes} min — too slow` };
}

function scoreTieBreak(candidate, criterion) {
  const rank = candidate.attributes?.tieBreak;
  if (typeof rank !== "number") return { verdict: "unknown", evidence: "No tie-break rank" };
  return { verdict: "pass", evidence: `Preference rank ${rank}`, sourceUrl: undefined };
}
