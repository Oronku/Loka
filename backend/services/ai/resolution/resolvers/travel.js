import {
  evidenceValue,
  questionFromFinding,
  syntheticCandidate,
} from "../helpers.js";
import { localDeliberate } from "../localDeliberate.js";
import { criterion } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const travelResolver = {
  codes: [
    "no_outbound_flight",
    "no_return_flight",
    "tight_connection",
    "flight_outside_trip_range",
  ],

  buildSlots(finding, ctx) {
    const slotId = `resolve-${finding.code}-${finding.id.slice(0, 8)}`;
    const city = ctx.trip?.destinations?.[0]?.city || "";

    if (finding.code === "no_outbound_flight" || finding.code === "no_return_flight") {
      const direction = finding.code === "no_outbound_flight" ? "outbound" : "return";
      return [{
        slotId,
        axisId: "travel",
        label: `${direction} flight`,
        query: `flights ${direction} ${city}`,
        field: "flightChoice",
        ideaIds: (ctx.trip.flights || []).filter((f) => f.status === "idea").map((f) => f.id),
      }];
    }

    if (finding.code === "tight_connection") {
      const connId = finding.entities?.[0]?.itemId;
      return [{
        slotId,
        axisId: "travel",
        label: "Fix tight connection",
        field: "connectionFix",
        ideaIds: [`fix-rebook-${connId}`, `fix-buffer-${connId}`, `fix-alt-route-${connId}`],
      }];
    }

    if (finding.code === "flight_outside_trip_range") {
      return [{
        slotId,
        axisId: "travel",
        label: "Align flight with trip dates",
        field: "flightDateFix",
        ideaIds: ["fix-move-flight", "fix-move-trip-dates", "fix-remove-flight"],
      }];
    }

    return [];
  },

  resolveDirect(finding, ctx) {
    if (finding.code === "no_outbound_flight" || finding.code === "no_return_flight") {
      return {
        finding,
        kind: "question",
        questions: [questionFromFinding(finding, {
          header: "Flights?",
          field: finding.code,
          question: finding.code === "no_outbound_flight"
            ? "Do you already have an outbound flight booked, or should I search for options?"
            : "Do you already have a return flight booked, or should I search for options?",
          options: [
            { label: "Already booked — I'll add details", description: "" },
            { label: "Search for flight options", description: "" },
            { label: "Not flying — different transport", description: "" },
          ],
        })],
        reasoning: "Flight data unavailable offline — need traveler input",
      };
    }
    return null;
  },

  interpret(finding, result, ctx) {
    const direct = travelResolver.resolveDirect?.(finding, ctx);
    if (direct) return direct;

    if (finding.code === "tight_connection" || finding.code === "flight_outside_trip_range") {
      return interpretTravelFix(finding, ctx, result);
    }

    const decision = result.decisions[0];
    if (result.questions.length) {
      return {
        finding,
        kind: "question",
        questions: result.questions.map((q) => questionFromFinding(finding, q)),
        decision,
      };
    }

    if (result.blocked.length) {
      return {
        finding,
        kind: "question",
        questions: [questionFromFinding(finding, {
          header: "Flights?",
          field: finding.code,
          question: "I couldn't find enough flight options — can you share what you have or want?",
          options: [
            { label: "I'll add my booking", description: "" },
            { label: "Help me search later", description: "" },
          ],
        })],
        blockedWhy: result.blocked[0].why,
      };
    }

    return {
      finding,
      kind: "proposed",
      decision,
      reasoning: decision?.reasoning,
    };
  },
};

function interpretTravelFix(finding, ctx, result = null) {
  const connId = finding.entities?.[0]?.itemId;

  /** @type {import('../../deliberation/constants.js').Candidate[]} */
  let candidates;
  if (finding.code === "tight_connection") {
    candidates = [
      syntheticCandidate(`fix-rebook-${connId}`, "Rebook onto a later connecting flight", { fixType: "rebook" }),
      syntheticCandidate(`fix-buffer-${connId}`, "Add buffer — fly a day earlier", { fixType: "buffer" }),
      syntheticCandidate(`fix-alt-route-${connId}`, "Different routing with longer layover", { fixType: "alt_route" }),
    ];
  } else {
    const flightDate = evidenceValue(finding, "flightDate");
    candidates = [
      syntheticCandidate("fix-move-flight", "Move flight to match trip dates", { fixType: "move_flight", flightDate }),
      syntheticCandidate("fix-move-trip-dates", "Adjust trip dates to match flight", { fixType: "move_trip" }),
      syntheticCandidate("fix-remove-flight", "Remove misaligned flight", { fixType: "drop" }),
    ];
  }

  const slot = {
    slotId: `fix-travel-${finding.id.slice(0, 8)}`,
    axisId: "travel",
    label: finding.title,
    field: finding.code,
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
  return {
    finding,
    kind: "proposed",
    decision,
    reasoning: decision?.reasoning || "Ranked travel fixes",
    alternatives: decision?.shortlist || candidates,
  };
}
