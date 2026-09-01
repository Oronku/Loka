import { isUnknown, UNKNOWN } from "./constants.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** @typedef {import('./constants.js').Candidate} Candidate */
/** @typedef {import('./constants.js').Criterion} Criterion */
/** @typedef {import('./constants.js').DeliberationSlot} DeliberationSlot */
/** @typedef {import('./constants.js').ScoreEntry} ScoreEntry */
/** @typedef {import('./constants.js').RankedCandidate} RankedCandidate */

/**
 * @typedef {object} CriterionHandlerResult
 * @property {number} [scoreDelta]
 * @property {{ verdict: import('./constants.js').ScoreVerdict, evidence: string, sourceUrl?: string }} [entry]
 */

/**
 * @typedef {object} RankingProfile
 * @property {number} [unknownWeight]
 * @property {boolean} [trackUnknownsInReason]
 * @property {boolean} [breakOnHardFail]
 * @property {number} [softFailMultiplier]
 * @property {boolean} [priceBonus]
 * @property {boolean} [reasonFromPassEvidence]
 */

/**
 * @typedef {object} BuildScorecardOptions
 * @property {(candidate: Candidate, criterion: Criterion, slot: DeliberationSlot, now: Date) => { verdict: import('./constants.js').ScoreVerdict, evidence: string, sourceUrl?: string }} [scorePair]
 * @property {Record<string, (candidate: Candidate, criterion: Criterion, slot: DeliberationSlot, now: Date) => CriterionHandlerResult|null>} [criterionHandlers]
 * @property {RankingProfile} [ranking]
 */

/** @type {RankingProfile} */
export const DELIBERATION_RANKING = {
  unknownWeight: 0,
  trackUnknownsInReason: true,
  breakOnHardFail: true,
  softFailMultiplier: 0.5,
  priceBonus: true,
  reasonFromPassEvidence: false,
};

/** @type {RankingProfile} */
export const RESOLUTION_RANKING = {
  unknownWeight: 0.25,
  trackUnknownsInReason: false,
  breakOnHardFail: false,
  softFailMultiplier: 0,
  priceBonus: false,
  reasonFromPassEvidence: true,
};

/**
 * @param {Candidate} candidate
 * @param {Criterion} criterion
 * @param {DeliberationSlot} slot
 * @param {Date} now
 * @returns {{ verdict: import('./constants.js').ScoreVerdict, evidence: string, sourceUrl?: string }}
 */
export function scorePair(candidate, criterion, slot, now) {
  switch (criterion.id) {
    case "budget_ceiling":
      return scoreBudget(candidate, criterion);
    case "open_on_date":
      return scoreOpeningHours(candidate, criterion, slot);
    case "booking_lead_time":
      return scoreBookingLead(candidate, criterion, now);
    case "quality_floor":
      return scoreQuality(candidate, criterion);
    case "area_coherence":
      return scoreAreaCoherence(candidate, criterion);
    case "kid_friendly":
      return scoreKidFriendly(candidate, criterion);
    case "alcohol_preference":
      return scoreAlcoholPreference(candidate, criterion);
    case "dietary":
      return scoreDietary(candidate, criterion);
    case "romance_quiet":
      return scoreRomanceQuiet(candidate, criterion);
    case "mobility":
      return scoreMobility(candidate, criterion);
    case "noise_tolerance":
      return scoreNoise(candidate, criterion);
    default:
      return { verdict: "unknown", evidence: "No scorer for this criterion" };
  }
}

