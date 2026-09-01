import {
  entityItemId,
  evidenceValue,
  questionFromFinding,
  syntheticCandidate,
} from "../helpers.js";
import { localDeliberate } from "../localDeliberate.js";
import { criterion } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const transportResolver = {
  codes: [
    "missing_arrival_transfer",
    "missing_departure_transfer",
    "late_night_no_transfer",
    "late_night_arrival",
    "ride_flight_mismatch",
  ],

  buildSlots(finding, ctx) {
    const slotId = `resolve-${finding.code}-${finding.id.slice(0, 8)}`;
    return [{
      slotId,
      axisId: "transport",
      label: finding.title,
      field: finding.code,
      ideaIds: [
        `transfer-taxi-${finding.id.slice(0, 6)}`,
        `transfer-rideshare-${finding.id.slice(0, 6)}`,
        `transfer-transit-${finding.id.slice(0, 6)}`,
      ],
    }];
  },

  resolveDirect(finding, ctx) {
    return interpretTransfer(finding, ctx);
  },

  interpret(finding, result, ctx) {
    return interpretTransfer(finding, ctx, result);
  },
};

function interpretTransfer(finding, ctx, result = null) {
  if (finding.code === "late_night_arrival") {
    return interpretLateNightArrival(finding, ctx, result);
  }

  const suffix = finding.id.slice(0, 6);
  const candidates = [
    syntheticCandidate(`transfer-taxi-${suffix}`, "Private taxi / car service", {
      mode: "taxi",
      cost: 45,
      durationMinutes: 35,
    }),
    syntheticCandidate(`transfer-rideshare-${suffix}`, "Rideshare (Uber/Bolt)", {
      mode: "rideshare",
      cost: 28,
      durationMinutes: 40,
    }),
    syntheticCandidate(`transfer-transit-${suffix}`, "Public transit + short walk", {
      mode: "transit",
      cost: 5,
      durationMinutes: 55,
    }),
  ];

  if (finding.code === "ride_flight_mismatch") {
    candidates.push(
      syntheticCandidate(`transfer-retime-${suffix}`, "Retime pickup to match flight", {
        mode: "retime",
        fixType: "retime_ride",
      }),
    );
  }

  const slot = {
    slotId: `fix-transport-${finding.id.slice(0, 8)}`,
    axisId: "transport",
    label: finding.title,
    field: finding.code,
  };

  const budgetLevel = ctx.trip?.intent?.budgetLevel;
  const costCeiling = budgetLevel === "budget" ? 30 : budgetLevel === "splurge" ? 120 : 60;

  const extraCriteria = [
    criterion("transfer_cost", "Transfer cost", costCeiling, "intent", "soft", 2),
    criterion("transfer_time", "Travel time", finding.code === "late_night_no_transfer" ? 45 : 60, "trip_data", "soft", 2),
  ];

  const local = result || localDeliberate({
    slot,
    candidates: candidates.slice(0, 4),
    trip: ctx.trip,
    profile: ctx.profile,
    axes: ctx.axes,
    extraCriteria,
    useResolutionScoring: true,
    now: ctx.now,
  });

  const decision = local.decisions[0];

  if (local.questions.length) {
    return {
      finding,
      kind: "question",
      questions: local.questions.map((q) => questionFromFinding(finding, q)),
      decision,
    };
  }

  const chosen = decision?.chosen;
  /** @type {object[]} */
  const operations = [];
  if (chosen && chosen.attributes?.fixType !== "retime_ride") {
    operations.push({
      op: "add",
      entity: "attraction",
      after: {
        name: chosen.name,
        type: "travel",
        status: "idea",
        price: chosen.attributes?.cost,
      },
      provenance: {
        origin: "model_guess",
        verified: false,
        sourceUrl: null,
        note: "Transfer option for airport",
      },
    });
  } else if (chosen?.attributes?.fixType === "retime_ride") {
    const rideId = entityItemId(finding, "ride") || entityItemId(finding, "attraction");
    if (rideId) {
      operations.push({
        op: "update",
        entity: "attraction",
        itemId: rideId,
        after: { scheduledTime: "adjusted" },
        provenance: { origin: "model_guess", verified: false, sourceUrl: null, note: "Retime to match flight" },
      });
    }
  }

  return {
    finding,
    kind: "proposed",
    operations,
    decision,
    reasoning: decision?.reasoning || "Ranked transfer options by cost and time",
    alternatives: decision?.shortlist || candidates,
  };
}

