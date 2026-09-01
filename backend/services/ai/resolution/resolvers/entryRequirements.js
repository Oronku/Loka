import { evidenceValue, questionFromFinding } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const entryRequirementsResolver = {
  codes: [
    "passport_validity_unknown",
    "visa_requirement_unknown",
    "vaccination_requirement_unknown",
  ],

  buildSlots() {
    return [];
  },

  resolveDirect(finding, ctx) {
    return interpretEntryQuestion(finding);
  },

  interpret(finding, result, ctx) {
    return interpretEntryQuestion(finding);
  },
};

function interpretEntryQuestion(finding) {
  const destination = evidenceValue(finding, "destination")
    || evidenceValue(finding, "country")
    || finding.detailParams?.destination
    || "your destination";

  /** @type {{ header: string, field: string, question: string, options: { label: string, description: string }[] }} */
  let q;

  switch (finding.code) {
    case "passport_validity_unknown":
      q = {
        header: "Passport?",
        field: "passportValidity",
        question: `I can't verify passport validity rules for ${destination} — what's your passport expiry date?`,
        options: [
          { label: "Valid 6+ months past trip", description: "" },
          { label: "Expires soon — I'll renew", description: "" },
          { label: "I'll check official sources", description: "" },
        ],
      };
      break;
    case "visa_requirement_unknown":
      q = {
        header: "Visa?",
        field: "visaRequirement",
        question: `Visa rules for ${destination} depend on your nationality — which applies to you?`,
        options: [
          { label: "I know I need a visa", description: "" },
          { label: "Visa-free / visa on arrival", description: "" },
          { label: "I'll verify with embassy", description: "" },
        ],
      };
      break;
    case "vaccination_requirement_unknown":
      q = {
        header: "Vaccines?",
        field: "vaccinationRequirement",
        question: `Health entry requirements for ${destination} may apply — have you checked what's needed?`,
        options: [
          { label: "Required — I'll get them", description: "" },
          { label: "Not required for me", description: "" },
          { label: "I'll check CDC / embassy", description: "" },
        ],
      };
      break;
    default:
      return { finding, kind: "blocked", blockedWhy: "Unknown entry requirement" };
  }

  return {
    finding,
    kind: "verify",
    verifyTask: {
      what: finding.code,
      hint: finding.resolution.hint,
      destination,
    },
    questions: [questionFromFinding(finding, q)],
    reasoning: "Never assert legal requirements — traveler must confirm",
  };
}
