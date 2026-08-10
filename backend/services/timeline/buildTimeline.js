import {
  DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS,
} from "./shared/constants.js";
import {
  airportQuery,
  extractLocation,
  resolveAirportLabel,
} from "./shared/location.js";
import { combineDateAndTime, toTime } from "./shared/wallClock.js";
import { applyHotelOrdering, buildHotelEvents } from "../hotels.js";

export { toTime, combineDateAndTime } from "./shared/wallClock.js";
export {
  extractLocation,
  airportQuery,
  resolveAirportLabel,
} from "./shared/location.js";

const DEFAULT_ATTRACTION_DURATION_MIN = 120;
const RESTAURANT_DURATION_MIN = 90;

function durationMinutesForAttraction(attraction) {
  const raw = attraction?.durationMinutes;
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  const type = attraction?.attractionType || attraction?.type;
  return type === "restaurant" ? RESTAURANT_DURATION_MIN : DEFAULT_ATTRACTION_DURATION_MIN;
}

function clockTime(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return /^\d{1,2}:\d{2}/.test(trimmed) ? trimmed : null;
}

function hasWallClock(value) {
  return typeof value === "string" && /T\d{1,2}:\d{2}/.test(value);
}

/** Naive wall-clock add. Never emits a `Z` or offset. */
function addWallClockMinutes(dateTimeValue, minutes) {
  const s = String(dateTimeValue).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/.exec(s);
  if (!m || !Number.isFinite(minutes)) return s;
  const total = Number(m[4]) * 60 + Number(m[5]) + minutes;
  const dayShift = Math.floor(total / 1440);
  const mins = ((total % 1440) + 1440) % 1440;
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayShift));
  const yyyy = String(next.getUTCFullYear()).padStart(4, "0");
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mi = String(mins % 60).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function attractionBounds(attraction) {
  const explicitStart = attraction.scheduledDateTime || null;
  const explicitEnd = attraction.endDateTime || null;
  const date = attraction.scheduledDate || null;
  const time = clockTime(attraction.scheduledTime);

  let start = null;
  if (explicitStart) {
    start = explicitStart;
  } else if (date && time) {
    start = combineDateAndTime(date, time);
  } else if (date) {
    start = date;
  }

  if (explicitEnd) return { start, end: explicitEnd };
  if (start && hasWallClock(start)) {
    return { start, end: addWallClockMinutes(start, durationMinutesForAttraction(attraction)) };
  }
  return { start, end: start };
}

/** Ideas / notes stay on the trip document but never become itinerary events. */
function isIdeaAttraction(attraction) {
  if (!attraction || typeof attraction !== "object") return false;
  if (attraction.type === "note" || attraction.attractionType === "note") return true;
  if (attraction.status === "idea") return true;
  if (!attraction.status && !attraction.scheduledDate) return true;
  return false;
}

function pushEvent(target, event) {
  if (Number.isNaN(event.sortKey)) {
    target.unscheduled.push({ ...event, sortKey: null });
  } else {
    target.events.push(event);
  }
}

/** Collapse events that are effectively identical (e.g. a duplicated booking). */
function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((e) => {
    const sig = [e.type, e.title, e.start, e.end, e.location].join("|");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/**
 * Merge a trip's sub-resources into a single sorted event list.
 * @param {object} trip
 * @returns {{ events: object[], unscheduled: object[] }}
 */
export function buildTimeline(trip) {
  const result = { events: [], unscheduled: [] };
  if (!trip || typeof trip !== "object") return result;

  (trip.flights || []).forEach((flight, sourceIndex) => {
    // Flights store airports under several possible field names depending on
    // the source (flight search uses departureAirportCode/arrivalAirportCode).
    // Collapse "" / whitespace to null so labels never reach the client blank.
    const departureAirport = resolveAirportLabel(
      flight.departureAirportCode,
      flight.departureAirport,
      flight.from
    );
    const arrivalAirport = resolveAirportLabel(
      flight.arrivalAirportCode,
      flight.arrivalAirport,
      flight.to
    );

    const departLabel = resolveAirportLabel(
      departureAirport,
      flight.departureCity
    );
    const arriveLabel = resolveAirportLabel(arrivalAirport, flight.arrivalCity);

    // Fall back to the city name when no airport code is present.
    const departQuery =
      airportQuery(departureAirport) ||
      (departLabel ? `${departLabel} airport` : null);
    const arriveQuery =
      airportQuery(arrivalAirport) ||
      (arriveLabel ? `${arriveLabel} airport` : null);

    pushEvent(result, {
      id: flight.id || `flight-${sourceIndex}`,
      type: "flight",
      sourceIndex,
      title: flight.flightNumber ? `Flight ${flight.flightNumber}` : "Flight",
      subtitle:
        [
          flight.airline,
          departLabel && arriveLabel
            ? `${departLabel} \u2192 ${arriveLabel}`
            : null,
        ]
          .filter(Boolean)
          .join(" \u00b7 ") || null,
      start: flight.departureDateTime || null,
      end: flight.arrivalDateTime || null,
      arrival: flight.arrivalDateTime || null,
      departureAirport: departLabel,
      arrivalAirport: arriveLabel,
      // You travel TO the departure airport, and continue FROM the arrival airport.
      arriveLocation: departQuery || extractLocation(flight),
      departLocation: arriveQuery || extractLocation(flight),
      location: arriveQuery || departQuery || extractLocation(flight),
      sortKey: toTime(flight.departureDateTime),
      raw: flight,
    });
  });

  (trip.hotels || []).forEach((hotel, sourceIndex) => {
    for (const event of buildHotelEvents(hotel, sourceIndex)) {
      pushEvent(result, event);
    }
  });

  (trip.rides || []).forEach((ride, sourceIndex) => {
    pushEvent(result, {
      id: ride.id || `ride-${sourceIndex}`,
      type: "ride",
      sourceIndex,
      title:
        ride.pickup && ride.dropoff
          ? `${ride.pickup} \u2192 ${ride.dropoff}`
          : "Ride",
      subtitle: ride.provider || null,
      start: ride.pickupDateTime || null,
      end: ride.dropoffDateTime || ride.pickupDateTime || null,
      arrival: ride.dropoffDateTime || ride.pickupDateTime || null,
      // For routing, the ride ends at its dropoff location.
      location: ride.dropoff || extractLocation(ride),
      sortKey: toTime(ride.pickupDateTime),
      raw: ride,
    });
  });

  (trip.attractions || []).forEach((attraction, sourceIndex) => {
    if (isIdeaAttraction(attraction)) return;
    const { start, end } = attractionBounds(attraction);
    const sortSource =
      attraction.scheduledDateTime || attraction.scheduledDate || start;
    pushEvent(result, {
      id: attraction.id || `attraction-${sourceIndex}`,
      type: "attraction",
      sourceIndex,
      title: attraction.name || "Attraction",
      subtitle: attraction.category || null,
      start,
      end,
      arrival: start,
      location: extractLocation(attraction) || attraction.name || null,
      sortKey: toTime(sortSource),
      raw: attraction,
    });
  });

  const minutes = Number(trip.airportArrivalBufferMinutes);
  const airportArrivalBufferSeconds =
    Number.isFinite(minutes) && minutes >= 0
      ? minutes * 60
      : DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS;

  // Clamp hotels against flights before sort so adjusted times land correctly.
  applyHotelOrdering(result.events, { airportArrivalBufferSeconds });

  result.events = dedupeEvents(result.events);
  result.unscheduled = dedupeEvents(result.unscheduled);
  result.events.sort((a, b) => a.sortKey - b.sortKey);
  return result;
}
