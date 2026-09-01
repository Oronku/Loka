import { buildFinding } from "../types.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkBasics(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip, start, end, destination, phase, today } = ctx;

  if (!start || !end) {
    findings.push(
      buildFinding({
        code: "missing_dates",
        axisIds: ["basics"],
        kind: "broken",
        severity: 3,
        blocking: true,
        title: "Trip dates are missing",
        detail: "Without start and end dates, nothing else in the plan can be verified.",
        titleKey: "integrity.basics.missingDates.title",
        detailKey: "integrity.basics.missingDates.detail",
        evidence: [
          { what: "startDate", value: trip.startDate ?? null, source: "trip" },
          { what: "endDate", value: trip.endDate ?? null, source: "trip" },
        ],
        resolution: {
          kind: "propose_change",
          hint: "Set trip start and end dates before assessing viability.",
        },
      }),
    );
    return findings;
  }

  if (end < start) {
    findings.push(
      buildFinding({
        code: "inverted_dates",
        axisIds: ["basics"],
        kind: "broken",
        severity: 3,
        blocking: true,
        title: "End date is before start date",
        detail: `The trip ends on ${end} but starts on ${start}.`,
        titleKey: "integrity.basics.invertedDates.title",
        detailKey: "integrity.basics.invertedDates.detail",
        detailParams: { startDate: start, endDate: end },
        evidence: [
          { what: "startDate", value: start, source: "trip" },
          { what: "endDate", value: end, source: "trip" },
        ],
        resolution: {
          kind: "propose_change",
          hint: "Fix inverted trip dates.",
        },
      }),
    );
  }

  if (!destination) {
    findings.push(
      buildFinding({
        code: "missing_destination",
        axisIds: ["basics"],
        kind: "broken",
        severity: 2,
        blocking: true,
        title: "No destination set",
        detail: "The trip has dates but nowhere to go — most checks cannot run.",
        titleKey: "integrity.basics.missingDestination.title",
        detailKey: "integrity.basics.missingDestination.detail",
        evidence: [{ what: "destination", value: null, source: "trip" }],
        resolution: {
          kind: "propose_change",
          hint: "Add a destination to the trip.",
        },
      }),
    );
  }

  if (phase === "past" && end && end < today && trip.status !== "completed") {
    findings.push(
      buildFinding({
        code: "trip_past_still_planning",
        axisIds: ["basics"],
        kind: "at_risk",
        severity: 1,
        blocking: false,
        title: "Trip dates are in the past",
        detail: `The trip ended ${end} but is still marked as active planning.`,
        titleKey: "integrity.basics.tripPast.title",
        detailKey: "integrity.basics.tripPast.detail",
        detailParams: { endDate: end },
        evidence: [{ what: "endDate", value: end, source: "trip" }],
        resolution: {
          kind: "ask_user",
          hint: "Confirm whether this trip should be archived or dates updated.",
        },
      }),
    );
  }

  return findings;
}
