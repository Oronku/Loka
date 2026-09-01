import {
  entityItemId,
  evidenceValue,
  findAttraction,
  questionFromFinding,
  syntheticCandidate,
} from "../helpers.js";
import { localDeliberate } from "../localDeliberate.js";
import { criterion } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const bookingWindowsResolver = {
  codes: ["booking_window_closing", "timed_entry_unbooked"],

  buildSlots(finding, ctx) {
    const itemId = entityItemId(finding, "attraction");
    const item = itemId ? findAttraction(ctx.trip, itemId) : null;
    return [{
      slotId: `resolve-${finding.code}-${finding.id.slice(0, 8)}`,
      axisId: finding.axisIds[0] || "dayPlan",
      label: item?.name || finding.title,
      scheduledDate: item?.scheduledDate || evidenceValue(finding, "scheduledDate") || undefined,
      field: finding.code,
      ideaIds: itemId
        ? [`book-now-${itemId}`, `alt-${itemId}`, `drop-${itemId}`]
        : [],
    }];
  },

  resolveDirect(finding, ctx) {
    if (finding.resolution.kind === "user_action_required") {
      return interpretBookingWindow(finding, ctx);
    }
    return interpretBookingWindow(finding, ctx);
  },

  interpret(finding, result, ctx) {
    return interpretBookingWindow(finding, ctx, result);
  },
};

function interpretBookingWindow(finding, ctx, result = null) {
  const itemId = entityItemId(finding, "attraction");
  const item = itemId ? findAttraction(ctx.trip, itemId) : null;
  const deadline = finding.deadline || evidenceValue(finding, "deadline");

  const candidates = [
    syntheticCandidate(`book-now-${itemId}`, `Book ${item?.name || "now"} before window closes`, {
      action: "book_now",
      urgency: finding.urgency,
    }),
    syntheticCandidate(`alt-${itemId}`, "Find an alternative that's still available", {
      action: "alternative",
    }),
    syntheticCandidate(`drop-${itemId}`, `Drop ${item?.name || "item"} from the plan`, {
      action: "drop",
    }),
  ];

  const slot = {
    slotId: `fix-booking-${finding.id.slice(0, 8)}`,
    axisId: finding.axisIds[0] || "dayPlan",
    label: finding.title,
    scheduledDate: item?.scheduledDate,
    field: finding.code,
  };

  const extraCriteria = [
    criterion("deadline_urgency", "Meets booking deadline", { deadline }, "trip_data", "hard", 4),
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
  const chosen = decision?.chosen;

  if (finding.resolution.kind === "user_action_required") {
    return {
      finding,
      kind: "question",
      questions: [questionFromFinding(finding, {
        header: "Book now?",
        field: finding.code,
        question: `Booking window for ${item?.name || "this item"} may have closed (deadline ${deadline}). What should I do?`,
        options: [
          { label: "Try to book anyway", description: deadline ? `Deadline was ${deadline}` : "" },
          { label: "Find an alternative", description: "" },
          { label: "Remove from plan", description: "" },
        ],
      })],
      decision,
      reasoning: `Deadline: ${deadline || "unknown"}`,
      alternatives: candidates,
    };
  }

  return {
    finding,
    kind: "proposed",
    decision,
    reasoning: `${decision?.reasoning || chosen?.name || "Book before deadline"} — deadline ${deadline || "soon"}`,
    alternatives: decision?.shortlist || candidates,
  };
}