function numericPrice(candidate) {
  if (typeof candidate.price === "number") return candidate.price;
  if (typeof candidate.price === "string") {
    const n = Number(candidate.price.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof candidate.priceLevel === "number") return candidate.priceLevel * 25;
  return null;
}

function scoreBudget(candidate, criterion) {
  if (isUnknown(criterion.value)) {
    return { verdict: "unknown", evidence: "Budget ceiling not set" };
  }
  const price = numericPrice(candidate);
  if (price == null) {
    return { verdict: "unknown", evidence: "Price not found for candidate" };
  }
  if (price <= criterion.value) {
    return { verdict: "pass", evidence: `€${price} within ~$${criterion.value} budget` };
  }
  return { verdict: "fail", evidence: `€${price} exceeds ~$${criterion.value} budget` };
}

function scoreOpeningHours(candidate, criterion) {
  const { date, time } = criterion.value || {};
  if (!date) return { verdict: "unknown", evidence: "No scheduled date" };
  const hours = candidate.openingHours;
  if (!hours?.weekdayText?.length) {
    return { verdict: "unknown", evidence: "Opening hours unknown" };
  }
  const day = new Date(`${date}T12:00:00`).getDay();
  const dayLine = hours.weekdayText.find((line) => line.startsWith(DAY_NAMES[day]));
  if (!dayLine) return { verdict: "unknown", evidence: "No hours listed for that weekday" };
  if (/closed/i.test(dayLine)) {
    return { verdict: "fail", evidence: `${DAY_NAMES[day]}: closed` };
  }
  if (time) {
    return { verdict: "pass", evidence: `Open ${dayLine}; time ${time} assumed ok` };
  }
  return { verdict: "pass", evidence: `Open ${dayLine}` };
}

function scoreBookingLead(candidate, criterion, now) {
  const targetDate = criterion.value?.date;
  if (!targetDate) return { verdict: "unknown", evidence: "No trip date" };
  if (!candidate.bookingRequired) {
    return { verdict: "pass", evidence: "No booking required" };
  }
  const lead = candidate.bookingLeadDays;
  if (typeof lead !== "number") {
    return { verdict: "unknown", evidence: "Booking lead time unknown" };
  }
  const daysUntil = Math.floor(
    (new Date(`${targetDate}T12:00:00`).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (daysUntil >= lead) {
    return { verdict: "pass", evidence: `${daysUntil} days until trip ≥ ${lead} day lead` };
  }
  return {
    verdict: "fail",
    evidence: `Needs ${lead}-day booking lead; only ${daysUntil} days left`,
  };
}

function scoreQuality(candidate, criterion) {
  const { minRating = 3.8, minReviews = 20 } = criterion.value || {};
  const rating = candidate.rating;
  const reviews = candidate.reviewCount;
  if (typeof rating !== "number") {
    return { verdict: "unknown", evidence: "Rating unknown" };
  }
  if (rating < minRating) {
    return { verdict: "fail", evidence: `Rating ${rating} below ${minRating} floor` };
  }
  if (typeof reviews === "number" && reviews < minReviews) {
    return { verdict: "fail", evidence: `${reviews} reviews below ${minReviews} floor` };
  }
  if (typeof reviews !== "number") {
    return { verdict: "unknown", evidence: "Review count unknown" };
  }
  return { verdict: "pass", evidence: `${rating}★ from ${reviews} reviews` };
}

function scoreAreaCoherence(candidate, criterion) {
  const anchor = criterion.value?.anchor;
  if (!anchor || typeof candidate.lat !== "number" || typeof candidate.lng !== "number") {
    return { verdict: "unknown", evidence: "Not enough location data" };
  }
  const km = haversineKm(anchor.lat, anchor.lng, candidate.lat, candidate.lng);
  if (km <= 3) return { verdict: "pass", evidence: `${km.toFixed(1)} km from day's anchor` };
  if (km <= 8) return { verdict: "pass", evidence: `${km.toFixed(1)} km — workable` };
  return { verdict: "fail", evidence: `${km.toFixed(1)} km away — breaks up the day` };
}

function scoreKidFriendly(candidate, criterion) {
  if (criterion.value !== true) return { verdict: "unknown", evidence: "Kid-friendly not required" };
  const attr = candidate.attributes?.kidFriendly;
  if (attr === true) return { verdict: "pass", evidence: "Marked kid-friendly" };
  if (attr === false) return { verdict: "fail", evidence: "Not kid-friendly" };
  return { verdict: "unknown", evidence: "Kid-friendliness unknown" };
}

function scoreAlcoholPreference(candidate, criterion) {
  if (isUnknown(criterion.value)) {
    return { verdict: "unknown", evidence: "Drinks preference unknown" };
  }
  const alcoholFree = candidate.attributes?.alcoholFree === true;
  const servesAlcohol =
    candidate.attributes?.servesAlcohol === true ||
    (candidate.attributes?.alcoholFree === false && candidate.attributes?.servesAlcohol !== false);

  if (criterion.value === "prefers_drinks") {
    if (alcoholFree) return { verdict: "fail", evidence: "Alcohol-free sail — not ideal if you want drinks" };
    if (servesAlcohol) return { verdict: "pass", evidence: "Serves alcohol on board" };
    return { verdict: "unknown", evidence: "Alcohol policy unclear" };
  }
  if (criterion.value === "alcohol_free_ok") {
    if (alcoholFree) return { verdict: "pass", evidence: "Alcohol-free — fits and often cheaper" };
    return { verdict: "pass", evidence: "Serves alcohol but fine either way" };
  }
  return { verdict: "unknown", evidence: "Neutral on drinks" };
}

function scoreDietary(candidate, criterion) {
  if (isUnknown(criterion.value)) {
    return { verdict: "unknown", evidence: "Dietary needs unknown" };
  }
  const needs = Array.isArray(criterion.value) ? criterion.value : [criterion.value];
  const menuNotes = String(candidate.attributes?.dietaryNotes || candidate.attributes?.menu || "");
  for (const need of needs) {
    const re = new RegExp(String(need), "i");
    if (menuNotes && !re.test(menuNotes)) {
      return { verdict: "fail", evidence: `May not accommodate ${need}` };
    }
  }
  if (!menuNotes) return { verdict: "unknown", evidence: "Menu/dietary info not found" };
  return { verdict: "pass", evidence: "Dietary needs appear covered" };
}

function scoreRomanceQuiet(candidate, criterion) {
  if (criterion.value !== true && criterion.value !== "quiet") {
    return { verdict: "unknown", evidence: "Romance/quiet not weighted" };
  }
  if (candidate.attributes?.romantic === true || candidate.attributes?.quiet === true) {
    return { verdict: "pass", evidence: "Romantic / quiet vibe" };
  }
  if (candidate.attributes?.party === true || candidate.attributes?.lively === true) {
    return { verdict: "fail", evidence: "Lively / party vibe — less romantic" };
  }
  return { verdict: "unknown", evidence: "Vibe unclear" };
}

function scoreMobility(candidate, criterion) {
  if (isUnknown(criterion.value)) {
    return { verdict: "unknown", evidence: "Mobility needs unknown" };
  }
  if (criterion.value === "needs_accessible") {
    if (candidate.attributes?.wheelchairAccessible === true) {
      return { verdict: "pass", evidence: "Wheelchair accessible" };
    }
    if (candidate.attributes?.wheelchairAccessible === false) {
      return { verdict: "fail", evidence: "Not wheelchair accessible" };
    }
    return { verdict: "unknown", evidence: "Accessibility unknown" };
  }
  return { verdict: "unknown", evidence: "Mobility not a factor" };
}

function scoreNoise(candidate, criterion) {
  if (isUnknown(criterion.value)) return { verdict: "unknown", evidence: "Noise preference unknown" };
  if (criterion.value === "quiet") {
    if (candidate.attributes?.quiet === true) return { verdict: "pass", evidence: "Quiet option" };
    if (candidate.attributes?.lively === true) return { verdict: "fail", evidence: "Lively — may be loud" };
  }
  return { verdict: "unknown", evidence: "Noise level unclear" };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {Candidate[]} candidates
 * @param {Criterion[]} criteria
 * @param {DeliberationSlot} slot
 * @param {Date} now
 * @param {BuildScorecardOptions} [options]
 */
export function buildScorecard(candidates, criteria, slot, now, options = {}) {
  const scorePairFn = options.scorePair ?? scorePair;
  const handlers = options.criterionHandlers ?? {};
  const rankingProfile = { ...DELIBERATION_RANKING, ...options.ranking };

  /** @type {ScoreEntry[]} */
  const scorecard = [];
  /** @type {Map<string, number>} */
  const handlerDeltas = new Map();

  for (const candidate of candidates) {
    for (const criterion of criteria) {
      const handler = handlers[criterion.id];
      if (handler) {
        const result = handler(candidate, criterion, slot, now);
        if (result?.entry) {
          scorecard.push({
            candidateId: candidate.id,
            criterionId: criterion.id,
            verdict: result.entry.verdict,
            evidence: result.entry.evidence,
            ...(result.entry.sourceUrl ? { sourceUrl: result.entry.sourceUrl } : {}),
          });
        }
        if (typeof result?.scoreDelta === "number") {
          handlerDeltas.set(`${candidate.id}:${criterion.id}`, result.scoreDelta);
        }
        continue;
      }

      const { verdict, evidence, sourceUrl } = scorePairFn(candidate, criterion, slot, now);
      scorecard.push({
        candidateId: candidate.id,
        criterionId: criterion.id,
        verdict,
        evidence,
        ...(sourceUrl ? { sourceUrl } : {}),
      });
    }
  }

  const ranking = rankCandidates(candidates, criteria, scorecard, {
    ...rankingProfile,
    handlerKeys: new Set(Object.keys(handlers)),
    handlerDeltas,
  });

  /** @type {{ option: string, why: string }[]} */
  const rejected = [];
  for (const row of ranking) {
    if (!row.eliminated) continue;
    const candidate = candidates.find((c) => c.id === row.candidateId);
    rejected.push({ option: candidate?.name || row.candidateId, why: row.reason });
  }

  return { scorecard, ranking, rejected };
}

/**
 * @param {Candidate[]} candidates
 * @param {Criterion[]} criteria
 * @param {ScoreEntry[]} scorecard
 * @param {RankingProfile & { handlerKeys?: Set<string>, handlerDeltas?: Map<string, number> }} profile
 */
function rankCandidates(candidates, criteria, scorecard, profile) {
  const {
    unknownWeight = 0,
    trackUnknownsInReason = false,
    breakOnHardFail = true,
    softFailMultiplier = 0,
    priceBonus = false,
    reasonFromPassEvidence = false,
    handlerKeys = new Set(),
    handlerDeltas = new Map(),
  } = profile;

  /** @type {RankedCandidate[]} */
  const rows = [];

  for (const candidate of candidates) {
    let score = 0;
    let eliminated = false;
    /** @type {string[]} */
    const reasons = [];
    /** @type {string[]} */
    const unknowns = [];

    for (const criterion of criteria) {
      if (handlerKeys.has(criterion.id)) {
        const delta = handlerDeltas.get(`${candidate.id}:${criterion.id}`);
        if (typeof delta === "number") score += delta;
        continue;
      }

      const entry = scorecard.find(
        (s) => s.candidateId === candidate.id && s.criterionId === criterion.id,
      );
      const verdict = entry?.verdict || "unknown";

      if (criterion.kind === "hard" && verdict === "fail") {
        eliminated = true;
        reasons.push(entry?.evidence || `${criterion.label}: failed`);
        if (breakOnHardFail) break;
        continue;
      }

      if (verdict === "unknown") {
        if (trackUnknownsInReason) unknowns.push(criterion.label);
        if (unknownWeight > 0) score += criterion.weight * unknownWeight;
        continue;
      }

      if (verdict === "pass") {
        score += criterion.weight;
        if (criterion.id === "alcohol_preference" && candidate.attributes?.alcoholFree === true) {
          score += criterion.weight;
        }
      } else if (verdict === "fail" && softFailMultiplier > 0) {
        const penalty = criterion.id === "alcohol_preference" ? 4 : softFailMultiplier;
        score -= criterion.weight * penalty;
      }
    }

    if (!eliminated && priceBonus && typeof candidate.price === "number") {
      score += Math.max(0, 2 - candidate.price / 50);
    }

    let reason = "";
    if (eliminated) {
      reason = reasons[0] || "Failed a hard requirement";
    } else if (trackUnknownsInReason && unknowns.length) {
      reason = `Best fit so far — still unsure about ${unknowns.slice(0, 2).join(", ")}`;
    } else if (!reasonFromPassEvidence) {
      reason = `Strong match across ${criteria.length} criteria`;
    }

    rows.push({
      candidateId: candidate.id,
      score,
      eliminated,
      reason,
    });
  }

  rows.sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return b.score - a.score;
  });

  if (reasonFromPassEvidence) {
    for (const row of rows) {
      if (row.eliminated) continue;
      row.reason = scorecard
        .filter((s) => s.candidateId === row.candidateId && s.verdict === "pass")
        .slice(0, 2)
        .map((s) => s.evidence)
        .join("; ");
    }
  }

  return rows;
}

/**
 * @param {RankedCandidate[]} ranking
 * @param {Candidate[]} candidates
 */
export function pickLeader(ranking, candidates) {
  const viable = ranking.filter((r) => !r.eliminated);
  if (!viable.length) {
    return { leader: null, confidence: /** @type {const} */ ("low") };
  }

  const top = viable[0];
  const runnerUp = viable[1];
  const gap = runnerUp ? top.score - runnerUp.score : Number.POSITIVE_INFINITY;

  if (runnerUp && gap === 0) {
    return { leader: null, confidence: /** @type {const} */ ("low"), topRow: top };
  }

  const candidate = candidates.find((c) => c.id === top.candidateId) || null;
  /** @type {import('./constants.js').DeliberationConfidence} */
  let confidence = "low";
  if (gap >= 1) {
    confidence = top.score >= 4 ? "high" : "medium";
  } else if (gap >= 0.05) {
    confidence = "medium";
  }

  return { leader: candidate, confidence, topRow: top };
}

export { UNKNOWN };
