/** @typedef {import('../../models/trip.helper.js').TripIntent} TripIntent */

const VALID_PACE = new Set(["freedom", "relax", "optimize", "fullDayOfPlans"]);
const VALID_COMPANIONS = new Set([
  "justMe",
  "spousePartner",
  "friendsFamily",
  "familyWithKids",
]);
const VALID_BUDGET_LEVEL = new Set(["budget", "moderate", "comfortable", "splurge"]);

const LOOK_UP_PRIORITY_LABELS = {
  stayNearHotel: "Stay near the hotel",
  morePlaces: "Find more places to visit",
  funFactsHistory: "Fun facts and local history",
};

/** @param {unknown} value @returns {string[]} */
function coerceCompanionList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!VALID_COMPANIONS.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 12) break;
  }
  return out;
}

/** @param {unknown} whoPays @returns {'budget'|'moderate'|'comfortable'|'splurge'|undefined} */
function budgetLevelFromWhoPays(whoPays) {
  if (typeof whoPays !== "string") return undefined;
  switch (whoPays) {
    case "payBackPerson":
      return "budget";
    case "splitTheBill":
      return "moderate";
    case "takeTurns":
      return "comfortable";
    default:
      return undefined;
  }
}

/** @param {unknown} lookUp @returns {string|undefined} */
function priorityFromLookUp(lookUp) {
  if (typeof lookUp !== "string") return undefined;
  return LOOK_UP_PRIORITY_LABELS[lookUp] || lookUp.trim() || undefined;
}

/**
 * Build a raw intent patch from onboarding questionnaire answers.
 * Caller should pass through normalizeTripIntent().
 *
 * @param {Record<string, unknown>|null|undefined} onboardingPreferences
 * @returns {Partial<TripIntent>|undefined}
 */
export function buildIntentPatchFromOnboarding(onboardingPreferences) {
  if (!onboardingPreferences || typeof onboardingPreferences !== "object") {
    return undefined;
  }

  /** @type {Partial<TripIntent>} */
  const patch = { source: "onboarding" };

  const travelPace = onboardingPreferences.travel_pace;
  if (typeof travelPace === "string" && VALID_PACE.has(travelPace)) {
    patch.pace = travelPace;
  }

  const companions = coerceCompanionList(onboardingPreferences.companions);
  if (companions.length > 0) {
    patch.companions = companions;
  }

  const budgetLevel = budgetLevelFromWhoPays(onboardingPreferences.who_pays);
  if (budgetLevel && VALID_BUDGET_LEVEL.has(budgetLevel)) {
    patch.budgetLevel = budgetLevel;
  }

  const priority = priorityFromLookUp(onboardingPreferences.look_up_on_trip);
  if (priority) {
    patch.priorities = [priority];
  }

  if (
    !patch.pace &&
    !patch.companions?.length &&
    !patch.priorities?.length &&
    !patch.budgetLevel
  ) {
    return undefined;
  }

  return patch;
}
