import {
  dateOnly,
  daysBetweenDateStrings,
  deriveTripPhase,
  enumerateTripDays,
} from "../../trip/readiness.js";
import {
  destinationCountry,
  flightDate,
  nightCoveredByHotel,
  primaryDestination,
  tripNightDates,
} from "./utils.js";

/**
 * @typedef {Object} IntegrityContext
 * @property {object} trip
 * @property {string} tripId
 * @property {object[]} axes
 * @property {Date} now
 * @property {string} today
 * @property {number|null} daysUntilStart
 * @property {'planning'|'imminent'|'active'|'past'} phase
 * @property {object|null} profile
 * @property {string|null} start
 * @property {string|null} end
 * @property {string|null} destination
 * @property {string|null} destinationCountry
 * @property {string[]} tripDays
 * @property {string[]} tripNights
 * @property {string[]} uncoveredNights
 * @property {Record<string, object[]>} itemsByDay
 * @property {object[]} flights
 * @property {object[]} hotels
 * @property {object[]} rides
 * @property {object[]} attractions
 * @property {object|null} outboundFlight
 * @property {object|null} returnFlight
 * @property {boolean} isInternational
 */

/** @param {object|null|undefined} trip */
function normalizeTrip(trip) {
  const t = trip && typeof trip === "object" ? { ...trip } : {};
  t.flights = Array.isArray(t.flights) ? t.flights : [];
  t.hotels = Array.isArray(t.hotels) ? t.hotels : [];
  t.rides = Array.isArray(t.rides) ? t.rides : [];
  t.attractions = Array.isArray(t.attractions) ? t.attractions : [];
  t.sharedWith = Array.isArray(t.sharedWith) ? t.sharedWith : [];
  t.pendingInvites = Array.isArray(t.pendingInvites) ? t.pendingInvites : [];
  t.expenses = Array.isArray(t.expenses) ? t.expenses : [];
  t.destinations = Array.isArray(t.destinations) ? t.destinations : [];
  t.checklist = Array.isArray(t.checklist) ? t.checklist : [];
  return t;
}

/** @param {object} trip @param {string|null} start */
function findOutboundFlight(trip, start) {
  const flights = trip.flights || [];
  if (!start) return flights[0] || null;
  return (
    flights.find((f) => {
      const d = flightDate(f);
      if (!d) return false;
      const offset = daysBetweenDateStrings(d, start);
      return offset != null && offset >= -2 && offset <= 1;
    }) ||
    flights[0] ||
    null
  );
}

/** @param {object} trip @param {string|null} end */
function findReturnFlight(trip, end) {
  const flights = trip.flights || [];
  if (!end) return flights.length >= 2 ? flights[flights.length - 1] : null;
  return (
    flights.find((f) => {
      const d = flightDate(f);
      if (!d) return false;
      const offset = daysBetweenDateStrings(d, end);
      return offset != null && offset >= -1 && offset <= 2;
    }) ||
    (flights.length >= 2 ? flights[flights.length - 1] : null)
  );
}

/**
 * @param {object} trip
 * @param {Object} [opts]
 * @param {object[]} [opts.axes]
 * @param {Date} [opts.now]
 * @param {object|null} [opts.profile]
 * @returns {IntegrityContext}
 */
export function buildIntegrityContext(trip, { axes = [], now = new Date(), profile = null } = {}) {
  const safeTrip = normalizeTrip(trip);
  const tripId = typeof safeTrip.id === "string" ? safeTrip.id : "unknown";
  const today = dateOnly(now.toISOString()) || now.toISOString().slice(0, 10);
  const start = dateOnly(safeTrip.startDate);
  const end = dateOnly(safeTrip.endDate);
  const daysUntilStart = start ? daysBetweenDateStrings(start, today) : null;
  const phase = deriveTripPhase(start, end, today);
  const destination = primaryDestination(safeTrip) || null;
  const destCountry = destinationCountry(safeTrip);
  const tripDays = start && end ? enumerateTripDays(start, end) : [];
  const tripNights = start && end ? tripNightDates(start, end) : [];
  const hotels = [...(safeTrip.hotels || [])].filter((h) => !h?.isIdea);
  const uncoveredNights = tripNights.filter((n) => !nightCoveredByHotel(n, hotels));

  /** @type {Record<string, object[]>} */
  const itemsByDay = {};
  for (const item of safeTrip.attractions || []) {
    const day = dateOnly(item.scheduledDate);
    if (!day) continue;
    if (!itemsByDay[day]) itemsByDay[day] = [];
    itemsByDay[day].push(item);
  }
  for (const day of Object.keys(itemsByDay)) {
    itemsByDay[day].sort((a, b) =>
      String(a.scheduledTime || "").localeCompare(String(b.scheduledTime || "")),
    );
  }

  const homeCountry =
    profile && typeof profile.homeCountry === "string"
      ? profile.homeCountry.trim().toUpperCase()
      : null;
  const isInternational = Boolean(
    destCountry && homeCountry && destCountry !== homeCountry,
  );

  return {
    trip: safeTrip,
    tripId,
    axes: Array.isArray(axes) ? axes : [],
    now,
    today,
    daysUntilStart,
    phase,
    profile: profile && typeof profile === "object" ? profile : null,
    start,
    end,
    destination,
    destinationCountry: destCountry,
    tripDays,
    tripNights,
    uncoveredNights,
    itemsByDay,
    flights: safeTrip.flights,
    hotels,
    rides: safeTrip.rides,
    attractions: safeTrip.attractions,
    outboundFlight: findOutboundFlight(safeTrip, start),
    returnFlight: findReturnFlight(safeTrip, end),
    isInternational,
  };
}
