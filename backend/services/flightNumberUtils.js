/** Normalize "LY0315" / "LY 315" / "LY-315" → "LY315" for comparison. */
export function normalizeFlightNumber(input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  const match = /^([A-Z0-9]{2,3})(\d+)$/.exec(raw);
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
