/**
 * Timeline snapshot + scheduling-conflict helpers.
 *
 * The trip stores a lightweight `timelineSnapshot.events[]` built from the
 * trip's flights, hotels and (dated) attractions. The same primitives power
 * conflict detection so a newly scheduled attraction can't land on top of a
 * flight or another attraction.
 *
 * Times are compared as a naive local clock per calendar day (no timezone
 * math): flights/attractions carry their own local clock in the stored data.
 */

const DEFAULT_ATTRACTION_DURATION_MIN = 120;
const RESTAURANT_DURATION_MIN = 90;
const MINUTES_PER_DAY = 1440;

/** Parse "HH:MM" → minutes since midnight, or null. */
function toMinutes(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

/** "YYYY-MM-DD" date portion from an ISO datetime or date string. */
function datePart(value) {
  if (typeof value !== "string" || value.length < 10) return null;
  return value.slice(0, 10);
}

/** "HH:MM" clock portion from an ISO datetime string (the stored local clock). */
function clockPart(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function durationForType(type) {
  return type === "restaurant" ? RESTAURANT_DURATION_MIN : DEFAULT_ATTRACTION_DURATION_MIN;
}

/**
 * Scheduling window for a dated attraction.
 * @returns {{ date: string, startMin: number, endMin: number } | null}
 */
function attractionWindow(attraction) {
  if (!attraction) return null;
  const date = datePart(attraction.scheduledDate);
  const startMin = toMinutes(attraction.scheduledTime);
  if (!date || startMin == null) return null;
  const dur = durationForType(attraction.attractionType || attraction.type);
  return { date, startMin, endMin: Math.min(startMin + dur, MINUTES_PER_DAY) };
}

/**
 * The minutes-of-day window a flight blocks on a given calendar date, or null
 * if the flight doesn't touch that date. Handles overnight / multi-day flights.
 */
function flightWindowOnDate(flight, date) {
  const depDate = datePart(flight.departureDateTime);
  const arrDate = datePart(flight.arrivalDateTime) || depDate;
  if (!depDate) return null;

  const depMin = toMinutes(flight.departureTimeLocal) ?? toMinutes(clockPart(flight.departureDateTime));
  const arrMin = toMinutes(flight.arrivalTimeLocal) ?? toMinutes(clockPart(flight.arrivalDateTime));

  if (date < depDate || date > arrDate) return null;

  const startMin = date === depDate ? depMin ?? 0 : 0;
  const endMin = date === arrDate ? arrMin ?? MINUTES_PER_DAY : MINUTES_PER_DAY;
  return { startMin, endMin };
}

/** Two [start, end) minute windows overlap. */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function flightLabel(flight) {
  return [flight.airline, flight.flightNumber].filter(Boolean).join(" ").trim() || "Flight";
}

/**
 * Detect scheduling conflicts for a candidate attraction against the trip's
 * flights and other dated attractions.
 *
 * @param {object} trip
 * @param {object} candidate - attraction with scheduledDate + scheduledTime
 * @param {{ excludeId?: string, excludeIndex?: number }} [opts]
 * @returns {Array<{ kind: 'flight'|'attraction', title: string, date: string, time: string|null }>}
 */
export function detectAttractionConflicts(trip, candidate, opts = {}) {
  const win = attractionWindow(candidate);
  if (!win) return []; // undated → nothing to conflict with

  const conflicts = [];

  for (const flight of trip.flights || []) {
    const fw = flightWindowOnDate(flight, win.date);
    if (fw && overlaps(win.startMin, win.endMin, fw.startMin, fw.endMin)) {
      conflicts.push({
        kind: "flight",
        title: flightLabel(flight),
        date: win.date,
        time:
          flight.departureTimeLocal ||
          clockPart(flight.departureDateTime) ||
          null,
      });
    }
  }

  (trip.attractions || []).forEach((other, index) => {
    if (opts.excludeIndex != null && index === opts.excludeIndex) return;
    if (opts.excludeId && other.id && other.id === opts.excludeId) return;
    if (other === candidate) return;
    const ow = attractionWindow(other);
    if (
      ow &&
      ow.date === win.date &&
      overlaps(win.startMin, win.endMin, ow.startMin, ow.endMin)
    ) {
      conflicts.push({
        kind: "attraction",
        title: other.name || "Attraction",
        date: ow.date,
        time: other.scheduledTime || null,
      });
    }
  });

  return conflicts;
}

/**
 * Index of an attraction in the trip that matches the candidate (same place or
 * same name), or -1. Used to upsert instead of creating duplicates.
 */
export function findAttractionIndex(trip, candidate) {
  const list = trip.attractions || [];
  const placeId = candidate.placeId;
  const name = (candidate.name || "").trim().toLowerCase();
  return list.findIndex((a) => {
    if (placeId && a.placeId) return a.placeId === placeId;
    return (a.name || "").trim().toLowerCase() === name && !!name;
  });
}

function isoFromDateAndClock(date, hhmm) {
  const min = toMinutes(hhmm);
  if (!date) return undefined;
  if (min == null) return `${date}T00:00:00`;
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${date}T${h}:${m}:00`;
}

function sortKeyFor(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * Build a lightweight timeline snapshot from the trip's flights, hotels and
 * dated attractions. Undated attractions are returned under `unscheduled`.
 */
export function buildTimelineSnapshot(trip) {
  const events = [];
  const unscheduled = [];

  (trip.flights || []).forEach((flight, sourceIndex) => {
    events.push({
      id: flight.id || `flight-${sourceIndex}`,
      type: "flight",
      sourceIndex,
      title: flightLabel(flight),
      subtitle: [flight.departureAirportCode, flight.arrivalAirportCode]
        .filter(Boolean)
        .join(" → "),
      start: flight.departureDateTime,
      end: flight.arrivalDateTime,
      arrival: flight.arrivalDateTime,
      departureAirport: flight.departureAirportCode,
      arrivalAirport: flight.arrivalAirportCode,
      sortKey: sortKeyFor(flight.departureDateTime),
    });
  });

  (trip.hotels || []).forEach((hotel, sourceIndex) => {
    const start = datePart(hotel.checkIn)
      ? `${datePart(hotel.checkIn)}T15:00:00`
      : undefined;
    events.push({
      id: hotel.id || `hotel-${sourceIndex}`,
      type: "hotel",
      sourceIndex,
      title: hotel.name,
      location: hotel.address,
      start,
      end: datePart(hotel.checkOut) ? `${datePart(hotel.checkOut)}T11:00:00` : undefined,
      sortKey: sortKeyFor(start),
    });
  });

  (trip.attractions || []).forEach((attraction, sourceIndex) => {
    const win = attractionWindow(attraction);
    if (!win) {
      unscheduled.push({
        id: attraction.id || `attraction-${sourceIndex}`,
        type: attraction.attractionType || "attraction",
        sourceIndex,
        title: attraction.name,
        location: attraction.address,
      });
      return;
    }
    const start = isoFromDateAndClock(win.date, attraction.scheduledTime);
    const endHH = String(Math.floor(win.endMin / 60)).padStart(2, "0");
    const endMM = String(win.endMin % 60).padStart(2, "0");
    events.push({
      id: attraction.id || `attraction-${sourceIndex}`,
      type: attraction.attractionType || "attraction",
      sourceIndex,
      title: attraction.name,
      location: attraction.address,
      start,
      end: `${win.date}T${endHH}:${endMM}:00`,
      sortKey: sortKeyFor(start),
    });
  });

  events.sort((a, b) => a.sortKey - b.sortKey);

  return {
    pending: false,
    version: 1,
    generatedAt: new Date().toISOString(),
    events,
    unscheduled,
    legs: [],
    transfers: [],
  };
}
