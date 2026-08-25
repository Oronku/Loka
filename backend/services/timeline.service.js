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

function durationForAttraction(attraction) {
  const raw = attraction?.durationMinutes;
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  return durationForType(attraction?.attractionType || attraction?.type);
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
  const dur = durationForAttraction(attraction);
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
 * @typedef {{ code: 'OUTSIDE_OPENING_HOURS'|'TIGHT_TRANSFER', message: string }} AttractionWarning
 */

function sunday0FromDate(dateStr) {
  const m = typeof dateStr === "string" ? dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return Number.isNaN(day) ? null : day;
}

function googleTimeToMinutes(time) {
  if (typeof time === "number" && Number.isFinite(time)) {
    const padded = String(Math.trunc(time)).padStart(4, "0");
    return googleTimeToMinutes(padded);
  }
  if (typeof time !== "string") return null;
  const digits = time.trim();
  if (!/^\d{3,4}$/.test(digits)) return null;
  const padded = digits.padStart(4, "0");
  const h = Number(padded.slice(0, 2));
  const min = Number(padded.slice(2, 4));
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function dayBetween(openDay, closeDay, target) {
  let d = (openDay + 1) % 7;
  while (d !== closeDay) {
    if (d === target) return true;
    d = (d + 1) % 7;
    if (d === (openDay + 1) % 7) break;
  }
  return false;
}

/** @returns {Array<{ startMin: number, endMin: number, allDay?: boolean }>} */
function windowsFromPeriod(period, targetSunday0) {
  const open = period?.open;
  if (!open || typeof open !== "object") return [];
  const openDay = Number(open.day);
  if (!Number.isInteger(openDay) || openDay < 0 || openDay > 6) return [];

  const openMin =
    googleTimeToMinutes(open.time) ??
    (Number.isFinite(Number(open.hours))
      ? Number(open.hours) * 60 + (Number(open.minutes) || 0)
      : null);
  if (openMin == null && period.close) return [];

  const close = period.close;
  if (!close) {
    return [{ startMin: 0, endMin: MINUTES_PER_DAY, allDay: true }];
  }

  const closeDay = Number(close.day);
  const closeMin =
    googleTimeToMinutes(close.time) ??
    (Number.isFinite(Number(close.hours))
      ? Number(close.hours) * 60 + (Number(close.minutes) || 0)
      : null);
  if (!Number.isInteger(closeDay) || closeDay < 0 || closeDay > 6 || closeMin == null) return [];

  if (openDay === closeDay) {
    if (openDay !== targetSunday0) return [];
    if (closeMin > openMin) return [{ startMin: openMin, endMin: closeMin }];
    return [
      { startMin: openMin, endMin: MINUTES_PER_DAY },
      { startMin: 0, endMin: closeMin },
    ];
  }

  if (openDay === targetSunday0) return [{ startMin: openMin ?? 0, endMin: MINUTES_PER_DAY }];
  if (closeDay === targetSunday0) return [{ startMin: 0, endMin: closeMin }];
  if (dayBetween(openDay, closeDay, targetSunday0)) {
    return [{ startMin: 0, endMin: MINUTES_PER_DAY, allDay: true }];
  }
  return [];
}

function parseClockToken(hour, minute, ampm) {
  let h = Number(hour);
  const min = minute != null && minute !== "" ? Number(minute) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  const ap = (ampm || "").toLowerCase().replace(/\./g, "");
  if (ap.startsWith("p") && h < 12) h += 12;
  if (ap.startsWith("a") && h === 12) h = 0;
  return h * 60 + min;
}

/** @returns {{ closed?: boolean, allDay?: boolean, periods?: Array<{ startMin: number, endMin: number }> } | null} */
function parseWeekdayTextLine(line) {
  if (typeof line !== "string" || !line.trim()) return null;
  const lower = line.toLowerCase();
  if (/\bclosed\b|סגור/.test(lower)) return { closed: true };
  if (/24\s*hours?|open\s*24|24\s*שע/.test(lower)) return { allDay: true };

  const times = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?/gi;
  let m;
  while ((m = re.exec(line))) {
    const min = parseClockToken(m[1], m[2], m[3]);
    if (min != null) times.push(min);
  }
  if (times.length < 2) return null;
  const periods = [];
  for (let i = 0; i + 1 < times.length; i += 2) {
    periods.push({ startMin: times[i], endMin: times[i + 1] });
  }
  return periods.length ? { periods } : null;
}

function readOpeningHours(attraction) {
  const raw = attraction?.openingHours ?? attraction?.opening_hours;
  if (!raw || typeof raw !== "object") return null;
  const weekdayText = Array.isArray(raw.weekdayText)
    ? raw.weekdayText
    : Array.isArray(raw.weekday_text)
      ? raw.weekday_text
      : null;
  const periods = Array.isArray(raw.periods) ? raw.periods : null;
  return { weekdayText, periods };
}

function visitFitsWindows(startMin, endMin, windows) {
  if (!windows.length) return false;
  if (windows.some((w) => w.allDay || (w.startMin <= 0 && w.endMin >= MINUTES_PER_DAY))) {
    return true;
  }
  const spanEnd = endMin < startMin ? endMin + MINUTES_PER_DAY : endMin;
  return windows.some((w) => {
    const wEnd = w.endMin <= w.startMin ? w.endMin + MINUTES_PER_DAY : w.endMin;
    return startMin >= w.startMin && startMin < wEnd && spanEnd <= wEnd;
  });
}

function hoursMessage(attraction, weekdayLine) {
  const time = attraction.scheduledTime || "this time";
  if (typeof weekdayLine === "string" && weekdayLine.trim()) {
    return `${time} is outside opening hours (${weekdayLine.trim()}).`;
  }
  return `${time} is outside the place's opening hours.`;
}

/**
 * Non-blocking warnings for a scheduled attraction. Never throws.
 * TIGHT_TRANSFER is reserved for the shared contract; this function emits
 * OUTSIDE_OPENING_HOURS only.
 *
 * @param {object} [_trip]
 * @param {object} candidate
 * @returns {AttractionWarning[]}
 */
export function detectAttractionWarnings(_trip, candidate) {
  try {
    if (!candidate) return [];
    const date = datePart(candidate.scheduledDate);
    const startMin = toMinutes(candidate.scheduledTime);
    if (!date || startMin == null) return [];

    const hours = readOpeningHours(candidate);
    if (!hours) return [];

    const sunday0 = sunday0FromDate(date);
    if (sunday0 == null) return [];

    const win = attractionWindow(candidate);
    const endMin = win ? win.endMin : startMin;
    let windows = [];
    let weekdayLine = null;

    let periodsAuthoritative = false;
    if (hours.periods && hours.periods.length > 0) {
      for (const period of hours.periods) {
        const openDay = Number(period?.open?.day);
        if (!Number.isInteger(openDay) || openDay < 0 || openDay > 6) continue;
        periodsAuthoritative = true;
        windows.push(...windowsFromPeriod(period, sunday0));
      }
    }

    const monday0 = (sunday0 + 6) % 7;
    if (hours.weekdayText && hours.weekdayText.length > monday0) {
      weekdayLine = hours.weekdayText[monday0];
    }

    if (!periodsAuthoritative && hours.weekdayText) {
      const parsed = parseWeekdayTextLine(weekdayLine);
      if (!parsed) return [];
      if (parsed.closed) {
        return [{ code: "OUTSIDE_OPENING_HOURS", message: hoursMessage(candidate, weekdayLine) }];
      }
      if (parsed.allDay) return [];
      windows = (parsed.periods || []).map((p) => ({
        startMin: p.startMin,
        endMin: p.endMin <= p.startMin ? p.endMin + MINUTES_PER_DAY : p.endMin,
      }));
    }

    if (periodsAuthoritative && windows.length === 0) {
      return [{ code: "OUTSIDE_OPENING_HOURS", message: hoursMessage(candidate, weekdayLine) }];
    }

    if (windows.length === 0) return [];
    if (visitFitsWindows(startMin, endMin, windows)) return [];
    return [{ code: "OUTSIDE_OPENING_HOURS", message: hoursMessage(candidate, weekdayLine) }];
  } catch {
    return [];
  }
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

/** Ideas / notes stay on the trip document but never become itinerary events. */
function isIdeaAttraction(attraction) {
  if (!attraction || typeof attraction !== "object") return false;
  if (attraction.type === "note" || attraction.attractionType === "note") return true;
  if (attraction.status === "idea") return true;
  if (!attraction.status && !attraction.scheduledDate) return true;
  return false;
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
    if (hotel.isIdea || !datePart(hotel.checkIn) || !datePart(hotel.checkOut)) {
      return;
    }
    const start = `${datePart(hotel.checkIn)}T15:00:00`;
    events.push({
      id: hotel.id || `hotel-${sourceIndex}`,
      type: "hotel",
      sourceIndex,
      title: hotel.name,
      location: hotel.address,
      start,
      end: `${datePart(hotel.checkOut)}T11:00:00`,
      sortKey: sortKeyFor(start),
    });
  });

  (trip.attractions || []).forEach((attraction, sourceIndex) => {
    if (isIdeaAttraction(attraction)) return;
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
