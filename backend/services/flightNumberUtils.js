/** Normalize "LY0315" / "LY 315" / "LY-315" → "LY315" for comparison. */
export function normalizeFlightNumber(input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  // IATA codes are 2 chars (e.g. LY, W6, 6H); some sources use 3-letter ICAO prefixes.
  const match =
    /^([A-Z0-9]{2})(\d+)$/.exec(raw) ||
    /^([A-Z]{3})(\d+)$/.exec(raw);
  if (!match) return raw;
  return `${match[1]}${parseInt(match[2], 10)}`;
}

/** Match a saved flight number against airline IATA + numeric flight number. */
export function matchesAirlineFlightNumber(savedFlightNumber, airlineIata, flightNum) {
  const target = normalizeFlightNumber(savedFlightNumber);
  if (!target) return false;
  const candidate = normalizeFlightNumber(`${airlineIata || ""}${flightNum || ""}`);
  return candidate === target;
}

/** Match against a full flight number string (e.g. segment "W6 2502"). */
export function matchesFlightNumber(savedFlightNumber, candidate) {
  const target = normalizeFlightNumber(savedFlightNumber);
  if (!target) return false;
  return normalizeFlightNumber(candidate) === target;
}

/** True when normalized flight number includes a 2–3 char airline prefix + digits. */
export function hasAirlineFlightNumberPrefix(flightNumber) {
  const raw = String(flightNumber || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  const match =
    /^([A-Z0-9]{2})(\d+)$/.exec(raw) ||
    /^([A-Z]{3})(\d+)$/.exec(raw);
  if (!match) return false;
  return /[A-Z]/.test(match[1]);
}

/**
 * Build a display/comparison flight number from carrier IATA + numeric part.
 * Returns empty string when a full prefixed number cannot be formed.
 */
export function formatFlightNumber(airlineIata, flightNum) {
  const num = String(flightNum || "").trim();
  if (!num) return "";

  const iata = String(airlineIata || "")
    .trim()
    .toUpperCase();

  if (iata && /^\d+$/.test(num)) {
    return `${iata}${parseInt(num, 10)}`;
  }

  const asFull = normalizeFlightNumber(num);
  if (hasAirlineFlightNumberPrefix(asFull)) return asFull;

  return "";
}
