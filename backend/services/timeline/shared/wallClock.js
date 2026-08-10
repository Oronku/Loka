/**
 * Naive local wall-clock helpers for timeline timestamps.
 * Values look like "2026-06-07T15:00" with no timezone. Mixing those with
 * date-only strings ("2026-06-07") is unsafe: `new Date("2026-06-07")` parses
 * as UTC midnight while `"2026-06-07T15:00"` parses as local.
 */

export function toTime(value) {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/**
 * Combine a date with a separate time-of-day into one datetime string.
 * Many items store a date ("2026-06-07") and a time ("15:00") separately;
 * timelining needs them merged so the event has a real sort key.
 */
export function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue) return timeValue || null;
  const dateStr = String(dateValue).trim();

  // Already a full datetime — use as-is.
  if (/T\d{1,2}:\d{2}/.test(dateStr) || /\d{1,2}:\d{2}/.test(dateStr.slice(10))) {
    return dateStr;
  }

  if (timeValue && /^\d{1,2}:\d{2}/.test(String(timeValue).trim())) {
    const datePart = dateStr.slice(0, 10);
    const [h, m] = String(timeValue).trim().split(":");
    const hh = h.padStart(2, "0");
    const mm = (m || "00").slice(0, 2).padStart(2, "0");
    return `${datePart}T${hh}:${mm}`;
  }

  return dateStr;
}

/** Local calendar day ("YYYY-MM-DD") for a timestamp, or null. */
export function dayKey(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a Date as a naive local "YYYY-MM-DDTHH:MM" string. */
export function formatNaive(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/** Parse a naive timestamp, add seconds, return via formatNaive. */
export function addSeconds(value, seconds) {
  const t = toTime(value);
  if (Number.isNaN(t)) return null;
  return formatNaive(new Date(t + Number(seconds) * 1000));
}

/**
 * Return the naive wall-clock portion of a timestamp (zone stripped).
 * The timeline UI renders the literal digits after `T` and ignores zones, so
 * hotel/flight ordering must compare those same digits — not absolute instants.
 * Handles naive, `Z`, `±HH:MM` / `±HHMM`, and space-separated forms.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function stripZone(value) {
  if (!value) return null;
  // Normalize "YYYY-MM-DD HH:MM…" → "YYYY-MM-DDTHH:MM…" before stripping.
  let s = String(value).trim().replace(/^(\d{4}-\d{2}-\d{2})[ ]+/, "$1T");
  // Only strip an offset after the time portion — never the date's own hyphens.
  s = s.replace(/[Zz]$/, "").replace(/[+-]\d{2}:?\d{2}$/, "");
  return s;
}

/**
 * Milliseconds for wall-clock comparison. Strips the zone first so every value
 * is parsed under the same local rules; differences between two wall clocks are
 * then meaningful regardless of how each was originally stored.
 * @param {string|null|undefined} value
 * @returns {number}
 */
export function wallClockMs(value) {
  return toTime(stripZone(value));
}

/**
 * Add seconds to a timestamp's wall clock (zone ignored) and return
 * `"YYYY-MM-DDTHH:MM"`. Accepts negative seconds. Used when the UI treats
 * every time as literal digits, so the result must stay on that same clock.
 * @param {string|null|undefined} value
 * @param {number} seconds
 * @returns {string|null}
 */
export function addSecondsWallClock(value, seconds) {
  const t = wallClockMs(value);
  if (Number.isNaN(t)) return null;
  return formatNaive(new Date(t + Number(seconds) * 1000));
}
