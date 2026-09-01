import { buildFinding } from "../types.js";
import { dateOnly, subtractDays } from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

const DEFAULT_BOOKING_LEAD_DAYS = 14;

/** @param {object} item @returns {number|null} */
function bookingLeadDays(item) {
  if (typeof item.bookingLeadDays === "number" && item.bookingLeadDays >= 0) {
    return item.bookingLeadDays;
  }
  if (item.bookingRequired === true) return DEFAULT_BOOKING_LEAD_DAYS;
  return null;
}

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkBookingWindows(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip, start, today } = ctx;
  if (!start) return findings;

  for (const item of trip.attractions || []) {
    const lead = bookingLeadDays(item);
    if (lead == null) continue;
    if (item.status === "booked" || item.bookingUrl || item.confirmationRef) continue;

    const scheduled = dateOnly(item.scheduledDate) || start;
    const deadline = subtractDays(scheduled, lead);
    const pastDeadline = deadline < today;

    findings.push(
      buildFinding({
        code: "booking_window_closing",
        axisIds: ["dayPlan", "travel"],
        kind: pastDeadline ? "broken" : "at_risk",
        severity: pastDeadline ? 3 : 2,
        blocking: pastDeadline,
        deadline,
        title: pastDeadline
          ? "Booking window may have closed"
          : "Booking window closing soon",
        detail: `${item.name || "Item"} needs booking ~${lead} days ahead — deadline ${deadline}.`,
        titleKey: pastDeadline
          ? "integrity.booking.closed.title"
          : "integrity.booking.closing.title",
        detailKey: "integrity.booking.closing.detail",
        detailParams: {
          itemName: item.name || "Item",
          leadDays: lead,
          deadline,
        },
        entities: [{ entity: "attraction", itemId: item.id }],
        evidence: [
          { what: "bookingLeadDays", value: lead, source: "attraction" },
          { what: "deadline", value: deadline, source: "computed" },
          { what: "scheduledDate", value: scheduled, source: "attraction" },
        ],
        resolution: {
          kind: pastDeadline ? "user_action_required" : "propose_change",
          hint: pastDeadline
            ? "Find an alternative — standard booking lead time has passed."
            : "Book before the window closes.",
        },
      }),
    );
  }

  for (const item of trip.attractions || []) {
    const timedEntry =
      item.timedEntry === true ||
      item.requiresTimedEntry === true ||
      (item.type && /timed|entry|ticket/i.test(String(item.type)));
    if (!timedEntry) continue;
    if (item.status === "booked" || item.confirmationRef) continue;
    if (!item.scheduledDate) continue;

    findings.push(
      buildFinding({
        code: "timed_entry_unbooked",
        axisIds: ["dayPlan"],
        kind: "at_risk",
        severity: 2,
        deadline: subtractDays(item.scheduledDate, 7),
        title: "Timed entry still not booked",
        detail: `${item.name || "Venue"} on ${item.scheduledDate} needs a timed ticket.`,
        titleKey: "integrity.booking.timedEntry.title",
        detailKey: "integrity.booking.timedEntry.detail",
        detailParams: {
          itemName: item.name || "Venue",
          date: item.scheduledDate,
        },
        entities: [{ entity: "attraction", itemId: item.id }],
        evidence: [
          { what: "scheduledDate", value: item.scheduledDate, source: "attraction" },
          { what: "timedEntry", value: true, source: "attraction" },
        ],
        resolution: {
          kind: "propose_change",
          hint: "Book timed entry before slots sell out.",
        },
      }),
    );
  }

  return findings;
}
