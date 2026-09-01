import {
  evidenceValue,
  evidenceValues,
  entityItemId,
  findHotel,
  hotelAddOperation,
  questionFromFinding,
  syntheticCandidate,
} from "../helpers.js";
import { criterion, UNKNOWN } from "../helpers.js";
import { localDeliberate } from "../localDeliberate.js";

/** @type {import('../types.js').Resolver} */
export const stayResolver = {
  codes: [
    "unhoused_nights",
    "checkin_before_arrival",
    "reception_closed_on_arrival",
    "hotel_gap_mid_trip",
  ],

  buildSlots(finding, ctx) {
    const city = ctx.trip?.destinations?.[0]?.city || ctx.trip?.destinations?.[0]?.name || "";
    const slotId = `resolve-${finding.code}-${finding.id.slice(0, 8)}`;

    if (finding.code === "unhoused_nights") {
      const dates = evidenceValues(finding, "uncoveredNight");
      const firstDate = dates[0] || null;
      return [{
        slotId,
        axisId: "stay",
        label: `Hotel for ${dates.join(", ")}`,
        query: `hotels ${city} ${firstDate || ""}`.trim(),
        scheduledDate: firstDate || undefined,
        field: "stayChoice",
        ideaIds: (ctx.trip.hotels || [])
          .filter((h) => h.status === "idea")
          .map((h) => h.id),
      }];
    }

    if (finding.code === "checkin_before_arrival") {
      const hotelId = entityItemId(finding, "hotel");
      const arrivalDate = evidenceValue(finding, "arrivalDate");
      return [{
        slotId,
        axisId: "stay",
        label: "Align check-in with arrival",
        scheduledDate: arrivalDate || undefined,
        field: "checkinFix",
        ideaIds: [`fix-later-checkin-${hotelId}`, `fix-different-hotel-${hotelId}`].filter(Boolean),
      }];
    }

    if (finding.code === "reception_closed_on_arrival") {
      const hotelId = entityItemId(finding, "hotel");
      const arrivalDate = evidenceValue(finding, "arrivalDate") || evidenceValue(finding, "checkIn");
      return [{
        slotId,
        axisId: "stay",
        label: "Late arrival — reception closed",
        scheduledDate: typeof arrivalDate === "string" ? arrivalDate : undefined,
        field: "lateArrivalFix",
        ideaIds: [
          `fix-late-checkin-${hotelId}`,
          `fix-alt-property-${hotelId}`,
          `fix-first-night-alt-${hotelId}`,
        ],
      }];
    }

    if (finding.code === "hotel_gap_mid_trip") {
      const gapStart = evidenceValue(finding, "gapStart");
      const gapEnd = evidenceValue(finding, "gapEnd");
      return [{
        slotId,
        axisId: "stay",
        label: `Bridge stay ${gapStart}–${gapEnd}`,
        query: `hotels ${city}`,
        scheduledDate: typeof gapStart === "string" ? gapStart : undefined,
        field: "gapBridge",
      }];
    }

    return [];
  },

  resolveDirect(finding, ctx) {
    if (finding.code === "checkin_before_arrival") {
      return interpretCheckinFix(finding, ctx);
    }
    if (finding.code === "reception_closed_on_arrival") {
      return interpretReceptionFix(finding, ctx);
    }
    return null;
  },

  interpret(finding, result, ctx) {
    if (finding.code === "checkin_before_arrival" || finding.code === "reception_closed_on_arrival") {
      const direct = interpretCheckinFix(finding, ctx, result);
      if (direct) return direct;
    }

    const decision = result.decisions[0];
    if (result.questions.length) {
      return {
        finding,
        kind: "question",
        questions: result.questions.map((q) => questionFromFinding(finding, q)),
        decision,
        reasoning: decision?.reasoning,
      };
    }

    if (result.blocked.length) {
      const decision = result.decisions[0];
      if (decision?.shortlist?.length) {
        return {
          finding,
          kind: "proposed",
          decision,
          reasoning: decision.reasoning || result.blocked[0].why,
          alternatives: decision.shortlist,
        };
      }
      return {
        finding,
        kind: "blocked",
        blockedWhy: result.blocked[0].why,
        alternatives: decision?.shortlist || [],
      };
    }

    const chosen = decision?.chosen;
    if (!chosen) {
      return { finding, kind: "blocked", blockedWhy: "No viable stay option found" };
    }

    if (finding.code === "unhoused_nights") {
      const dates = evidenceValues(finding, "uncoveredNight");
      return {
        finding,
        kind: "proposed",
        operations: [hotelAddOperation({
          name: chosen.name,
          checkIn: dates[0],
          checkOut: dates[dates.length - 1],
          status: "idea",
          price: chosen.price,
          sourceUrl: chosen.sourceUrl,
        }, { matchedIdea: chosen.origin === "user_idea" ? chosen : null })],
        decision,
        reasoning: decision.reasoning,
        alternatives: decision.shortlist?.filter((c) => c.id !== chosen.id),
      };
    }

    if (finding.code === "hotel_gap_mid_trip") {
      const gapStart = evidenceValue(finding, "gapStart");
      const gapEnd = evidenceValue(finding, "gapEnd");
      return {
        finding,
        kind: "proposed",
        operations: [hotelAddOperation({
          name: chosen.name,
          checkIn: gapStart,
          checkOut: gapEnd,
          status: "idea",
          price: chosen.price,
        })],
        decision,
        reasoning: decision.reasoning,
      };
    }

    return {
      finding,
      kind: "proposed",
      decision,
      reasoning: decision?.reasoning,
      alternatives: decision?.shortlist,
    };
  },
};

