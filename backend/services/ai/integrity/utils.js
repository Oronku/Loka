import { dateOnly, daysBetweenDateStrings } from "../../trip/readiness.js";

export { dateOnly, daysBetweenDateStrings };

/** @param {string|null|undefined} dt @returns {number|null} minutes since midnight */
export function parseMinutesHHMM(dt) {
  if (!dt) return null;
  const s = String(dt).trim();
  const timeMatch = s.match(/T(\d{2}):(\d{2})/);
  if (timeMatch) return parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  return null;
}

/** @param {string|null|undefined} dt @returns {string|null} HH:MM */
export function timeFromDateTime(dt) {
  if (!dt) return null;
  const m = String(dt).match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

/** @param {object|null|undefined} flight @returns {string|null} */
export function flightDate(flight) {
  if (!flight) return null;
  const dt =
    flight.departureDateTime ||
    flight.date ||
    flight.arrivalDateTime ||
    null;
  return dateOnly(dt);
}

/** @param {object|null|undefined} flight @returns {string|null} */
export function flightArrivalDateTime(flight) {
  if (!flight) return null;
  return flight.arrivalDateTime || flight.departureDateTime || flight.date || null;
}

/** @param {object|null|undefined} ride @returns {string|null} */
export function rideDate(ride) {
  if (!ride) return null;
  return dateOnly(ride.pickupDateTime || ride.date);
}

/** @param {string} start @param {string} end @returns {string[]} */
export function tripNightDates(start, end) {
  const startD = dateOnly(start);
  const endD = dateOnly(end);
  if (!startD || !endD) return [];
  const span = daysBetweenDateStrings(endD, startD);
  if (span == null || span <= 0) return [];
  const nights = [];
  let current = startD;
  for (let i = 0; i < span; i += 1) {
    nights.push(current);
    const d = new Date(`${current}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    current = d.toISOString().slice(0, 10);
  }
  return nights;
}

/** @param {string} night @param {object[]} hotels @returns {boolean} */
export function nightCoveredByHotel(night, hotels) {
  return (hotels || []).some((h) => {
    const checkIn = dateOnly(h.checkIn);
    const checkOut = dateOnly(h.checkOut);
    if (!checkIn || !checkOut) return false;
    return checkIn <= night && checkOut > night;
  });
}

/** @param {object} trip @returns {string|undefined} */
export function primaryDestination(trip) {
  if (typeof trip.destination === "string" && trip.destination.trim()) {
    return trip.destination.trim();
  }
  const first = (trip.destinations || [])[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object" && typeof first.name === "string") {
    return first.name.trim();
  }
  return undefined;
}

/** @param {object} trip @returns {string|null} */
export function destinationCountry(trip) {
  const first = (trip.destinations || [])[0];
  if (first && typeof first === "object" && typeof first.country === "string") {
    return first.country.trim().toUpperCase();
  }
  if (typeof trip.destinationCountry === "string") {
    return trip.destinationCountry.trim().toUpperCase();
  }
  return null;
}

/** @param {number} lat1 @param {number} lng1 @param {number} lat2 @param {number} lng2 @returns {number} km */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Conservative minimum travel minutes between two points.
 * @param {number} distanceKm
 * @returns {number}
 */
export function minTravelMinutes(distanceKm) {
  if (distanceKm <= 2) return Math.ceil((distanceKm / 5) * 60) + 5;
  if (distanceKm <= 15) return Math.ceil((distanceKm / 25) * 60) + 10;
  return Math.ceil((distanceKm / 50) * 60) + 15;
}

/** @param {unknown} price @returns {number|null} */
export function parsePrice(price) {
  if (typeof price === "number" && Number.isFinite(price)) return price;
  if (typeof price === "string") {
    const n = parseFloat(price.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** @param {string} dateStr @param {number} daysBefore @returns {string} */
export function subtractDays(dateStr, daysBefore) {
  const d = new Date(`${dateOnly(dateStr)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBefore);
  return d.toISOString().slice(0, 10);
}

/** @param {string|null|undefined} iso @returns {string|null} */
export function isoDateOnly(iso) {
  if (!iso) return null;
  return dateOnly(iso);
}
