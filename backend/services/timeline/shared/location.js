/** Best-effort location string usable by Google APIs: "lat,lng" or an address. */
export function extractLocation(raw) {
  if (!raw || typeof raw !== "object") return null;

  const coords =
    raw.coordinates || raw.location?.coordinates || raw.geometry?.location;
  if (coords && coords.lat != null && coords.lng != null) {
    return `${coords.lat},${coords.lng}`;
  }

  if (typeof raw.location === "string" && raw.location.trim()) {
    return raw.location.trim();
  }
  if (typeof raw.address === "string" && raw.address.trim()) {
    return raw.address.trim();
  }
  if (
    typeof raw.formatted_address === "string" &&
    raw.formatted_address.trim()
  ) {
    return raw.formatted_address.trim();
  }
  return null;
}

/**
 * Turn an airport value into a geocodable query. A bare IATA code like "CDG"
 * becomes "CDG airport"; anything else (a full name/address) is used as-is.
 */
export function airportQuery(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    return `${trimmed.toUpperCase()} airport`;
  }
  return trimmed;
}

/**
 * First non-blank airport/city label from a list of candidates, or null.
 *
 * Empty string and whitespace must collapse to null: downstream `??` checks
 * treat `""` as present, which interpolates as a blank airport in UI titles
 * like "Be at {{airport}}".
 *
 * @param {...unknown} candidates
 * @returns {string|null}
 */
export function resolveAirportLabel(...candidates) {
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
