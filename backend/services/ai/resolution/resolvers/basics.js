import { questionFromFinding } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const basicsResolver = {
  codes: [
    "missing_dates",
    "inverted_dates",
    "missing_destination",
    "trip_past_still_planning",
  ],

  buildSlots() {
    return [];
  },

  resolveDirect(finding, ctx) {
    return interpretBasicsQuestion(finding);
  },

  interpret(finding, result, ctx) {
    return interpretBasicsQuestion(finding);
  },
};

function interpretBasicsQuestion(finding) {
  /** @type {{ header: string, field: string, question: string, options: { label: string, description: string }[] }} */
  let q;

  switch (finding.code) {
    case "missing_dates":
      q = {
        header: "Dates?",
        field: "tripDates",
        question: "When does this trip start and end?",
        options: [
          { label: "I'll pick dates now", description: "" },
          { label: "Flexible — suggest dates", description: "" },
          { label: "Dates TBD — keep planning", description: "" },
        ],
      };
      break;
    case "inverted_dates":
      q = {
        header: "Dates?",
        field: "tripDates",
        question: "End date is before start date — which should I swap?",
        options: [
          { label: "Swap start and end", description: "" },
          { label: "I'll set correct dates", description: "" },
        ],
      };
      break;
    case "missing_destination":
      q = {
        header: "Where?",
        field: "destination",
        question: "Where are you headed?",
        options: [
          { label: "I'll name the destination", description: "" },
          { label: "Help me choose", description: "" },
          { label: "Multi-city — I'll specify", description: "" },
        ],
      };
      break;
    case "trip_past_still_planning":
      q = {
        header: "Past trip?",
        field: "tripStatus",
        question: "This trip's dates are in the past but still marked as planning — archive or reschedule?",
        options: [
          { label: "Archive as completed", description: "" },
          { label: "Move to new dates", description: "" },
          { label: "Keep for reference", description: "" },
        ],
      };
      break;
    default:
      return { finding, kind: "blocked", blockedWhy: "Unknown basics issue" };
  }

  return {
    finding,
    kind: "question",
    questions: [questionFromFinding(finding, q)],
    reasoning: finding.resolution.hint,
  };
}
