import { evidenceValue, questionFromFinding, syntheticCandidate } from "../helpers.js";
import { localDeliberate } from "../localDeliberate.js";

/** @type {import('../types.js').Resolver} */
export const peopleResolver = {
  codes: [
    "participant_no_flight",
    "participant_no_bed",
    "pending_invites_close",
    "party_over_capacity",
  ],

  buildSlots(finding, ctx) {
    return [{
      slotId: `resolve-${finding.code}-${finding.id.slice(0, 8)}`,
      axisId: "people",
      label: finding.title,
      field: finding.code,
    }];
  },

  resolveDirect(finding, ctx) {
    if (finding.code === "pending_invites_close") {
      return {
        finding,
        kind: "question",
        questions: [questionFromFinding(finding, {
          header: "Invites?",
          field: "pendingInvites",
          question: `Invites are still pending close to departure — chase them or plan without?`,
          options: [
            { label: "Send reminders now", description: "" },
            { label: "Plan for current headcount", description: "" },
            { label: "Extend RSVP deadline", description: "" },
          ],
        })],
        reasoning: finding.resolution.hint,
      };
    }

    if (finding.code === "party_over_capacity") {
      const capacity = evidenceValue(finding, "capacity");
      const partySize = evidenceValue(finding, "partySize");
      const candidates = [
        syntheticCandidate("cap-upgrade", "Upgrade to larger room / suite", { fixType: "upgrade" }),
        syntheticCandidate("cap-split", "Split into two rooms", { fixType: "split" }),
        syntheticCandidate("cap-trim", "Reduce party size for this booking", { fixType: "trim" }),
      ];
      const local = localDeliberate({
        slot: { slotId: `fix-cap-${finding.id.slice(0, 8)}`, axisId: "people", label: "Capacity fix" },
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
        reasoning: `Party ${partySize} exceeds capacity ${capacity}`,
        alternatives: candidates,
      };
    }

    return null;
  },

  interpret(finding, result, ctx) {
    const direct = peopleResolver.resolveDirect?.(finding, ctx);
    if (direct) return direct;

    if (finding.code === "participant_no_flight") {
      const name = evidenceValue(finding, "participantName") || "A traveler";
      return {
        finding,
        kind: "question",
        questions: [questionFromFinding(finding, {
          header: "Flight?",
          field: "participantFlight",
          question: `${name} has no flight booked — add one or mark as not flying?`,
          options: [
            { label: "They'll book their own", description: "" },
            { label: "Add a flight for them", description: "" },
            { label: "Not flying — local only", description: "" },
          ],
        })],
        reasoning: finding.resolution.hint,
      };
    }

    if (finding.code === "participant_no_bed") {
      const name = evidenceValue(finding, "participantName") || "A traveler";
      return {
        finding,
        kind: "question",
        questions: [questionFromFinding(finding, {
          header: "Bed?",
          field: "participantBed",
          question: `${name} has no bed assigned — add to a room or separate booking?`,
          options: [
            { label: "Share existing room", description: "" },
            { label: "Book separate room", description: "" },
            { label: "Staying elsewhere", description: "" },
          ],
        })],
        reasoning: finding.resolution.hint,
      };
    }

    return { finding, kind: "blocked", blockedWhy: "Could not resolve people issue" };
  },
};
