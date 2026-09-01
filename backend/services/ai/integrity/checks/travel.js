import { buildFinding } from "../types.js";
import {
  daysBetweenDateStrings,
  flightArrivalDateTime,
  flightDate,
  parseMinutesHHMM,
  timeFromDateTime,
} from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

const SAME_TICKET_MIN_CONNECTION = 45;
const SELF_TRANSFER_MIN_CONNECTION = 90;

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkTravel(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip, start, end, flights, outboundFlight, returnFlight } = ctx;
  if (!start || !end) return findings;

  if (flights.length === 0) {
    findings.push(
      buildFinding({
        code: "no_outbound_flight",
        axisIds: ["travel"],
        kind: "at_risk",
        severity: 2,
        title: "No flights on the trip",
        detail: "There is no flight covering the start of the trip.",
        titleKey: "integrity.travel.noFlights.title",
        detailKey: "integrity.travel.noFlights.detail",
        evidence: [{ what: "flightCount", value: 0, source: "trip" }],
        resolution: {
          kind: "propose_change",
          hint: "Add an outbound flight aligned with trip start.",
        },
      }),
    );
    return findings;
  }

  const hasOutbound = Boolean(
    start &&
      flights.some((f) => {
        const d = flightDate(f);
        if (!d) return false;
        const offset = daysBetweenDateStrings(d, start);
        return offset != null && offset >= -2 && offset <= 1;
      }),
  );

  const hasReturn = Boolean(
    end &&
      flights.some((f) => {
        const d = flightDate(f);
        if (!d) return false;
        const offset = daysBetweenDateStrings(d, end);
        return offset != null && offset >= -1 && offset <= 2;
      }),
  );

  if (!hasOutbound) {
    findings.push(
      buildFinding({
        code: "no_outbound_flight",
        axisIds: ["travel"],
        kind: "at_risk",
        severity: 2,
        title: "No outbound flight for trip start",
        detail: `Nothing lands near ${start}, the trip start date.`,
        titleKey: "integrity.travel.noOutbound.title",
        detailKey: "integrity.travel.noOutbound.detail",
        detailParams: { startDate: start },
        evidence: [{ what: "startDate", value: start, source: "trip" }],
        resolution: {
          kind: "propose_change",
          hint: "Add a flight arriving on or just before trip start.",
        },
      }),
    );
  }

  if (!hasReturn && end !== start) {
    findings.push(
      buildFinding({
        code: "no_return_flight",
        axisIds: ["travel"],
        kind: "at_risk",
        severity: 2,
        title: "No return flight for trip end",
        detail: `Nothing departs near ${end}, the trip end date.`,
        titleKey: "integrity.travel.noReturn.title",
        detailKey: "integrity.travel.noReturn.detail",
        detailParams: { endDate: end },
        evidence: [{ what: "endDate", value: end, source: "trip" }],
        resolution: {
          kind: "propose_change",
          hint: "Add a return flight aligned with trip end.",
        },
      }),
    );
  }

  for (const flight of flights) {
    const d = flightDate(flight);
    if (!d || !start || !end) continue;
    if (d < start || d > end) {
      findings.push(
        buildFinding({
          code: "flight_outside_trip_range",
          axisIds: ["travel"],
          kind: "broken",
          severity: 2,
          title: "Flight falls outside trip dates",
          detail: `Flight on ${d} is outside ${start}–${end}.`,
          titleKey: "integrity.travel.flightOutsideRange.title",
          detailKey: "integrity.travel.flightOutsideRange.detail",
          detailParams: { flightDate: d, startDate: start, endDate: end },
          entities: [{ entity: "flight", itemId: flight.id }],
          evidence: [
            { what: "flightDate", value: d, source: "flight" },
            { what: "tripRange", value: `${start}/${end}`, source: "trip" },
          ],
          resolution: {
            kind: "propose_change",
            hint: "Move or remove the misaligned flight.",
          },
        }),
      );
    }
  }

  for (const flight of flights) {
    const segments = Array.isArray(flight.segments) ? flight.segments : null;
    if (!segments || segments.length < 2) continue;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const arr = segments[i]?.arrivalDateTime;
      const dep = segments[i + 1]?.departureDateTime;
      if (!arr || !dep) continue;
      const arrMin = parseMinutesHHMM(arr);
      const depMin = parseMinutesHHMM(dep);
      const arrDay = flightDate({ date: arr });
      const depDay = flightDate({ date: dep });
      if (arrMin == null || depMin == null || !arrDay || !depDay) continue;
      let gap = depMin - arrMin;
      if (depDay !== arrDay) {
        gap += daysBetweenDateStrings(depDay, arrDay) * 24 * 60;
      }
      const sameTicket = flight.sameTicket !== false && segments[i].sameTicket !== false;
      const minRequired = sameTicket ? SAME_TICKET_MIN_CONNECTION : SELF_TRANSFER_MIN_CONNECTION;
      if (gap < minRequired) {
        findings.push(
          buildFinding({
            code: "tight_connection",
            axisIds: ["travel"],
            kind: "broken",
            severity: 3,
            blocking: true,
            title: "Connection too tight to make",
            detail: `${gap} minutes between segments — need at least ${minRequired}.`,
            titleKey: "integrity.travel.tightConnection.title",
            detailKey: "integrity.travel.tightConnection.detail",
            detailParams: { gapMinutes: gap, requiredMinutes: minRequired },
            entities: [{ entity: "flight", itemId: flight.id }],
            evidence: [
              { what: "connectionGapMinutes", value: gap, source: "flight.segments" },
              { what: "requiredMinutes", value: minRequired, source: "policy" },
            ],
            resolution: {
              kind: "propose_change",
              hint: "Rebook with a longer connection or single ticket.",
            },
          }),
        );
      }
    }
  }

  const arrivalFlight = outboundFlight || flights[0];
  const arrivalDt = flightArrivalDateTime(arrivalFlight);
  const arrivalTime = timeFromDateTime(arrivalDt);
  const arrivalMin = parseMinutesHHMM(arrivalDt);
  if (arrivalMin != null && arrivalMin >= 23 * 60) {
    findings.push(
      buildFinding({
        code: "late_night_arrival",
        axisIds: ["travel", "stay", "transport"],
        kind: "at_risk",
        severity: 2,
        title: "Late-night arrival",
        detail: `Inbound lands at ${arrivalTime || "late evening"} — check hotel reception and transfers.`,
        titleKey: "integrity.travel.lateNightArrival.title",
        detailKey: "integrity.travel.lateNightArrival.detail",
        detailParams: { arrivalTime: arrivalTime || "23:00+" },
        entities: arrivalFlight?.id
          ? [{ entity: "flight", itemId: arrivalFlight.id }]
          : [],
        evidence: [{ what: "arrivalDateTime", value: arrivalDt, source: "flight" }],
        resolution: {
          kind: "verify_fact",
          hint: "Confirm hotel late check-in and airport transfer availability.",
        },
      }),
    );
  }

  return findings;
}
