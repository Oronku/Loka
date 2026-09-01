import { buildFinding } from "../types.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

const ADAPTER_COUNTRIES = new Set(["GB", "UK", "EU", "JP", "AU", "NZ", "IN", "BR", "ZA"]);

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkPacking(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip, profile, destinationCountry, isInternational, daysUntilStart } = ctx;

  if (!isInternational || !destinationCountry) return findings;
  if (daysUntilStart != null && daysUntilStart > 60) return findings;

  const homeCountry =
    profile && typeof profile.homeCountry === "string"
      ? profile.homeCountry.trim().toUpperCase()
      : null;
  if (!homeCountry) return findings;

  const checklist = Array.isArray(trip.checklist) ? trip.checklist : [];
  if (checklist.length === 0) return findings;

  const texts = checklist.map((c) => String(c.text || "").toLowerCase());
  const hasAdapter = texts.some((t) => /adapter|converter|plug|power/.test(t));

  const destNeedsAdapter =
    ADAPTER_COUNTRIES.has(destinationCountry) ||
    (homeCountry === "US" && destinationCountry !== "US" && destinationCountry !== "CA");

  if (destNeedsAdapter && !hasAdapter) {
    const adapterDone = checklist.some(
      (c) => /adapter|converter|plug/.test(String(c.text || "")) && c.completed,
    );
    if (!adapterDone) {
      findings.push(
        buildFinding({
          code: "missing_essential",
          axisIds: ["packing"],
          kind: "unknown",
          severity: 1,
          title: "Power adapter not on packing list",
          detail: `Travel from ${homeCountry} to ${destinationCountry} usually needs a plug adapter.`,
          titleKey: "integrity.packing.missingAdapter.title",
          detailKey: "integrity.packing.missingAdapter.detail",
          detailParams: { homeCountry, destinationCountry },
          evidence: [
            { what: "homeCountry", value: homeCountry, source: "profile" },
            { what: "destinationCountry", value: destinationCountry, source: "trip" },
          ],
          resolution: {
            kind: "verify_fact",
            hint: "Confirm whether a power adapter is needed and add to checklist.",
          },
        }),
      );
    }
  }

  return findings;
}
