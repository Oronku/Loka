import { deriveCriteria } from "../deliberation/criteria.js";
import { buildScorecard, pickLeader } from "../deliberation/scorecard.js";
import { deriveDecisionFlippingQuestions } from "../deliberation/valueOfInfo.js";
import { deriveResolutionFlippingQuestions } from "./valueOfInfo.js";
import { MIN_CANDIDATES } from "../deliberation/constants.js";
import { RESOLUTION_SCORECARD_OPTIONS } from "./scorecard.js";

/**
 * Deliberate over pre-built candidates without web search — same output shape as deliberate().
 *
 * @param {object} params
 * @param {import('../deliberation/constants.js').DeliberationSlot} params.slot
 * @param {import('../deliberation/constants.js').Candidate[]} params.candidates
 * @param {object} params.trip
 * @param {object|null} [params.profile]
 * @param {object[]} [params.axes]
 * @param {import('../deliberation/constants.js').Criterion[]} [params.extraCriteria]
 * @param {boolean} [params.useResolutionScoring]
 * @param {Date} params.now
 */
export function localDeliberate({
  slot,
  candidates,
  trip,
  profile = null,
  axes = [],
  extraCriteria = [],
  useResolutionScoring = false,
  now,
}) {
  const dayItems = (trip?.attractions || []).filter(
    (a) => a.scheduledDate === slot.scheduledDate && a.id !== slot.slotId,
  );

  let criteria = deriveCriteria({ slot, trip, profile, axes, dayItems, now });
  if (extraCriteria.length) {
    criteria = [...criteria, ...extraCriteria];
  }

  if (candidates.length < MIN_CANDIDATES) {
    return {
      decisions: [],
      questions: [],
      blocked: [{
        slotId: slot.slotId,
        axisId: slot.axisId,
        why: `Only ${candidates.length} candidate(s); need at least ${MIN_CANDIDATES}`,
      }],
      searchesUsed: 0,
    };
  }

  const scorecardOptions = useResolutionScoring ? RESOLUTION_SCORECARD_OPTIONS : undefined;
  const { scorecard, ranking, rejected } = buildScorecard(
    candidates,
    criteria,
    slot,
    now,
    scorecardOptions,
  );

  const flippingQuestions = useResolutionScoring
    ? deriveResolutionFlippingQuestions(criteria, candidates, ranking, slot, now)
    : deriveDecisionFlippingQuestions(criteria, candidates, ranking, slot, now);

  if (flippingQuestions.length) {
    const shortlist = candidates.filter((c) =>
      ranking.some((r) => r.candidateId === c.id && !r.eliminated),
    );
    return {
      decisions: [{
        slotId: slot.slotId,
        chosen: null,
        shortlist,
        scorecard,
        rejected,
        confidence: "low",
        reasoning: "Need your input before I pick — it changes the best fit.",
      }],
      questions: flippingQuestions,
      blocked: [],
      searchesUsed: 0,
    };
  }

  const { leader, confidence, topRow } = pickLeader(ranking, candidates);

  const viable = ranking.filter((r) => !r.eliminated);
  const shortlist = candidates.filter((c) =>
    viable.some((r) => r.candidateId === c.id),
  );

  if (!leader) {
    if (!viable.length) {
      return {
        decisions: [],
        questions: [],
        blocked: [{ slotId: slot.slotId, axisId: slot.axisId, why: rejected[0]?.why || "Every candidate failed a hard requirement" }],
        searchesUsed: 0,
      };
    }

    return {
      decisions: [{
        slotId: slot.slotId,
        chosen: null,
        shortlist,
        scorecard,
        rejected,
        confidence: "low",
        reasoning: "Close call — ranked alternatives below",
        ranking,
      }],
      questions: [],
      blocked: [],
      searchesUsed: 0,
    };
  }

  return {
    decisions: [{
      slotId: slot.slotId,
      chosen: leader,
      shortlist,
      scorecard,
      rejected,
      confidence,
      reasoning: topRow?.reason || `${leader.name} — best fit`,
    }],
    questions: [],
    blocked: [],
    searchesUsed: 0,
  };
}