function interpretCheckinFix(finding, ctx, result = null) {
  const hotelId = entityItemId(finding, "hotel");
  const hotel = findHotel(ctx.trip, hotelId);
  const arrivalDate = evidenceValue(finding, "arrivalDate");
  const checkIn = evidenceValue(finding, "checkIn");

  const candidates = [
    syntheticCandidate(`fix-later-checkin-${hotelId}`, "Move check-in to arrival day", {
      fixType: "align_checkin",
      checkIn: arrivalDate,
    }),
    syntheticCandidate(`fix-different-hotel-${hotelId}`, "Switch to hotel with correct dates", {
      fixType: "switch_hotel",
    }),
    syntheticCandidate(`fix-extend-prev-${hotelId}`, "Extend previous booking to cover gap", {
      fixType: "extend_booking",
    }),
  ];

  const slot = {
    slotId: `fix-${finding.id.slice(0, 8)}`,
    axisId: "stay",
    label: "Check-in alignment",
    scheduledDate: typeof arrivalDate === "string" ? arrivalDate : undefined,
  };

  const local = result || localDeliberate({
    slot,
    candidates,
    trip: ctx.trip,
    profile: ctx.profile,
    axes: ctx.axes,
    useResolutionScoring: true,
    now: ctx.now,
  });

  const decision = local.decisions[0];
  const chosen = decision?.chosen;

  if (chosen?.attributes?.fixType === "align_checkin" && hotel) {
    return {
      finding,
      kind: "proposed",
      operations: [{
        op: "update",
        entity: "hotel",
        itemId: hotel.id,
        after: { checkIn: arrivalDate || checkIn },
        provenance: { origin: "model_guess", verified: false, sourceUrl: null, note: "Align check-in with arrival" },
      }],
      decision,
      reasoning: decision?.reasoning || "Move check-in to match your landing date",
    };
  }

  if (local.blocked.length && !decision?.chosen) {
    return { finding, kind: "blocked", blockedWhy: local.blocked[0].why, alternatives: candidates };
  }

  return {
    finding,
    kind: "proposed",
    decision,
    reasoning: decision?.reasoning,
    alternatives: decision?.shortlist || candidates,
  };
}

function interpretReceptionFix(finding, ctx, result = null) {
  const hotelId = entityItemId(finding, "hotel");
  const arrivalDate = evidenceValue(finding, "arrivalDate") || evidenceValue(finding, "checkIn");

  const candidates = [
    syntheticCandidate(`fix-late-checkin-${hotelId}`, "Arrange late check-in with hotel", {
      fixType: "late_checkin",
    }),
    syntheticCandidate(`fix-alt-property-${hotelId}`, "Book a property with 24h reception", {
      fixType: "switch_hotel",
    }),
    syntheticCandidate(`fix-first-night-alt-${hotelId}`, "First night at airport hotel, then main hotel", {
      fixType: "first_night_alt",
    }),
  ];

  const slot = {
    slotId: `fix-${finding.id.slice(0, 8)}`,
    axisId: "stay",
    label: "Late arrival fix",
    scheduledDate: typeof arrivalDate === "string" ? arrivalDate : undefined,
  };

  const local = result || localDeliberate({
    slot,
    candidates,
    trip: ctx.trip,
    profile: ctx.profile,
    axes: ctx.axes,
    useResolutionScoring: true,
    now: ctx.now,
  });

  return {
    finding,
    kind: "proposed",
    decision: local.decisions[0],
    reasoning: local.decisions[0]?.reasoning || "Ranked fixes for late arrival",
    alternatives: local.decisions[0]?.shortlist || candidates,
  };
}

/**
 * Build stay VOI deliberation for tests — two hotels where breakfast unknown flips winner.
 * @param {import('../integrity/types.js').Finding} finding
 * @param {import('../types.js').ResolverContext} ctx
 */
export function buildStayValueOfInfoDeliberation(finding, ctx) {
  const dates = evidenceValues(finding, "uncoveredNight");
  const slot = {
    slotId: `stay-voi-${finding.id.slice(0, 8)}`,
    axisId: "stay",
    label: "Hotel choice",
    scheduledDate: dates[0],
    field: "breakfastPreference",
  };

  const candidates = [
    syntheticCandidate("hotel-budget", "Budget Inn Central", {
      breakfastIncluded: false,
      centralScore: 0.8,
      price: 65,
      rating: 4.2,
      reviewCount: 120,
    }),
    syntheticCandidate("hotel-comfort", "Comfort Hotel Riverside", {
      breakfastIncluded: true,
      centralScore: 0.75,
      price: 75,
      rating: 4.5,
      reviewCount: 340,
    }),
    syntheticCandidate("hotel-value", "City Stay Express", {
      breakfastIncluded: false,
      centralScore: 0.7,
      price: 55,
      rating: 4.0,
      reviewCount: 80,
    }),
  ];

  const extraCriteria = [
    criterion("breakfast_preference", "Breakfast preference", UNKNOWN, "inferred", "soft", 2),
    criterion("location_central", "Central location", true, "intent", "soft", 1.5),
  ];

  return localDeliberate({
    slot,
    candidates,
    trip: ctx.trip,
    profile: ctx.profile,
    axes: ctx.axes,
    extraCriteria,
    useResolutionScoring: true,
    now: ctx.now,
  });
}
