/**
 * Deterministic trip readiness — no LLM, side-effect free.
 */

/** @typedef {'basics'|'intent'|'travel'|'stay'|'dayPlan'|'transport'|'money'|'packing'|'people'} ReadinessCategoryId */

/** @typedef {'blocked'|'todo'|'in_progress'|'done'|'not_applicable'} ReadinessStatus */

/**
 * @typedef {{ key: string, params?: Record<string, unknown> }} ReadinessLocalizedItem
 */

/**
 * @typedef {Object} ReadinessNextAction
 * @property {string} label
 * @property {string} labelKey
 * @property {Record<string, unknown>} labelParams
 * @property {{ kind: 'panel'|'route'|'loka', value: string }} target
 * @property {string} [lokaPrompt]
 */

/**
 * @typedef {Object} ReadinessCategory
 * @property {ReadinessCategoryId} id
 * @property {ReadinessStatus} status
 * @property {number} score
 * @property {number} weight
 * @property {string} summary
 * @property {string} summaryKey
 * @property {Record<string, unknown>} summaryParams
 * @property {string[]} facts
 * @property {ReadinessLocalizedItem[]} factItems
 * @property {ReadinessNextAction|null} [nextAction]
 * @property {string[]} blockers
 * @property {ReadinessLocalizedItem[]} blockerItems
 */

/** @param {string} key @param {Record<string, unknown>} [params] @returns {ReadinessLocalizedItem} */
function loc(key, params = {}) {
  return { key, params };
}

/** @param {string} tripId @returns {string} */
function settingsRoute(tripId) {
  return `/trip/${tripId}/settings`;
}

/** @param {string} tripId @returns {string} */
function intentRoute(tripId) {
  return `/trip/${tripId}/intent`;
}

/** @param {string} tripId @param {string|null|undefined} [date] @returns {string} */
function addFlightRoute(tripId, date) {
  const base = `/addFlight?tripId=${tripId}`;
  return date ? `${base}&date=${date}` : base;
}

/** @param {string} tripId @param {string|null|undefined} [checkIn] @returns {string} */
function addHotelRoute(tripId, checkIn) {
  const base = `/addHotel?tripId=${tripId}`;
  return checkIn ? `${base}&checkIn=${checkIn}` : base;
}

/** @param {string} tripId @param {string|null|undefined} [date] @returns {string} */
function addRideRoute(tripId, date) {
  const base = `/addRide?tripId=${tripId}`;
  return date ? `${base}&date=${date}` : base;
}

/** @param {string} tripId @param {string|null|undefined} [date] @returns {string} */
function addPlaceRoute(tripId, date) {
  const base = `/addAttraction?tripId=${tripId}`;
  return date ? `${base}&date=${date}` : base;
}

/**
 * Finite registry of readiness i18n keys the backend may emit (summary, fact, blocker, action).
 * @type {ReadonlySet<string>}
 */
