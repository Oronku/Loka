import { buildFinding } from "../types.js";
import { nightCoveredByHotel } from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkPeople(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip, flights, hotels, tripNights, daysUntilStart } = ctx;

  const participants = [
    { userId: trip.userId, email: trip.userEmail, name: trip.userName, role: "owner" },
    ...(trip.sharedWith || []),
  ].filter((p) => p?.userId || p?.email);

  if (participants.length <= 1 && (trip.pendingInvites || []).length === 0) {
    return findings;
  }

  const partySize = participants.length;

  for (const hotel of hotels) {
    const capacity = hotel.capacity || hotel.guests || hotel.roomCount;
    if (typeof capacity === "number" && capacity > 0 && partySize > capacity) {
      findings.push(
        buildFinding({
          code: "party_over_capacity",
          axisIds: ["people", "stay"],
          kind: "broken",
          severity: 2,
          title: "More travelers than beds booked",
          detail: `${partySize} travelers but ${hotel.name || "hotel"} capacity is ${capacity}.`,
          titleKey: "integrity.people.overCapacity.title",
          detailKey: "integrity.people.overCapacity.detail",
          detailParams: {
            partySize,
            capacity,
            hotelName: hotel.name || "hotel",
          },
          entities: [{ entity: "hotel", itemId: hotel.id }],
          evidence: [
            { what: "partySize", value: partySize, source: "trip" },
            { what: "capacity", value: capacity, source: "hotel" },
          ],
          resolution: {
            kind: "propose_change",
            hint: "Book additional rooms or reduce party size.",
          },
        }),
      );
    }
  }

  if (participants.length > 1 && flights.length > 0) {
    const flightCapacity = flights.reduce(
      (sum, f) => sum + (typeof f.passengerCount === "number" ? f.passengerCount : 0),
      0,
    );
    if (flightCapacity > 0 && partySize > flightCapacity) {
      findings.push(
        buildFinding({
          code: "party_over_capacity",
          axisIds: ["people", "travel"],
          kind: "at_risk",
          severity: 2,
          title: "Flight bookings may not cover everyone",
          detail: `${partySize} travelers but only ${flightCapacity} seats booked.`,
          titleKey: "integrity.people.flightCapacity.title",
          detailKey: "integrity.people.flightCapacity.detail",
          detailParams: { partySize, flightCapacity },
          evidence: [
            { what: "partySize", value: partySize, source: "trip" },
            { what: "flightCapacity", value: flightCapacity, source: "flight" },
          ],
          resolution: {
            kind: "verify_fact",
            hint: "Confirm all travelers have flight tickets.",
          },
        }),
      );
    }
  }

  const pending = trip.pendingInvites || [];
  if (
    pending.length > 0 &&
    daysUntilStart != null &&
    daysUntilStart <= 14 &&
    daysUntilStart >= 0
  ) {
    findings.push(
      buildFinding({
        code: "pending_invites_close",
        axisIds: ["people"],
        kind: "at_risk",
        severity: 2,
        deadline: trip.startDate || null,
        title: "Invites still pending near departure",
        detail: `${pending.length} invite${pending.length === 1 ? "" : "s"} unaccepted with ${daysUntilStart} days to go.`,
        titleKey: "integrity.people.pendingInvites.title",
        detailKey: "integrity.people.pendingInvites.detail",
        detailParams: { count: pending.length, daysUntilStart },
        evidence: pending.map((p) => ({
          what: "pendingInvite",
          value: p.email,
          source: "trip",
        })),
        resolution: {
          kind: "user_action_required",
          hint: "Follow up on pending invites before booking for final headcount.",
        },
      }),
    );
  }

  if (participants.length > 1 && flights.length === 0) {
    findings.push(
      buildFinding({
        code: "participant_no_flight",
        axisIds: ["people", "travel"],
        kind: "unknown",
        severity: 1,
        title: "Group travel — flights not confirmed for all",
        detail: `${participants.length} travelers but no flights on the trip yet.`,
        titleKey: "integrity.people.noFlights.title",
        detailKey: "integrity.people.noFlights.detail",
        detailParams: { count: participants.length },
        evidence: [{ what: "travelerCount", value: participants.length, source: "trip" }],
        resolution: {
          kind: "verify_fact",
          hint: "Confirm whether all travelers share the same flights.",
        },
      }),
    );
  }

  if (participants.length > 1 && tripNights.length > 0 && hotels.length > 0) {
    const allNightsCovered = tripNights.every((n) => nightCoveredByHotel(n, hotels));
    if (!allNightsCovered) {
      findings.push(
        buildFinding({
          code: "participant_no_bed",
          axisIds: ["people", "stay"],
          kind: "at_risk",
          severity: 2,
          title: "Group may not all have beds every night",
          detail: "Hotel coverage does not span every night for the full party.",
          titleKey: "integrity.people.noBed.title",
          detailKey: "integrity.people.noBed.detail",
          evidence: [{ what: "travelerCount", value: participants.length, source: "trip" }],
          resolution: {
            kind: "propose_change",
            hint: "Ensure lodging fits the whole group for every night.",
          },
        }),
      );
    }
  }

  return findings;
}
