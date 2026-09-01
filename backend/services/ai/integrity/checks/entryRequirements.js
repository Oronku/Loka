import { buildFinding } from "../types.js";
import { dateOnly } from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

const PASSPORT_BUFFER_MONTHS = 6;

/** @param {string|null|undefined} expiry @param {string} endDate @returns {boolean|null} true=invalid, false=ok, null=unknown */
function passportCoversTrip(expiry, endDate) {
  if (!expiry || !endDate) return null;
  const exp = dateOnly(expiry);
  const end = dateOnly(endDate);
  if (!exp || !end) return null;
  const required = new Date(`${end}T12:00:00Z`);
  required.setUTCMonth(required.getUTCMonth() + PASSPORT_BUFFER_MONTHS);
  const requiredStr = required.toISOString().slice(0, 10);
  return exp < requiredStr;
}

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkEntryRequirements(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip, start, end, destination, destinationCountry, isInternational, profile, daysUntilStart } =
    ctx;

  if (!start || !end || !destination) return findings;
  if (!isInternational) return findings;
  if (daysUntilStart != null && daysUntilStart > 120) return findings;

  if (profile?.entryDocsVerified === true) return findings;

  const passportExpiry =
    profile && typeof profile.passportExpiry === "string"
      ? profile.passportExpiry
      : null;
  const passportCountry =
    profile && typeof profile.passportCountry === "string"
      ? profile.passportCountry
      : null;

  if (!passportExpiry || !passportCountry) {
    findings.push(
      buildFinding({
        code: "passport_validity_unknown",
        axisIds: ["basics", "travel"],
        kind: "unknown",
        severity: 2,
        title: "Passport validity not confirmed",
        detail: "Which passport are you travelling on, and when does it expire?",
        titleKey: "integrity.entry.passportUnknown.title",
        detailKey: "integrity.entry.passportUnknown.detail",
        evidence: [
          { what: "destination", value: destination, source: "trip" },
          { what: "passportOnFile", value: false, source: "profile" },
        ],
        resolution: {
          kind: "ask_user",
          hint: "Ask which passport they will use and its expiry date.",
        },
      }),
    );
  } else {
    const invalid = passportCoversTrip(passportExpiry, end);
    if (invalid === true) {
      findings.push(
        buildFinding({
          code: "passport_validity_unknown",
          axisIds: ["basics", "travel"],
          kind: "unknown",
          severity: 3,
          blocking: false,
          title: "Passport expiry may not meet destination rules",
          detail: `Passport expires ${passportExpiry} — many destinations require ~${PASSPORT_BUFFER_MONTHS} months beyond ${end}.`,
          titleKey: "integrity.entry.passportShort.title",
          detailKey: "integrity.entry.passportShort.detail",
          detailParams: { expiry: passportExpiry, endDate: end },
          evidence: [
            { what: "passportExpiry", value: passportExpiry, source: "profile" },
            { what: "tripEnd", value: end, source: "trip" },
          ],
          resolution: {
            kind: "verify_fact",
            hint: "Verify destination passport validity rules — do not assert legal requirements.",
          },
        }),
      );
    }
  }

  if (!profile?.visaStatus && isInternational) {
    findings.push(
      buildFinding({
        code: "visa_requirement_unknown",
        axisIds: ["basics", "travel"],
        kind: "unknown",
        severity: 2,
        deadline: start,
        title: "Visa requirement not confirmed",
        detail: `Do you need a visa for ${destination}?`,
        titleKey: "integrity.entry.visaUnknown.title",
        detailKey: "integrity.entry.visaUnknown.detail",
        detailParams: { destination },
        evidence: [
          { what: "destination", value: destination, source: "trip" },
          { what: "visaOnFile", value: false, source: "profile" },
        ],
        resolution: {
          kind: "ask_user",
          hint: "Ask whether a visa is required and if lead time still fits before departure.",
        },
      }),
    );
  }

  if (!profile?.vaccinationStatus && isInternational && daysUntilStart != null && daysUntilStart <= 90) {
    findings.push(
      buildFinding({
        code: "vaccination_requirement_unknown",
        axisIds: ["basics", "packing"],
        kind: "unknown",
        severity: 1,
        title: "Vaccination requirements not confirmed",
        detail: `Any required vaccinations for ${destination}?`,
        titleKey: "integrity.entry.vaccinationUnknown.title",
        detailKey: "integrity.entry.vaccinationUnknown.detail",
        detailParams: { destination },
        evidence: [
          { what: "destination", value: destination, source: "trip" },
          { what: "vaccinationOnFile", value: false, source: "profile" },
        ],
        resolution: {
          kind: "ask_user",
          hint: "Ask about required vaccinations — never assert without authoritative source.",
        },
      }),
    );
  }

  return findings;
}
