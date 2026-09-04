import {
  DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS,
} from "./shared/constants.js";
import {
  airportQuery,
  extractLocation,
  resolveAirportLabel,
} from "./shared/location.js";
import { asNaiveDateTime, combineDateAndTime, toTime } from "./shared/wallClock.js";
import { applyHotelOrdering, buildHotelEvents } from "../hotels.js";

export { asNaiveDateTime, toTime, combineDateAndTime } from "./shared/wallClock.js";
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

/**
 * Resolve a ride's pickup and dropoff wall-clock times.
 *
 * Rides are written by different paths with incompatible shapes:
 * - The manual add-ride screen stores combined `pickupDateTime` /
 *   `dropoffDateTime`.
 * - AI/chat (and trip-monitor proposals) store split `date` + `time` and never
 *   set `pickupDateTime`. Chat sometimes puts a full ISO datetime in `time`
 *   instead of HH:MM.
 * Without collapsing those shapes here, `sortKey` is NaN and the ride lands in
 * the unscheduled bucket — invisible on the timeline.
 *
 * @param {object} ride
 * @returns {{ pickup: string|null, dropoff: string|null }}
 */
function resolveRideTimes(ride) {
  if (!ride || typeof ride !== "object") {
    return { pickup: null, dropoff: null };
  }

  let pickup = ride.pickupDateTime || null;
  if (!pickup) {
    const timeStr = ride.time != null ? String(ride.time).trim() : "";
    // Chat AI sometimes stores a full ISO in `time`; combineDateAndTime would
    // only keep the date half when that happens, so prefer the richer value.
    if (/T\d{1,2}:\d{2}/.test(timeStr)) {
      pickup = timeStr;
    } else if (ride.date || ride.time) {
      pickup = combineDateAndTime(ride.date, ride.time) || null;
    }
  }

  const dropoff = ride.dropoffDateTime || pickup || null;
  return { pickup, dropoff };
}

/**
 * Collapse flight timestamps the same way rides do. Loka/chat writes split
 * `date` + `time` and never sets `departureDateTime`; without merging those,
 * `sortKey` is NaN and the flight lands in unscheduled.
 * Date-only datetimes are rewritten as local midnight so they do not parse as
 * UTC and sort against naive hotel `T15:00` values.
 */
function resolveFlightTimes(flight) {
  if (!flight || typeof flight !== "object") {
    return { departure: null, arrival: null };
  }

  let departure = flight.departureDateTime || null;
  if (!departure) {
    const timeStr = flight.time != null ? String(flight.time).trim() : "";
    if (/T\d{1,2}:\d{2}/.test(timeStr)) {
      departure = timeStr;
    } else if (flight.date || flight.time) {
      departure = combineDateAndTime(flight.date, flight.time) || null;
    }
  }

  return {
    departure: asNaiveDateTime(departure),
    arrival: asNaiveDateTime(flight.arrivalDateTime || null),
  };
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
      flight.from,
      flight.departure
    );
    const arrivalAirport = resolveAirportLabel(
      flight.arrivalAirportCode,
      flight.arrivalAirport,
      flight.to,
      flight.arrival
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

    const { departure, arrival } = resolveFlightTimes(flight);

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
      start: departure,
      end: arrival,
      arrival,
      departureAirport: departLabel,
      arrivalAirport: arriveLabel,
      // You travel TO the departure airport, and continue FROM the arrival airport.
      arriveLocation: departQuery || extractLocation(flight),
      departLocation: arriveQuery || extractLocation(flight),
      location: arriveQuery || departQuery || extractLocation(flight),
      sortKey: toTime(departure),
      raw: flight,
    });
  });

  (trip.hotels || []).forEach((hotel, sourceIndex) => {
    for (const event of buildHotelEvents(hotel, sourceIndex)) {
      pushEvent(result, event);
    }
  });

  (trip.rides || []).forEach((ride, sourceIndex) => {
    const { pickup, dropoff } = resolveRideTimes(ride);
    pushEvent(result, {
      id: ride.id || `ride-${sourceIndex}`,
      type: "ride",
      sourceIndex,
      title:
        ride.pickup && ride.dropoff
          ? `${ride.pickup} \u2192 ${ride.dropoff}`
          : "Ride",
      subtitle: ride.provider || null,
      start: pickup,
      end: dropoff,
      arrival: dropoff,
      // For routing, the ride ends at its dropoff location.
      location: ride.dropoff || extractLocation(ride),
      sortKey: toTime(pickup),
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