function interpretLateNightArrival(finding, ctx, result = null) {
  const suffix = finding.id.slice(0, 6);
  const arrivalTime = evidenceValue(finding, "arrivalDateTime");

  const candidates = [
    syntheticCandidate(`late-transfer-${suffix}`, "Arrange airport transfer for arrival time", {
      mode: "taxi",
      fixType: "add_transfer",
      cost: 45,
      durationMinutes: 35,
      tieBreak: 1,
    }),
    syntheticCandidate(`late-checkin-${suffix}`, "Confirm late / 24h check-in with property", {
      fixType: "confirm_late_checkin",
      tieBreak: 2,
    }),
    syntheticCandidate(`early-flight-${suffix}`, "Move to an earlier inbound flight", {
      fixType: "earlier_flight",
      tieBreak: 3,
    }),
  ];

  const slot = {
    slotId: `fix-late-arrival-${finding.id.slice(0, 8)}`,
    axisId: "transport",
    label: finding.title,
    field: finding.code,
  };

  const budgetLevel = ctx.trip?.intent?.budgetLevel;
  const costCeiling = budgetLevel === "budget" ? 30 : budgetLevel === "splurge" ? 120 : 60;

  const extraCriteria = [
    criterion("transfer_cost", "Transfer cost", costCeiling, "intent", "soft", 2),
    criterion("transfer_time", "Travel time", 45, "trip_data", "soft", 2),
    criterion("tie_break", "Preference order", true, "trip_data", "soft", 0),
  ];

  const local = result || localDeliberate({
    slot,
    candidates,
    trip: ctx.trip,
    profile: ctx.profile,
    axes: ctx.axes,
    extraCriteria,
    useResolutionScoring: true,
    now: ctx.now,
  });

  const decision = local.decisions[0];

  if (local.questions.length) {
    return {
      finding,
      kind: "question",
      questions: local.questions.map((q) => questionFromFinding(finding, q)),
      decision,
    };
  }

  const chosen = decision?.chosen;
  /** @type {object[]} */
  const operations = [];
  if (chosen?.attributes?.fixType === "add_transfer") {
    operations.push({
      op: "add",
      entity: "attraction",
      after: {
        name: chosen.name,
        type: "travel",
        status: "idea",
        price: chosen.attributes?.cost,
        notes: arrivalTime ? `Arrival ${arrivalTime}` : undefined,
      },
      provenance: {
        origin: "model_guess",
        verified: false,
        sourceUrl: null,
        note: "Late-night airport transfer",
      },
    });
  } else if (chosen?.attributes?.fixType === "confirm_late_checkin") {
    const hotelId = entityItemId(finding, "hotel");
    if (hotelId) {
      operations.push({
        op: "update",
        entity: "hotel",
        itemId: hotelId,
        after: { notes: "Confirm late / 24h check-in for arrival" },
        provenance: {
          origin: "model_guess",
          verified: false,
          sourceUrl: null,
          note: "Late check-in confirmation",
        },
      });
    }
  } else if (chosen?.attributes?.fixType === "earlier_flight") {
    const flightId = entityItemId(finding, "flight");
    if (flightId) {
      operations.push({
        op: "update",
        entity: "flight",
        itemId: flightId,
        after: { notes: "Search earlier inbound flight" },
        provenance: {
          origin: "model_guess",
          verified: false,
          sourceUrl: null,
          note: "Earlier flight to avoid late arrival",
        },
      });
    }
  }

  return {
    finding,
    kind: "proposed",
    operations,
    decision,
    reasoning: decision?.reasoning || "Ranked late-arrival fixes",
    alternatives: decision?.shortlist || candidates,
  };
}
