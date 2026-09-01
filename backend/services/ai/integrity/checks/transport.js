import { buildFinding } from "../types.js";
import {
  flightArrivalDateTime,
  flightDate,
  parseMinutesHHMM,
  rideDate,
  timeFromDateTime,
} from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkTransport(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip, flights, rides, outboundFlight, returnFlight, start, end } = ctx;
  if (flights.length === 0) return findings;

  const arrivalFlight = outboundFlight || flights[0];
  const arrivalDay = flightDate(arrivalFlight);
  const arrivalDt = flightArrivalDateTime(arrivalFlight);

  if (arrivalDay) {
    const hasArrivalRide = rides.some((r) => rideDate(r) === arrivalDay);
    if (!hasArrivalRide) {
      findings.push(
        buildFinding({
          code: "missing_arrival_transfer",
          axisIds: ["transport"],
          kind: "at_risk",
          severity: 2,
          title: "No transfer on arrival day",
          detail: `Nothing gets you from the airport on ${arrivalDay}.`,
          titleKey: "integrity.transport.missingArrival.title",
          detailKey: "integrity.transport.missingArrival.detail",
          detailParams: { date: arrivalDay },
          evidence: [{ what: "arrivalDate", value: arrivalDay, source: "flight" }],
          resolution: {
            kind: "propose_change",
            hint: "Add an airport transfer on arrival.",
          },
        }),
      );
    }

    const arrivalMin = parseMinutesHHMM(arrivalDt);
    if (arrivalMin != null && arrivalMin >= 22 * 60 && !hasArrivalRide) {
      findings.push(
        buildFinding({
          code: "late_night_no_transfer",
          axisIds: ["transport", "travel"],
          kind: "at_risk",
          severity: 2,
          title: "Late arrival with no transfer booked",
          detail: `Landing at ${timeFromDateTime(arrivalDt) || "night"} — public transit may be shut.`,
          titleKey: "integrity.transport.lateNightNoTransfer.title",
          detailKey: "integrity.transport.lateNightNoTransfer.detail",
          entities: arrivalFlight?.id
            ? [{ entity: "flight", itemId: arrivalFlight.id }]
            : [],
          evidence: [{ what: "arrivalDateTime", value: arrivalDt, source: "flight" }],
          resolution: {
            kind: "propose_change",
            hint: "Book a late-night airport transfer.",
          },
        }),
      );
    }
  }

  const departureFlight = returnFlight || (flights.length > 1 ? flights[flights.length - 1] : null);
  const departureDay = flightDate(departureFlight);
  if (departureDay && end) {
    const hasDepartureRide = rides.some((r) => rideDate(r) === departureDay);
    if (!hasDepartureRide) {
      findings.push(
        buildFinding({
          code: "missing_departure_transfer",
          axisIds: ["transport"],
          kind: "at_risk",
          severity: 1,
          title: "No transfer on departure day",
          detail: `Nothing gets you to the airport on ${departureDay}.`,
          titleKey: "integrity.transport.missingDeparture.title",
          detailKey: "integrity.transport.missingDeparture.detail",
          detailParams: { date: departureDay },
          evidence: [{ what: "departureDate", value: departureDay, source: "flight" }],
          resolution: {
            kind: "propose_change",
            hint: "Add transport to the airport on departure.",
          },
        }),
      );
    }
  }

  for (const ride of rides) {
    const linkedFlightId = ride.flightId || ride.linkedFlightId;
    if (!linkedFlightId) continue;
    const flight = flights.find((f) => f.id === linkedFlightId);
    if (!flight) continue;
    const rideDay = rideDate(ride);
    const flightDay = flightDate(flight);
    const rideMin = parseMinutesHHMM(ride.pickupDateTime || ride.scheduledTime);
    const flightMin = parseMinutesHHMM(
      flight.departureDateTime || flight.arrivalDateTime,
    );
    if (rideDay && flightDay && rideDay !== flightDay) {
      findings.push(
        buildFinding({
          code: "ride_flight_mismatch",
          axisIds: ["transport", "travel"],
          kind: "broken",
          severity: 2,
          title: "Ride does not match its flight day",
          detail: `Ride on ${rideDay} but linked flight is ${flightDay}.`,
          titleKey: "integrity.transport.rideMismatch.title",
          detailKey: "integrity.transport.rideMismatch.detail",
          entities: [
            { entity: "ride", itemId: ride.id },
            { entity: "flight", itemId: flight.id },
          ],
          evidence: [
            { what: "rideDate", value: rideDay, source: "ride" },
            { what: "flightDate", value: flightDay, source: "flight" },
          ],
          resolution: {
            kind: "propose_change",
            hint: "Align ride timing with the flight it serves.",
          },
        }),
      );
    } else if (
      rideDay &&
      flightDay &&
      rideDay === flightDay &&
      rideMin != null &&
      flightMin != null &&
      Math.abs(rideMin - flightMin) > 180
    ) {
      findings.push(
        buildFinding({
          code: "ride_flight_mismatch",
          axisIds: ["transport", "travel"],
          kind: "at_risk",
          severity: 2,
          title: "Ride timing far from flight",
          detail: `Pickup and flight times are ${Math.abs(rideMin - flightMin)} minutes apart.`,
          titleKey: "integrity.transport.rideTiming.title",
          detailKey: "integrity.transport.rideTiming.detail",
          entities: [
            { entity: "ride", itemId: ride.id },
            { entity: "flight", itemId: flight.id },
          ],
          evidence: [
            { what: "rideTime", value: ride.pickupDateTime, source: "ride" },
            { what: "flightTime", value: flight.departureDateTime, source: "flight" },
          ],
          resolution: {
            kind: "verify_fact",
            hint: "Confirm pickup time matches flight schedule.",
          },
        }),
      );
    }
  }

  return findings;
}
