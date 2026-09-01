import { UNKNOWN, BUDGET_CEILINGS, isUnknown } from "./constants.js";

/**
 * @param {import('./constants.js').Criterion} criterion
 * @param {unknown} value
 * @param {import('./constants.js').CriterionSource} source
 * @param {import('./constants.js').CriterionKind} kind
 * @param {number} weight
 */
function criterion(id, label, value, source, kind = "soft", weight = 1) {
  return { id, label, kind, weight, value, source };
}

/**
 * Pull a settled field value from axis decisions.
 * @param {object[]} axes
 * @param {string} field
 * @returns {unknown}
 */
function axisValueForField(axes, field) {
  for (const axis of axes || []) {
    for (const d of axis.decisions || []) {
      if (d.field === field) return d.decision;
    }
  }
  return UNKNOWN;
}

/**
 * @param {object} params
 * @param {import('./constants.js').DeliberationSlot} params.slot
 * @param {object} params.trip
 * @param {object|null} params.profile
 * @param {object[]} params.axes
 * @param {object[]} params.dayItems
 * @param {Date} params.now
 * @returns {import('./constants.js').Criterion[]}
 */
export function deriveCriteria({ slot, trip, profile, axes, dayItems, now }) {
  /** @type {import('./constants.js').Criterion[]} */
  const out = [];
  const intent = trip?.intent || {};
  const companions = Array.isArray(intent.companions) ? intent.companions : [];
  const isCouple = companions.includes("spousePartner");
  const isFamilyKids = companions.includes("familyWithKids");
  const isSolo = companions.includes("justMe") && companions.length === 1;

  const budgetLevel =
    intent.budgetLevel ||
    profile?.budgetLevel ||
    UNKNOWN;
  const budgetCeiling =
    typeof budgetLevel === "string" && BUDGET_CEILINGS[budgetLevel]
      ? BUDGET_CEILINGS[budgetLevel]
      : UNKNOWN;

  out.push(
    criterion("budget_ceiling", "Within budget", budgetCeiling, "intent", "hard", 3),
  );

  if (!isUnknown(budgetLevel)) {
    out.push(criterion("budget_level", "Budget tier", budgetLevel, "intent", "soft", 1));
  }

  if (isCouple) {
    out.push(criterion("romance_quiet", "Romantic / quiet vibe", UNKNOWN, "inferred", "soft", 2));
    out.push(criterion("kid_friendly", "Kid-friendly", false, "inferred", "soft", 0.5));
  } else if (isFamilyKids) {
    out.push(criterion("kid_friendly", "Kid-friendly", true, "inferred", "hard", 3));
    out.push(criterion("romance_quiet", "Romantic / quiet vibe", false, "inferred", "soft", 0.5));
  } else if (isSolo) {
    out.push(criterion("kid_friendly", "Kid-friendly", false, "inferred", "soft", 0.5));
  }

  out.push(
    criterion(
      "alcohol_preference",
      "Drinks on board",
      axisValueForField(axes, "alcoholPreference") !== UNKNOWN
        ? axisValueForField(axes, "alcoholPreference")
        : inferAlcoholPreference(profile),
      "inferred",
      "soft",
      2,
    ),
  );

  const dietary = inferDietary(profile, axes);
  out.push(
    criterion("dietary", "Dietary needs", dietary.value, dietary.source, dietary.kind, 3),
  );

  out.push(
    criterion(
      "mobility",
      "Mobility access",
      axisValueForField(axes, "mobility") !== UNKNOWN
        ? axisValueForField(axes, "mobility")
        : UNKNOWN,
      "inferred",
      "soft",
      1.5,
    ),
  );

  out.push(
    criterion(
      "noise_tolerance",
      "Noise tolerance",
      inferNoiseTolerance(intent, companions),
      "inferred",
      "soft",
      1,
    ),
  );

  if (Array.isArray(intent.vibes) && intent.vibes.length) {
    out.push(criterion("vibes", "Trip vibes", intent.vibes, "intent", "soft", 1.5));
  }

  if (Array.isArray(intent.priorities) && intent.priorities.length) {
    out.push(criterion("priorities", "Trip priorities", intent.priorities, "intent", "soft", 1.5));
  }

  if (slot.scheduledDate) {
    out.push(
      criterion(
        "open_on_date",
        "Open on scheduled date",
        { date: slot.scheduledDate, time: slot.scheduledTime || null },
        "trip_data",
        "hard",
        4,
      ),
    );
    out.push(
      criterion(
        "booking_lead_time",
        "Booking lead time achievable",
        { date: slot.scheduledDate, now: now.toISOString() },
        "trip_data",
        "hard",
        4,
      ),
    );
  }

  out.push(
    criterion("quality_floor", "Quality floor (rating & reviews)", { minRating: 3.8, minReviews: 20 }, "inferred", "hard", 2),
  );

  if (dayItems?.length) {
    out.push(
      criterion(
        "area_coherence",
        "Same area / reasonable travel",
        summarizeDayGeography(dayItems),
        "trip_data",
        "soft",
        2,
      ),
    );
  }

  const season = seasonFromDate(slot.scheduledDate, now);
  if (season) {
    out.push(criterion("season", "Season fit", season, "trip_data", "soft", 1));
  }

  return out;
}