export const READINESS_I18N_KEYS = new Set([
  // basics
  "basics.missingFields",
  "basics.missingField",
  "basics.invertedDates",
  "basics.startDate",
  "basics.endDate",
  "basics.complete",
  "basics.dayCount",
  "basics.setBasics",
  "basics.fixDates",
  // intent
  "intent.captured",
  "intent.empty",
  "intent.noDetails",
  "intent.pace",
  "intent.vibeCount",
  "intent.priorityCount",
  "intent.shareIntent",
  // travel
  "travel.none",
  "travel.flightCount",
  "travel.bothEndsCovered",
  "travel.oneDirection",
  "travel.needsAlignment",
  "travel.outboundMissing",
  "travel.returnMissing",
  "travel.misaligned",
  "travel.addFlights",
  "travel.addReturn",
  "travel.addOutbound",
  // stay
  "stay.needDates",
  "stay.singleDay",
  "stay.oneDayTrip",
  "stay.noneCovered",
  "stay.allCovered",
  "stay.partialCovered",
  "stay.uncoveredNight",
  "stay.hotelCount",
  "stay.setDates",
  "stay.addHotel",
  "stay.fillGaps",
  // dayPlan
  "dayPlan.needDates",
  "dayPlan.nonePlanned",
  "dayPlan.allPlanned",
  "dayPlan.partial",
  "dayPlan.emptyDate",
  "dayPlan.scheduledDays",
  "dayPlan.setDates",
  "dayPlan.roughOutDays",
  "dayPlan.addPlace",
  "dayPlan.fillEmptyDays",
  // transport
  "transport.singleCityNoFlights",
  "transport.noTransferNeeded",
  "transport.missingKeyTransfers",
  "transport.someMissing",
  "transport.ridesBooked",
  "transport.rideCount",
  "transport.noRidesYet",
  "transport.noLocalTransport",
  "transport.noAirportTransfer",
  "transport.noHotelChangeTransfer",
  "transport.addAirportTransfer",
  "transport.addMissingTransfer",
  "transport.addRide",
  // money
  "money.noBudget",
  "money.expenseCount",
  "money.noBudgetOrExpenses",
  "money.spentOfBudget",
  "money.budgetLine",
  "money.spentLine",
  "money.remainingLine",
  "money.overBudget",
  "money.setBudget",
  // packing
  "packing.empty",
  "packing.itemCount",
  "packing.allPacked",
  "packing.allComplete",
  "packing.partial",
  "packing.itemsLeft",
  "packing.startList",
  "packing.finishList",
  // people
  "people.solo",
  "people.justYou",
  "people.travelerCount",
  "people.membersPending",
  "people.pendingInviteCount",
  "people.noInvites",
  "people.confirmed",
  "people.followUpInvites",
  "people.inviteCrew",
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Param keys whose string values are structured identifiers, not pre-formatted prose. */
const ALLOWED_STRING_PARAM_KEYS = new Set([
  "field",
  "pace",
  "destination",
  "currency",
]);

/** @param {unknown} value @returns {boolean} */
function isMoneyParam(value) {
  if (!value || typeof value !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (value);
  return typeof o.amount === "number" && typeof o.currency === "string";
}

/** @param {unknown} value @param {string} path @returns {void} */
function assertStructuredParam(value, path) {
  if (value == null) return;
  if (typeof value === "number" || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) return;
    const key = path.split(".").pop() ?? "";
    if (ALLOWED_STRING_PARAM_KEYS.has(key)) return;
    if (/\.fields\[\d+\]$/.test(path)) return;
    throw new Error(`Pre-formatted string param at ${path}: ${value}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertStructuredParam(item, `${path}[${i}]`));
    return;
  }
  if (isMoneyParam(value)) return;
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
      assertStructuredParam(v, `${path}.${k}`);
    }
  }
}

/** @param {ReadinessLocalizedItem} item @param {string} context */
function assertLocalizedItem(item, context) {
  if (!READINESS_I18N_KEYS.has(item.key)) {
    throw new Error(`Unknown readiness i18n key ${item.key} in ${context}`);
  }
  assertStructuredParam(item.params ?? {}, `${context}.${item.key}`);
}

/** @param {ReturnType<typeof computeTripReadiness>} readiness */
export function assertReadinessI18n(readiness) {
  for (const cat of readiness.categories) {
    if (!READINESS_I18N_KEYS.has(cat.summaryKey)) {
      throw new Error(`Unknown summaryKey ${cat.summaryKey} for ${cat.id}`);
    }
    assertStructuredParam(cat.summaryParams ?? {}, `${cat.id}.summary`);
    if (cat.facts.length !== cat.factItems.length) {
      throw new Error(`facts/factItems length mismatch for ${cat.id}`);
    }
    if (cat.blockers.length !== cat.blockerItems.length) {
      throw new Error(`blockers/blockerItems length mismatch for ${cat.id}`);
    }
    cat.factItems.forEach((item, i) => assertLocalizedItem(item, `${cat.id}.fact[${i}]`));
    cat.blockerItems.forEach((item, i) => assertLocalizedItem(item, `${cat.id}.blocker[${i}]`));
    if (cat.nextAction) {
      if (!READINESS_I18N_KEYS.has(cat.nextAction.labelKey)) {
        throw new Error(`Unknown labelKey ${cat.nextAction.labelKey} for ${cat.id}`);
      }
      assertStructuredParam(cat.nextAction.labelParams ?? {}, `${cat.id}.nextAction`);
      if (cat.nextAction.target.kind === "panel") {
        const validPanels = new Set(["money", "checklist", "ideas", "people", "readiness"]);
        if (!validPanels.has(cat.nextAction.target.value)) {
          throw new Error(
            `Invalid panel target "${cat.nextAction.target.value}" for ${cat.id}`,
          );
        }
      }
    }
  }
}

const CATEGORY_ORDER = /** @type {ReadinessCategoryId[]} */ ([
  "basics",
  "intent",
  "travel",
  "stay",
  "dayPlan",
  "transport",
  "money",
  "packing",
  "people",
]);

const VALID_PACE = new Set(["freedom", "relax", "optimize", "fullDayOfPlans"]);
const VALID_COMPANIONS = new Set([
  "justMe",
  "spousePartner",
  "friendsFamily",
  "familyWithKids",
]);

/** @type {Record<string, Record<ReadinessCategoryId, number>>} */
const PHASE_WEIGHTS = {
  planning: {
    basics: 4,
    intent: 1.5,
    travel: 3,
    stay: 3,
    dayPlan: 3.5,
    transport: 1,
    money: 1,
    packing: 0.15,
    people: 1,
  },
  imminent: {
    basics: 1.5,
    intent: 1,
    travel: 2,
    stay: 2,
    dayPlan: 2.5,
    transport: 3,
    money: 2.5,
    packing: 3.5,
    people: 1.5,
  },
  active: {
    basics: 0.5,
    intent: 0.25,
    travel: 1,
    stay: 1,
    dayPlan: 0.5,
    transport: 2.5,
    money: 2,
    packing: 2,
    people: 0.5,
  },
  past: {
    basics: 0,
    intent: 0,
    travel: 0,
    stay: 0,
    dayPlan: 0,
    transport: 0,
    money: 3,
    packing: 0,
    people: 0,
  },
};

/** @param {unknown} value @returns {string|null} */
export function dateOnly(value) {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** @param {string} later @param {string} earlier @returns {number|null} */
export function daysBetweenDateStrings(later, earlier) {
  const a = dateOnly(later);
  const b = dateOnly(earlier);
  if (!a || !b) return null;
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((da - db) / 86400000);
}

/** @param {string} startDate @param {string} endDate @returns {string[]} */
export function enumerateTripDays(startDate, endDate) {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (!start || !end || end < start) return [];

  const days = [];
  let current = start;
  while (current <= end) {
    days.push(current);
    const d = new Date(`${current}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    current = d.toISOString().slice(0, 10);
  }
  return days;
}

/** @param {string} dateStr @returns {string} */
export function weekdayForDate(dateStr) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date(`${dateOnly(dateStr)}T12:00:00Z`);
  return labels[d.getUTCDay()] || "???";
}

/**
 * @param {string|null|undefined} start
 * @param {string|null|undefined} end
 * @param {string} today
 * @returns {'planning'|'imminent'|'active'|'past'}
 */
export function deriveTripPhase(start, end, today) {
  if (end && end < today) return "past";
  if (start && start <= today && (!end || end >= today)) return "active";
  const daysUntilStart = start ? daysBetweenDateStrings(start, today) : null;
  if (daysUntilStart != null && daysUntilStart <= 3 && daysUntilStart >= 0) {
    return "imminent";
  }
  return "planning";
}

/** @param {object} flight @returns {string|null} */
function flightDate(flight) {
  if (!flight) return null;
  const dt =
    flight.departureDateTime ||
    flight.date ||
    flight.arrivalDateTime ||
    null;
  return dateOnly(dt);
}

/** @param {object} ride @returns {string|null} */
function rideDate(ride) {
  if (!ride) return null;
  return dateOnly(ride.pickupDateTime || ride.date);
}

/** @param {string} start @param {string} end @returns {string[]} */
function tripNightDates(start, end) {
  const startD = dateOnly(start);
  const endD = dateOnly(end);
  if (!startD || !endD) return [];
  const span = daysBetweenDateStrings(endD, startD);
  if (span == null || span <= 0) return [];
  const nights = [];
  let current = startD;
  for (let i = 0; i < span; i += 1) {
    nights.push(current);
    const d = new Date(`${current}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    current = d.toISOString().slice(0, 10);
  }
  return nights;
}

/** @param {string} night @param {object[]} hotels @returns {boolean} */
function nightCoveredByHotel(night, hotels) {
  return (hotels || []).some((h) => {
    const checkIn = dateOnly(h.checkIn);
    const checkOut = dateOnly(h.checkOut);
    if (!checkIn || !checkOut) return false;
    return checkIn <= night && checkOut > night;
  });
}

/** @param {object} trip @returns {string|undefined} */
function primaryDestination(trip) {
  if (typeof trip.destination === "string" && trip.destination.trim()) {
    return trip.destination.trim();
  }
  const first = (trip.destinations || [])[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object" && typeof first.name === "string") {
    return first.name.trim();
  }
  return undefined;
}

/** @param {object} trip @returns {boolean} */
function isSingleCityTrip(trip) {
  const destinations = trip.destinations || [];
  if (destinations.length <= 1) {
    const dest = primaryDestination(trip);
    return Boolean(dest);
  }
  const names = destinations
    .map((d) => (typeof d === "string" ? d : d?.name))
    .filter(Boolean)
    .map((n) => String(n).trim().toLowerCase());
  return new Set(names).size <= 1;
}

/** @param {object} trip @param {string} day @returns {boolean} */
function dayHasScheduledPlan(trip, day) {
  return (trip.attractions || []).some((a) => {
    if (dateOnly(a.scheduledDate) !== day) return false;
    if (a.status === "idea") return false;
    return Boolean(a.scheduledDate || a.status);
  });
}

/** @param {object} trip @returns {boolean} */
function hasMeaningfulIntent(trip) {
  const intent = trip?.intent;
  if (!intent || typeof intent !== "object") return false;
  if (intent.pace && VALID_PACE.has(intent.pace)) return true;
  if (Array.isArray(intent.vibes) && intent.vibes.length > 0) return true;
  if (Array.isArray(intent.priorities) && intent.priorities.length > 0) {
    return true;
  }
  return false;
}

/** @param {object} trip @returns {boolean} */
function intentSaysJustMe(trip) {
  const companions = trip?.intent?.companions;
  if (Array.isArray(companions)) {
    return companions.includes("justMe");
  }
  if (typeof companions === "string") {
    return companions.split(",").map((s) => s.trim()).includes("justMe");
  }
  return false;
}

/** @param {string[]} dates @param {number} [max=3] @returns {string[]} */
function formatDateFacts(dates, max = 3) {
  return dates.slice(0, max);
}

/** @param {object} trip @param {string} tripId @returns {object} */
function assessBasics(trip, tripId) {
  const name = typeof trip.name === "string" && trip.name.trim();
  const destination = primaryDestination(trip);
  const start = dateOnly(trip.startDate);
  const end = dateOnly(trip.endDate);

  /** @type {('name'|'destination'|'startDate'|'endDate')[]} */
  const missing = [];
  if (!name) missing.push("name");
  if (!destination) missing.push("destination");
  if (!start) missing.push("startDate");
  if (!end) missing.push("endDate");

  const missingEnglish = {
    name: "name",
    destination: "destination",
    startDate: "start date",
    endDate: "end date",
  };

  if (missing.length > 0) {
    const missingLabels = missing.map((m) => missingEnglish[m]);
    return {
      status: "blocked",
      score: 0,
      summary: `Missing ${missingLabels.join(", ")}`,
      summaryKey: "basics.missingFields",
      summaryParams: { fields: missing, count: missing.length },
      facts: missingLabels.map((m) => `No ${m}`),
      factItems: missing.map((field) => loc("basics.missingField", { field })),
      blockers: missingLabels.map((m) => `No ${m}`),
      blockerItems: missing.map((field) => loc("basics.missingField", { field })),
      nextAction: {
        label: "Set trip basics",
        labelKey: "basics.setBasics",
        labelParams: {},
        target: { kind: "route", value: settingsRoute(tripId) },
        lokaPrompt: "Help me finish the basics for this trip — name, destination, and dates.",
      },
    };
  }

  if (end < start) {
    return {
      status: "blocked",
      score: 0,
      summary: "End date is before start date",
      summaryKey: "basics.invertedDates",
      summaryParams: { startDate: start, endDate: end },
      facts: [`Start ${start}`, `End ${end}`],
      factItems: [
        loc("basics.startDate", { date: start }),
        loc("basics.endDate", { date: end }),
      ],
      blockers: ["End date is before start date"],
      blockerItems: [loc("basics.invertedDates")],
      nextAction: {
        label: "Fix trip dates",
        labelKey: "basics.fixDates",
        labelParams: {},
        target: { kind: "route", value: settingsRoute(tripId) },
        lokaPrompt: "My trip end date is before the start date — help me fix the dates.",
      },
    };
  }

  const dayCount = enumerateTripDays(start, end).length;
  return {
    status: "done",
    score: 1,
    summary: `${destination} · ${start} to ${end}`,
    summaryKey: "basics.complete",
    summaryParams: { destination, startDate: start, endDate: end },
    facts: [`${dayCount} day${dayCount === 1 ? "" : "s"}`],
    factItems: [loc("basics.dayCount", { count: dayCount })],
    blockers: [],
    blockerItems: [],
    nextAction: null,
  };
}

/** @param {object} trip @param {string} tripId @returns {object} */
function assessIntent(trip, tripId) {
  if (hasMeaningfulIntent(trip)) {
    /** @type {string[]} */
    const facts = [];
    /** @type {ReadinessLocalizedItem[]} */
    const factItems = [];
    if (trip.intent.pace) {
      facts.push(`Pace: ${trip.intent.pace}`);
      factItems.push(loc("intent.pace", { pace: trip.intent.pace }));
    }
    if (trip.intent.vibes?.length) {
      facts.push(`${trip.intent.vibes.length} vibe${trip.intent.vibes.length === 1 ? "" : "s"}`);
      factItems.push(loc("intent.vibeCount", { count: trip.intent.vibes.length }));
    }
    if (trip.intent.priorities?.length) {
      facts.push(
        `${trip.intent.priorities.length} priorit${trip.intent.priorities.length === 1 ? "y" : "ies"}`,
      );
      factItems.push(loc("intent.priorityCount", { count: trip.intent.priorities.length }));
    }
    return {
      status: "done",
      score: 1,
      summary: facts.length ? facts.join(" · ") : "Trip intent captured",
      summaryKey: "intent.captured",
      summaryParams: {
        pace: trip.intent.pace ?? null,
        vibeCount: trip.intent.vibes?.length ?? 0,
        priorityCount: trip.intent.priorities?.length ?? 0,
      },
      facts: facts.slice(0, 4),
      factItems: factItems.slice(0, 4),
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  return {
    status: "todo",
    score: 0,
    summary: "No trip intent yet",
    summaryKey: "intent.empty",
    summaryParams: {},
    facts: ["No pace, vibes, or priorities set"],
    factItems: [loc("intent.noDetails")],
    blockers: [],
    blockerItems: [],
    nextAction: {
      label: "Share what you want from this trip",
      labelKey: "intent.shareIntent",
      labelParams: {},
      target: { kind: "route", value: intentRoute(tripId) },
      lokaPrompt: "Help me figure out what kind of trip I want — pace, vibes, and priorities.",
    },
  };
}

/** @param {object} trip @param {string} tripId @returns {object} */
function assessTravel(trip, tripId) {
  const flights = trip.flights || [];
  const start = dateOnly(trip.startDate);
  const end = dateOnly(trip.endDate);

  if (flights.length === 0) {
    return {
      status: "todo",
      score: 0,
      summary: "No flights added",
      summaryKey: "travel.none",
      summaryParams: {},
      facts: ["0 flights on the trip"],
      factItems: [loc("travel.flightCount", { count: 0 })],
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Add flights",
        labelKey: "travel.addFlights",
        labelParams: {},
        target: { kind: "route", value: addFlightRoute(tripId) },
        lokaPrompt: "I need help adding flights for this trip.",
      },
    };
  }

  const outbound = start
    ? flights.some((f) => {
        const d = flightDate(f);
        if (!d) return false;
        const offset = daysBetweenDateStrings(d, start);
        return offset != null && offset >= -2 && offset <= 1;
      })
    : flights.length >= 1;

  const returnLeg = end
    ? flights.some((f) => {
        const d = flightDate(f);
        if (!d) return false;
        const offset = daysBetweenDateStrings(d, end);
        return offset != null && offset >= -1 && offset <= 2;
      })
    : flights.length >= 2;

  if (outbound && returnLeg) {
    return {
      status: "done",
      score: 1,
      summary: `${flights.length} flight${flights.length === 1 ? "" : "s"} cover both ends`,
      summaryKey: "travel.bothEndsCovered",
      summaryParams: { count: flights.length },
      facts: [`${flights.length} flight${flights.length === 1 ? "" : "s"} booked`],
      factItems: [loc("travel.flightCount", { count: flights.length })],
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  /** @type {string[]} */
  const facts = [`${flights.length} flight${flights.length === 1 ? "" : "s"} on the trip`];
  /** @type {ReadinessLocalizedItem[]} */
  const factItems = [loc("travel.flightCount", { count: flights.length })];
  if (outbound && !returnLeg) {
    facts.push("Return leg not covered yet");
    factItems.push(loc("travel.returnMissing"));
  }
  if (!outbound && returnLeg) {
    facts.push("Outbound leg not covered yet");
    factItems.push(loc("travel.outboundMissing"));
  }
  if (!outbound && !returnLeg) {
    facts.push("Flights don't align with trip dates yet");
    factItems.push(loc("travel.misaligned"));
  }

  return {
    status: "in_progress",
    score: outbound || returnLeg ? 0.5 : 0.25,
    summary: outbound || returnLeg ? "One direction covered" : "Flights need date alignment",
    summaryKey: outbound || returnLeg ? "travel.oneDirection" : "travel.needsAlignment",
    summaryParams: { count: flights.length },
    facts: facts.slice(0, 4),
    factItems: factItems.slice(0, 4),
    blockers: [],
    blockerItems: [],
    nextAction: {
      label: outbound ? "Add return flight" : "Add outbound flight",
      labelKey: outbound ? "travel.addReturn" : "travel.addOutbound",
      labelParams: {},
      target: { kind: "route", value: addFlightRoute(tripId) },
      lokaPrompt: outbound
        ? "I have an outbound flight but still need a return — help me add it."
        : "I need help adding the outbound flight for this trip.",
    },
  };
}

/** @param {object} trip @param {string} tripId @returns {object} */
function assessStay(trip, tripId) {
  const start = dateOnly(trip.startDate);
  const end = dateOnly(trip.endDate);
  if (!start || !end) {
    return {
      status: "todo",
      score: 0,
      summary: "Set dates to plan stays",
      summaryKey: "stay.needDates",
      summaryParams: {},
      facts: [],
      factItems: [],
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Set trip dates",
        labelKey: "stay.setDates",
        labelParams: {},
        target: { kind: "route", value: settingsRoute(tripId) },
      },
    };
  }

  if (start === end) {
    return {
      status: "not_applicable",
      score: 1,
      summary: "Single-day trip — no overnight stay",
      summaryKey: "stay.singleDay",
      summaryParams: {},
      facts: ["Trip is one day"],
      factItems: [loc("stay.oneDayTrip")],
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  const nights = tripNightDates(start, end);
  const hotels = trip.hotels || [];
  const uncovered = nights.filter((n) => !nightCoveredByHotel(n, hotels));
  const covered = nights.length - uncovered.length;
  const uncoveredSample = formatDateFacts(uncovered);

  if (hotels.length === 0) {
    return {
      status: "todo",
      score: 0,
      summary: `0 of ${nights.length} night${nights.length === 1 ? "" : "s"} covered`,
      summaryKey: "stay.noneCovered",
      summaryParams: { covered: 0, total: nights.length },
      facts: uncoveredSample.map((d) => `Uncovered night: ${d}`),
      factItems: uncoveredSample.map((date) => loc("stay.uncoveredNight", { date })),
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Add a hotel",
        labelKey: "stay.addHotel",
        labelParams: {},
        target: { kind: "route", value: addHotelRoute(tripId, uncovered[0]) },
        lokaPrompt: "Help me add hotels to cover every night of this trip.",
      },
    };
  }

  if (uncovered.length === 0) {
    return {
      status: "done",
      score: 1,
      summary: `All ${nights.length} night${nights.length === 1 ? "" : "s"} covered`,
      summaryKey: "stay.allCovered",
      summaryParams: { total: nights.length },
      facts: [`${hotels.length} hotel${hotels.length === 1 ? "" : "s"} booked`],
      factItems: [loc("stay.hotelCount", { count: hotels.length })],
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  return {
    status: "in_progress",
    score: Math.round((covered / nights.length) * 100) / 100,
    summary: `${covered} of ${nights.length} nights covered`,
    summaryKey: "stay.partialCovered",
    summaryParams: { covered, total: nights.length },
    facts: uncoveredSample.map((d) => `Uncovered night: ${d}`),
    factItems: uncoveredSample.map((date) => loc("stay.uncoveredNight", { date })),
    blockers: [],
    blockerItems: [],
    nextAction: {
      label: "Fill stay gaps",
      labelKey: "stay.fillGaps",
      labelParams: {},
      target: { kind: "route", value: addHotelRoute(tripId, uncovered[0]) },
      lokaPrompt: "Some nights still don't have a hotel — help me fill the gaps.",
    },
  };
}

/** @param {object} trip @param {string} tripId @returns {object} */
function assessDayPlan(trip, tripId) {
  const start = dateOnly(trip.startDate);
  const end = dateOnly(trip.endDate);
  if (!start || !end) {
    return {
      status: "todo",
      score: 0,
      summary: "Set dates to plan days",
      summaryKey: "dayPlan.needDates",
      summaryParams: {},
      facts: [],
      factItems: [],
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Set trip dates",
        labelKey: "dayPlan.setDates",
        labelParams: {},
        target: { kind: "route", value: settingsRoute(tripId) },
      },
    };
  }

  const days = enumerateTripDays(start, end);
  const empty = days.filter((d) => !dayHasScheduledPlan(trip, d));
  const covered = days.length - empty.length;
  const score = days.length ? Math.round((covered / days.length) * 100) / 100 : 0;
  const emptySample = formatDateFacts(empty);

  if (covered === 0) {
    return {
      status: "todo",
      score: 0,
      summary: `0 of ${days.length} days have something planned`,
      summaryKey: "dayPlan.nonePlanned",
      summaryParams: { covered: 0, total: days.length },
      facts: emptySample.map((d) => `Empty: ${d}`),
      factItems: emptySample.map((date) => loc("dayPlan.emptyDate", { date })),
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Rough out your days",
        labelKey: "dayPlan.roughOutDays",
        labelParams: {},
        target: { kind: "loka", value: "dayPlan" },
        lokaPrompt: "Help me rough out a day-by-day plan for this trip.",
      },
    };
  }

  if (empty.length === 0) {
    return {
      status: "done",
      score: 1,
      summary: `All ${days.length} days have something planned`,
      summaryKey: "dayPlan.allPlanned",
      summaryParams: { total: days.length },
      facts: [`${covered} scheduled day${covered === 1 ? "" : "s"}`],
      factItems: [loc("dayPlan.scheduledDays", { count: covered })],
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  const firstEmpty = empty[0] ?? null;
  return {
    status: "in_progress",
    score,
    summary: `${covered} of ${days.length} days have something planned`,
    summaryKey: "dayPlan.partial",
    summaryParams: { covered, total: days.length },
    facts: emptySample.map((d) => `Empty: ${d}`),
    factItems: emptySample.map((date) => loc("dayPlan.emptyDate", { date })),
    blockers: [],
    blockerItems: [],
    nextAction: {
      label: firstEmpty ? `Add a place to ${firstEmpty}` : "Fill empty days",
      labelKey: firstEmpty ? "dayPlan.addPlace" : "dayPlan.fillEmptyDays",
      labelParams: firstEmpty ? { date: firstEmpty } : {},
      target: { kind: "loka", value: "dayPlan" },
      lokaPrompt: `Help me plan ${empty.slice(0, 2).join(" and ")} — those days are still open.`,
    },
  };
}

/** @param {object} trip @returns {{ text: string, item: ReadinessLocalizedItem }|null} */
function findArrivalTransferGap(trip) {
  const flights = trip.flights || [];
  const rides = trip.rides || [];
  if (flights.length === 0) return null;

  const firstFlight = flights[0];
  const arrivalDay = flightDate(firstFlight);
  if (!arrivalDay) return null;

  const hasRideThatDay = rides.some((r) => rideDate(r) === arrivalDay);
  if (!hasRideThatDay) {
    return {
      text: `No airport transfer on ${arrivalDay}`,
      item: loc("transport.noAirportTransfer", { date: arrivalDay }),
    };
  }
  return null;
}

/** @param {object} trip @returns {{ text: string, item: ReadinessLocalizedItem }[]} */
function findHotelChangeGaps(trip) {
  const hotels = [...(trip.hotels || [])]
    .filter((h) => dateOnly(h.checkIn))
    .sort((a, b) => String(dateOnly(a.checkIn)).localeCompare(String(dateOnly(b.checkIn))));
  if (hotels.length < 2) return [];

  /** @type {{ text: string, item: ReadinessLocalizedItem }[]} */
  const gaps = [];
  for (let i = 1; i < hotels.length; i += 1) {
    const day = dateOnly(hotels[i].checkIn);
    if (!day) continue;
    const hasRide = (trip.rides || []).some((r) => rideDate(r) === day);
    if (!hasRide) {
      gaps.push({
        text: `No transfer on hotel change day ${day}`,
        item: loc("transport.noHotelChangeTransfer", { date: day }),
      });
    }
  }
  return gaps;
}

/** @param {object} trip @param {string} tripId @returns {object} */
function assessTransport(trip, tripId) {
  const flights = trip.flights || [];
  const rides = trip.rides || [];

  if (flights.length === 0 && isSingleCityTrip(trip)) {
    return {
      status: "not_applicable",
      score: 1,
      summary: "Single-city trip with no flights",
      summaryKey: "transport.singleCityNoFlights",
      summaryParams: {},
      facts: ["No airport transfer needed"],
      factItems: [loc("transport.noTransferNeeded")],
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  const arrivalGap = findArrivalTransferGap(trip);
  const hotelGaps = findHotelChangeGaps(trip);
  /** @type {string[]} */
  const facts = [];
  /** @type {ReadinessLocalizedItem[]} */
  const factItems = [];
  if (rides.length > 0) {
    facts.push(`${rides.length} ride${rides.length === 1 ? "" : "s"} booked`);
    factItems.push(loc("transport.rideCount", { count: rides.length }));
  } else {
    facts.push("No rides added yet");
    factItems.push(loc("transport.rideCount", { count: 0 }));
  }
  if (arrivalGap) {
    facts.push(arrivalGap.text);
    factItems.push(arrivalGap.item);
  }
  for (const gap of hotelGaps.slice(0, Math.max(0, 4 - facts.length))) {
    facts.push(gap.text);
    factItems.push(gap.item);
  }

  const blockerEntries = [arrivalGap, ...hotelGaps].filter(Boolean);
  const blockers = blockerEntries.map((entry) => entry.text);
  const blockerItems = blockerEntries.map((entry) => entry.item);
  const arrivalDate = arrivalGap?.item.params?.date;

  if (rides.length === 0 && blockers.length > 0) {
    return {
      status: "todo",
      score: 0,
      summary: "Missing key transfers",
      summaryKey: "transport.missingKeyTransfers",
      summaryParams: { count: blockers.length },
      facts: facts.slice(0, 4),
      factItems: factItems.slice(0, 4),
      blockers,
      blockerItems,
      nextAction: {
        label: "Add airport transfer",
        labelKey: "transport.addAirportTransfer",
        labelParams: {},
        target: {
          kind: "route",
          value: addRideRoute(tripId, typeof arrivalDate === "string" ? arrivalDate : undefined),
        },
        lokaPrompt: "I need an airport transfer on arrival — help me add a ride.",
      },
    };
  }

  if (blockers.length > 0) {
    return {
      status: "in_progress",
      score: 0.6,
      summary: "Some transfers still missing",
      summaryKey: "transport.someMissing",
      summaryParams: { count: blockers.length },
      facts: facts.slice(0, 4),
      factItems: factItems.slice(0, 4),
      blockers,
      blockerItems,
      nextAction: {
        label: "Add missing transfer",
        labelKey: "transport.addMissingTransfer",
        labelParams: {},
        target: { kind: "route", value: addRideRoute(tripId) },
        lokaPrompt: "I'm missing a transfer for this trip — help me add the ride.",
      },
    };
  }

  if (rides.length > 0) {
    return {
      status: "done",
      score: 1,
      summary: `${rides.length} ride${rides.length === 1 ? "" : "s"} booked`,
      summaryKey: "transport.ridesBooked",
      summaryParams: { count: rides.length },
      facts: facts.slice(0, 4),
      factItems: factItems.slice(0, 4),
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  if (flights.length > 0) {
    return {
      status: "todo",
      score: 0.2,
      summary: "No rides yet",
      summaryKey: "transport.noRidesYet",
      summaryParams: {},
      facts: facts.slice(0, 4),
      factItems: factItems.slice(0, 4),
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Add airport transfer",
        labelKey: "transport.addAirportTransfer",
        labelParams: {},
        target: { kind: "route", value: addRideRoute(tripId) },
        lokaPrompt: "Help me add rides for this trip, starting with the airport transfer.",
      },
    };
  }

  return {
    status: "todo",
    score: 0,
    summary: "No local transport planned",
    summaryKey: "transport.noLocalTransport",
    summaryParams: {},
    facts: facts.slice(0, 4),
    factItems: factItems.slice(0, 4),
    blockers: [],
    blockerItems: [],
    nextAction: {
      label: "Add a ride",
      labelKey: "transport.addRide",
      labelParams: {},
      target: { kind: "route", value: addRideRoute(tripId) },
    },
  };
}

/** @param {object[]} expenses @returns {Record<string, number>} */
function sumExpensesByCurrency(expenses) {
  /** @type {Record<string, number>} */
  const totals = {};
  for (const e of expenses) {
    const cur = (e.currency || "USD").toUpperCase();
    const amt = Number(e.amount) || 0;
    totals[cur] = Math.round(((totals[cur] || 0) + amt) * 100) / 100;
  }
  return totals;
}

/** @param {number} amount @param {string} currency @returns {{ amount: number, currency: string }} */
function moneyParam(amount, currency) {
  return { amount, currency: currency.toUpperCase() };
}

/** @param {object} trip @returns {object} */
function assessMoney(trip) {
  const budget = trip.budget;
  const expenses = (trip.expenses || []).filter(
    (e) => e?.category !== "settlement",
  );
  const hasBudget =
    budget &&
    typeof budget.totalBudget === "number" &&
    budget.totalBudget > 0;
  const budgetCurrency = (budget?.currency || "USD").toUpperCase();
  const spentByCurrency = sumExpensesByCurrency(expenses);
  const spentInBudgetCurrency = spentByCurrency[budgetCurrency] || 0;

  if (!hasBudget) {
    return {
      status: "todo",
      score: 0,
      summary: "No budget set",
      summaryKey: "money.noBudget",
      summaryParams: {},
      facts: expenses.length
        ? [`${expenses.length} expense${expenses.length === 1 ? "" : "s"} tracked`]
        : ["No budget or expenses yet"],
      factItems: expenses.length
        ? [loc("money.expenseCount", { count: expenses.length })]
        : [loc("money.noBudgetOrExpenses")],
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Set a budget",
        labelKey: "money.setBudget",
        labelParams: {},
        target: { kind: "panel", value: "money" },
        lokaPrompt: "Help me set a trip budget so we can track spend.",
      },
    };
  }

  const remaining = Math.round((budget.totalBudget - spentInBudgetCurrency) * 100) / 100;
  const budgetMoney = moneyParam(budget.totalBudget, budgetCurrency);
  const spentMoney = moneyParam(spentInBudgetCurrency, budgetCurrency);
  const remainingMoney = moneyParam(remaining, budgetCurrency);
  /** @type {string[]} */
  const facts = [
    `Budget: ${budget.totalBudget} ${budgetCurrency}`,
    `Spent: ${spentInBudgetCurrency} ${budgetCurrency}`,
    `Remaining: ${remaining} ${budgetCurrency}`,
  ];
  const factItems = [
    loc("money.budgetLine", { money: budgetMoney }),
    loc("money.spentLine", { money: spentMoney }),
    loc("money.remainingLine", { money: remainingMoney }),
  ];

  const score =
    spentInBudgetCurrency <= budget.totalBudget
      ? spentInBudgetCurrency > 0
        ? 1
        : 0.7
      : 0.4;

  const overBudget = spentInBudgetCurrency > budget.totalBudget;

  return {
    status: spentInBudgetCurrency > 0 || budget.totalBudget > 0 ? "done" : "in_progress",
    score,
    summary: `${spentInBudgetCurrency} of ${budget.totalBudget} ${budgetCurrency} spent`,
    summaryKey: "money.spentOfBudget",
    summaryParams: { spent: spentMoney, budget: budgetMoney },
    facts: facts.slice(0, 4),
    factItems: factItems.slice(0, 4),
    blockers: overBudget
      ? [`Over budget by ${Math.abs(remaining)} ${budgetCurrency}`]
      : [],
    blockerItems: overBudget
      ? [loc("money.overBudget", { over: moneyParam(Math.abs(remaining), budgetCurrency) })]
      : [],
    nextAction: null,
  };
}

/** @param {object} trip @returns {object} */
function assessPacking(trip) {
  const checklist = Array.isArray(trip.checklist) ? trip.checklist : [];
  const flat = checklist.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item.items),
  );

  if (flat.length === 0) {
    return {
      status: "todo",
      score: 0,
      summary: "Packing list is empty",
      summaryKey: "packing.empty",
      summaryParams: {},
      facts: ["0 checklist items"],
      factItems: [loc("packing.itemCount", { count: 0 })],
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Start packing list",
        labelKey: "packing.startList",
        labelParams: {},
        target: { kind: "panel", value: "checklist" },
        lokaPrompt: "Help me start a packing list for this trip.",
      },
    };
  }

  const completed = flat.filter((i) => i.completed).length;
  const score = Math.round((completed / flat.length) * 100) / 100;
  const left = flat.length - completed;

  if (completed === flat.length) {
    return {
      status: "done",
      score: 1,
      summary: `All ${flat.length} items packed`,
      summaryKey: "packing.allPacked",
      summaryParams: { total: flat.length },
      facts: [`${flat.length} items complete`],
      factItems: [loc("packing.allComplete", { count: flat.length })],
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  return {
    status: "in_progress",
    score,
    summary: `${completed} of ${flat.length} items packed`,
    summaryKey: "packing.partial",
    summaryParams: { completed, total: flat.length },
    facts: [`${left} item${left === 1 ? "" : "s"} left`],
    factItems: [loc("packing.itemsLeft", { count: left })],
    blockers: [],
    blockerItems: [],
    nextAction: {
      label: "Finish packing list",
      labelKey: "packing.finishList",
      labelParams: {},
      target: { kind: "panel", value: "checklist" },
      lokaPrompt: "Help me finish the packing list for this trip.",
    },
  };
}

/** @param {object} trip @returns {object} */
function assessPeople(trip) {
  const shared = trip.sharedWith || [];
  const pending = (trip.pendingInvites || []).filter(
    (p) => p?.status === "pending",
  );
  const memberCount = 1 + shared.length;

  if (intentSaysJustMe(trip) || (pending.length === 0 && memberCount === 1)) {
    return {
      status: "not_applicable",
      score: 1,
      summary: memberCount === 1 ? "Solo trip" : "Just you on the trip",
      summaryKey: memberCount === 1 ? "people.solo" : "people.justYou",
      summaryParams: { count: memberCount },
      facts: memberCount === 1 ? ["1 traveler"] : [`${memberCount} travelers`],
      factItems: [loc("people.travelerCount", { count: memberCount })],
      blockers: [],
      blockerItems: [],
      nextAction: null,
    };
  }

  /** @type {string[]} */
  const facts = [`${memberCount} traveler${memberCount === 1 ? "" : "s"}`];
  /** @type {ReadinessLocalizedItem[]} */
  const factItems = [loc("people.travelerCount", { count: memberCount })];
  if (pending.length > 0) {
    facts.push(`${pending.length} pending invite${pending.length === 1 ? "" : "s"}`);
    factItems.push(loc("people.pendingInviteCount", { count: pending.length }));
  }

  if (pending.length > 0) {
    return {
      status: "in_progress",
      score: 0.5,
      summary: `${memberCount} on trip · ${pending.length} invite${pending.length === 1 ? "" : "s"} pending`,
      summaryKey: "people.membersPending",
      summaryParams: { memberCount, pendingCount: pending.length },
      facts: facts.slice(0, 4),
      factItems: factItems.slice(0, 4),
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Follow up on invites",
        labelKey: "people.followUpInvites",
        labelParams: {},
        target: { kind: "panel", value: "people" },
        lokaPrompt: "Some invites are still pending — help me follow up with my travel crew.",
      },
    };
  }

  if (shared.length === 0 && !intentSaysJustMe(trip)) {
    return {
      status: "todo",
      score: 0,
      summary: "No travel companions invited yet",
      summaryKey: "people.noInvites",
      summaryParams: { memberCount },
      facts,
      factItems: factItems.slice(0, 4),
      blockers: [],
      blockerItems: [],
      nextAction: {
        label: "Invite your travel crew",
        labelKey: "people.inviteCrew",
        labelParams: {},
        target: { kind: "panel", value: "people" },
      },
    };
  }

  return {
    status: "done",
    score: 1,
    summary: `${memberCount} traveler${memberCount === 1 ? "" : "s"} confirmed`,
    summaryKey: "people.confirmed",
    summaryParams: { count: memberCount },
    facts: facts.slice(0, 4),
    factItems: factItems.slice(0, 4),
    blockers: [],
    blockerItems: [],
    nextAction: null,
  };
}

/**
 * @param {'planning'|'imminent'|'active'|'past'} phase
 * @param {number|null} daysUntilStart
 * @returns {Record<ReadinessCategoryId, number>}
 */
function weightsForPhase(phase, daysUntilStart) {
  const table = { ...PHASE_WEIGHTS[phase] };
  if (phase === "planning" && daysUntilStart != null && daysUntilStart > 21) {
    table.packing = 0.05;
  }
  return table;
}

/** @param {ReadinessStatus} status @returns {number} */
function urgencyRank(status) {
  switch (status) {
    case "blocked":
      return 0;
    case "todo":
      return 1;
    case "in_progress":
      return 2;
    case "done":
      return 3;
    case "not_applicable":
      return 4;
    default: {
      const /** @type {never} */ _ = status;
      return 5;
    }
  }
}

/** @param {ReadinessCategory[]} categories @returns {boolean} */
function isTripOtherwiseThin(categories) {
  const planningIds = ["travel", "stay", "dayPlan"];
  const planning = categories.filter(
    (c) =>
      planningIds.includes(c.id) &&
      c.status !== "not_applicable" &&
      c.status !== "blocked",
  );
  if (planning.length === 0) return true;
  return planning.every((c) => c.status === "todo" && c.score === 0);
}

/**
 * @param {ReadinessCategoryId} topId
 * @param {'planning'|'imminent'|'active'|'past'} phase
 * @param {ReadinessCategory[]} categories
 * @param {number|null} daysUntilStart
 * @returns {{ headline: string, headlineKey: string, headlineParams: Record<string, string|number> }}
 */
function buildHeadline(topId, phase, categories, daysUntilStart) {
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));

  if (phase === "past") {
    const money = byId.money;
    if (money?.status !== "done") {
      return {
        headlineKey: "readiness.past.settleExpenses",
        headlineParams: {},
        headline: "That trip is wrapped — want me to help settle the expenses?",
      };
    }
    return {
      headlineKey: "readiness.past.done",
      headlineParams: {},
      headline: "That trip is in the books — nice one.",
    };
  }

  if (topId === "basics") {
    return {
      headlineKey: "readiness.basics.missing",
      headlineParams: {},
      headline: "I need dates and a destination before I can really plan this with you.",
    };
  }

  if (topId === "intent") {
    return {
      headlineKey: "readiness.intent.empty",
      headlineParams: {},
      headline: "Tell me what you're hoping for — it'll help me plan the right stuff.",
    };
  }

  if (topId === "travel") {
    return {
      headlineKey: "readiness.travel.none",
      headlineParams: {},
      headline: "Nothing booked to get you there yet — want me to look?",
    };
  }

  if (topId === "stay") {
    const stay = byId.stay;
    const uncoveredCount = (stay?.factItems || []).filter(
      (f) => f.key === "stay.uncoveredNight",
    ).length;
    return {
      headlineKey: "readiness.stay.gaps",
      headlineParams: uncoveredCount ? { uncoveredCount } : {},
      headline:
        uncoveredCount > 0
          ? "Some nights still need a place — want me to help fill the gaps?"
          : "Where you're sleeping is the next gap — want me to look?",
    };
  }

  if (topId === "dayPlan") {
    const day = byId.dayPlan;
    const covered = Number(day?.summaryParams?.covered ?? 0);
    const total = Number(day?.summaryParams?.total ?? 0);
    const emptyCount = total > covered ? total - covered : 0;
    const sampleDate = (day?.factItems || []).find((f) => f.key === "dayPlan.emptyDate")
      ?.params?.date;
    if (emptyCount > 0 && covered > 0) {
      return {
        headlineKey: "readiness.dayPlan.partial",
        headlineParams: {
          emptyCount,
          ...(typeof sampleDate === "string" ? { sampleDate } : {}),
        },
        headline:
          typeof sampleDate === "string"
            ? `Your days are filling in — ${sampleDate} is still open.`
            : `Your days are filling in — ${emptyCount} still look open.`,
      };
    }
    return {
      headlineKey: "readiness.dayPlan.allEmpty",
      headlineParams: { dayCount: total },
      headline: "A few days still look open — want me to sketch something in?",
    };
  }

  if (topId === "transport") {
    const arrivalDay =
      (byId.transport?.factItems || []).find((f) => f.key === "transport.noAirportTransfer")
        ?.params?.date ?? "";
    return {
      headlineKey: "readiness.transport.arrivalGap",
      headlineParams: arrivalDay ? { arrivalDay } : {},
      headline: "You've got a flight but no airport transfer yet — want me to add one?",
    };
  }

  if (topId === "money") {
    return {
      headlineKey: "readiness.money.noBudget",
      headlineParams: {},
      headline: "No budget yet — want me to set one so we can track spend?",
    };
  }

  if (topId === "packing") {
    if (daysUntilStart != null && daysUntilStart <= 3) {
      return {
        headlineKey: "readiness.packing.imminent",
        headlineParams: { daysUntilStart },
        headline: `You're ${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"} out and the packing list is empty.`,
      };
    }
    return {
      headlineKey: "readiness.packing.empty",
      headlineParams: {},
      headline: "Packing list is still empty — want me to draft one for this trip?",
    };
  }

  if (topId === "people") {
    const pendingCount = Number(
      (byId.people?.factItems || []).find((f) => f.key === "people.pendingInviteCount")
        ?.params?.count ?? 0,
    );
    return {
      headlineKey: "readiness.people.invitesPending",
      headlineParams: pendingCount ? { pendingCount } : {},
      headline: "Your crew isn't all on the trip yet — want to send invites?",
    };
  }

  return {
    headlineKey: "readiness.general.nextSteps",
    headlineParams: {},
    headline: "A few things still need love — want me to walk through what's next?",
  };
}

/** @param {ReadinessCategory[]} categories @returns {ReadinessStatus} */
function deriveOverallStatus(categories) {
  if (categories.some((c) => c.status === "blocked")) return "blocked";
  const applicable = categories.filter((c) => c.status !== "not_applicable");
  if (applicable.every((c) => c.status === "done")) return "done";
  if (applicable.some((c) => c.status === "in_progress")) return "in_progress";
  if (applicable.some((c) => c.status === "todo")) return "todo";
  return "in_progress";
}

/**
 * @param {object} trip
 * @param {{ now?: Date, viewerId?: string }} [options]
 */
export function computeTripReadiness(trip, { now = new Date(), viewerId } = {}) {
  void viewerId;

  const safeTrip = trip && typeof trip === "object" ? trip : {};
  const tripId = safeTrip.id || safeTrip._id?.toString?.() || "unknown";
  const today = dateOnly(now.toISOString()) || now.toISOString().slice(0, 10);

  const start = dateOnly(safeTrip.startDate);
  const end = dateOnly(safeTrip.endDate);
  const daysUntilStart = start ? daysBetweenDateStrings(start, today) : null;
  const phase = deriveTripPhase(start, end, today);

  const assessors = {
    basics: () => assessBasics(safeTrip, tripId),
    intent: () => assessIntent(safeTrip, tripId),
    travel: () => assessTravel(safeTrip, tripId),
    stay: () => assessStay(safeTrip, tripId),
    dayPlan: () => assessDayPlan(safeTrip, tripId),
    transport: () => assessTransport(safeTrip, tripId),
    money: () => assessMoney(safeTrip),
    packing: () => assessPacking(safeTrip),
    people: () => assessPeople(safeTrip),
  };

  const weightTable = weightsForPhase(phase, daysUntilStart);

  /** @type {ReadinessCategory[]} */
  const categories = CATEGORY_ORDER.map((id) => {
    const raw = assessors[id]();
    let status = raw.status;
    let score = raw.score;
    let nextAction = raw.nextAction ?? null;

    if (phase === "past" && id !== "money") {
      if (status !== "blocked") {
        status = status === "done" ? "done" : "not_applicable";
        score = status === "done" ? 1 : 0;
        nextAction = null;
      }
    }

    if (status === "done" || status === "not_applicable") {
      nextAction = null;
    }

    return {
      id,
      status,
      score,
      weight: weightTable[id] ?? 1,
      summary: raw.summary,
      summaryKey: raw.summaryKey,
      summaryParams: raw.summaryParams ?? {},
      facts: (raw.facts || []).slice(0, 4),
      factItems: (raw.factItems || []).slice(0, 4),
      nextAction,
      blockers: raw.blockers || [],
      blockerItems: raw.blockerItems || [],
    };
  });

  let totalWeight = 0;
  let weightedSum = 0;
  for (const cat of categories) {
    if (cat.status === "not_applicable") continue;
    totalWeight += cat.weight;
    weightedSum += cat.score * cat.weight;
  }
  const overallScore =
    totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 100) / 100
      : 0;

  /** @type {ReadinessCategoryId[]} */
  let nextUp = [...categories]
    .filter((c) => c.status !== "done" && c.status !== "not_applicable")
    .sort((a, b) => {
      const r = urgencyRank(a.status) - urgencyRank(b.status);
      if (r !== 0) return r;
      return (b.weight || 0) - (a.weight || 0);
    })
    .slice(0, 3)
    .map((c) => c.id);

  const intentCat = categories.find((c) => c.id === "intent");
  if (
    intentCat?.status === "todo" &&
    isTripOtherwiseThin(categories) &&
    !nextUp.includes("intent")
  ) {
    nextUp = ["intent", ...nextUp].slice(0, 3);
  }

  const topId = nextUp[0] || "basics";
  const { headline, headlineKey, headlineParams } = buildHeadline(
    topId,
    phase,
    categories,
    daysUntilStart,
  );

  return {
    tripId,
    overallScore,
    overallStatus: deriveOverallStatus(categories),
    headline,
    headlineKey,
    headlineParams,
    nextUp,
    daysUntilStart,
    phase,
    categories,
    generatedAt: now.toISOString(),
  };
}

/** @param {ReturnType<typeof computeTripReadiness>} readiness */
export function readinessForPrompt(readiness) {
  if (!readiness) return null;
  return {
    overallScore: readiness.overallScore,
    nextUp: readiness.nextUp,
    categories: (readiness.categories || []).map((c) => ({
      id: c.id,
      status: c.status,
      summary: c.summary,
    })),
  };
}

export { enumerateTripDays as deriveTripDays };