function inferAlcoholPreference(profile) {
  const dislikes = profile?.dislikes || [];
  if (dislikes.some((d) => /alcohol|drink|wine|beer/i.test(String(d)))) {
    return "alcohol_free_ok";
  }
  return UNKNOWN;
}

function inferDietary(profile, axes) {
  const fromAxis = axisValueForField(axes, "dietary");
  if (!isUnknown(fromAxis)) {
    return { value: fromAxis, source: /** @type {const} */ ("axis_decision"), kind: /** @type {const} */ ("hard") };
  }

  const dislikes = profile?.dislikes || [];
  const cuisines = profile?.cuisines || [];
  const tags = [...dislikes, ...cuisines].map(String);
  const hardTags = tags.filter((t) =>
    /allerg|gluten|nut|shellfish|vegan|vegetarian|kosher|halal/i.test(t),
  );
  if (hardTags.length) {
    return { value: hardTags, source: /** @type {const} */ ("profile"), kind: /** @type {const} */ ("hard") };
  }
  return { value: UNKNOWN, source: /** @type {const} */ ("profile"), kind: /** @type {const} */ ("soft") };
}

function inferNoiseTolerance(intent, companions) {
  if (companions.includes("spousePartner")) return "quiet";
  if (companions.includes("familyWithKids")) return "lively_ok";
  if (Array.isArray(intent.vibes) && intent.vibes.some((v) => /quiet|calm|relax/i.test(v))) {
    return "quiet";
  }
  return UNKNOWN;
}

/**
 * @param {object[]} dayItems
 */
function summarizeDayGeography(dayItems) {
  const withCoords = dayItems.filter((i) => typeof i.lat === "number" && typeof i.lng === "number");
  if (!withCoords.length) return { anchor: null, names: dayItems.map((i) => i.name).filter(Boolean) };
  const lat = withCoords.reduce((s, i) => s + i.lat, 0) / withCoords.length;
  const lng = withCoords.reduce((s, i) => s + i.lng, 0) / withCoords.length;
  return {
    anchor: { lat, lng },
    names: dayItems.map((i) => i.name).filter(Boolean),
  };
}

function seasonFromDate(scheduledDate, now) {
  if (!scheduledDate) return null;
  const d = new Date(`${scheduledDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getUTCMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

/**
 * Apply a simulated resolution to criteria (immutable).
 * @param {import('./constants.js').Criterion[]} criteria
 * @param {string} criterionId
 * @param {unknown} resolvedValue
 */
export function withCriterionValue(criteria, criterionId, resolvedValue) {
  return criteria.map((c) => (c.id === criterionId ? { ...c, value: resolvedValue } : c));
}
