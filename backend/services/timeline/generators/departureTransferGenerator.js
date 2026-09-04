import { combineDateAndTime, toTime } from "../buildTimeline.js";
import { resolveAirportLabel } from "../shared/location.js";
import { resolveLocationString } from "../shared/locationResolver.js";
import { getTravelTime } from "../shared/travelTimeService.js";
import { DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS } from "../shared/constants.js";

/** Day index (UTC) for matching events that fall on the same calendar day. */
function dayIndex(value) {
  const t = toTime(value);
  return Number.isNaN(t) ? null : Math.floor(t / 86400000);
}

/**
 * How early to be at the airport before departure, in seconds. Reads an optional
 * per-trip / per-request override (minutes) and falls back to the default.
 */
function airportArrivalBufferSeconds(trip, opts) {
  const raw =
    opts?.airportArrivalBufferMinutes ??
    trip?.airportArrivalBufferMinutes ??
    trip?.timelinePrefs?.airportArrivalBufferMinutes;
  const minutes = Number(raw);
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes * 60);
  return DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS;
}

/**
 * True when the user already added an explicit ride for the hotel → airport leg,
 * so we should not also synthesize a departure-transfer (which duplicates it).
 */
function hasUserRideForDepartureTransfer(trip, flight, checkout) {
  const rides = trip?.rides;
  if (!Array.isArray(rides) || rides.length === 0) return false;

  const flightDay = dayIndex(flight.start);
  const hotelLabel = (checkout.subtitle || checkout.title || "").toLowerCase();
  const hotelShort = hotelLabel.replace(/^check out:\s*/i, "").trim();
  const airportCode = (flight.departureAirport || "").toLowerCase();

  return rides.some((ride) => {
    const when =
      ride.pickupDateTime || combineDateAndTime(ride.date, ride.time);
    const rideDay = dayIndex(when);
    if (flightDay != null && rideDay != null && rideDay !== flightDay) {
      return false;
    }

    const pickup = (ride.pickup || "").toLowerCase();
    const dropoff = (ride.dropoff || "").toLowerCase();
    if (!pickup || !dropoff) return false;

    const mentionsAirport =
      pickup.includes("airport") ||
      dropoff.includes("airport") ||
      (airportCode &&
        (pickup.includes(airportCode) || dropoff.includes(airportCode)));
    const mentionsHotel =
      (hotelShort &&
        (pickup.includes(hotelShort) || dropoff.includes(hotelShort))) ||
      (hotelLabel &&
        hotelLabel !== hotelShort &&
        (pickup.includes(hotelLabel) || dropoff.includes(hotelLabel)));

    return mentionsAirport && mentionsHotel;
  });
}

/**
 * For each hotel check-out, find the outbound flight the traveller is leaving to
 * catch and compute the hotel -> airport transfer: drive time, when to leave the
 * hotel, and when they should be at the airport (flight departure minus buffer).
 *
 * Mirror of the arrival-transfer generator. Returns "info card" style objects so
 * the static check-out time is left untouched.
 *
 * @param {object} trip
 * @param {object[]} events ordered events from buildTimeline
 * @param {{ mode?: string, airportArrivalBufferMinutes?: number }} [opts]
 * @returns {Promise<object[]>} departure transfers
 */
export async function calculateDepartureTransfers(trip, events, opts = {}) {
  const mode = opts.mode || "driving";
  const bufferSeconds = airportArrivalBufferSeconds(trip, opts);

  // A flight's `arriveLocation` is its departure airport (you travel TO the
  // departure airport). `start` is the scheduled departure time.
  const flights = events.filter(
    (e) =>
      e.type === "flight" &&
      (e.arriveLocation || e.location) &&
      !Number.isNaN(toTime(e.start))
  );
  const checkouts = events.filter((e) => e.type === "hotel-checkout");
  if (flights.length === 0 || checkouts.length === 0) return [];

  return Promise.all(
    checkouts.map(async (checkout) => {
      const checkoutDay = dayIndex(checkout.end || checkout.start);

      // Prefer the earliest flight departing on/after the check-out day;
      // otherwise the flight whose departure day is closest to the check-out.
      const candidates = flights
        .map((f) => ({ f, day: dayIndex(f.start), at: toTime(f.start) }))
        .filter((c) => c.day != null);
      const onOrAfter = candidates.filter(
        (c) => checkoutDay == null || c.day >= checkoutDay
      );
      // No flight departs on/after the check-out, so there is nothing to leave
      // for. Falling back to any flight pairs the check-out with the trip's
      // outbound departure and anchors a "be at the airport" card before the
      // trip has even started.
      if (onOrAfter.length === 0) return null;
      const pool = onOrAfter;
      pool.sort((a, b) =>
        checkoutDay == null
          ? a.at - b.at
          : Math.abs(a.day - checkoutDay) - Math.abs(b.day - checkoutDay) ||
            a.at - b.at
      );
      const flight = pool[0]?.f;
      if (!flight) return null;

      if (hasUserRideForDepartureTransfer(trip, flight, checkout)) {
        return null;
      }

      const departureMs = toTime(flight.start);
      const airportArrivalBy =
        Number.isNaN(departureMs)
          ? null
          : new Date(departureMs - bufferSeconds * 1000).toISOString();

      const raw = flight.raw || {};
      const transfer = {
        type: "departure-transfer",
        hotelTitle: checkout.hotelName || checkout.subtitle || checkout.title,
        hotelSourceIndex: checkout.sourceIndex,
        flightTitle: flight.title,
        // Never emit "" — frontend `??` treats empty string as present.
        toAirport: resolveAirportLabel(
          flight.departureAirport,
          raw.departureAirportCode,
          raw.departureAirport,
          raw.from,
          raw.departureCity
        ),
        mode,
        flightDeparture: flight.start || null,
        bufferSeconds,
        durationSeconds: null,
        durationText: null,
        distanceText: null,
        airportArrivalBy,
        leaveHotelBy: null,
        unresolved: false,
      };

      const origin = await resolveLocationString(
        checkout.departLocation ?? checkout.location,
        trip
      );
      const destination = await resolveLocationString(
        flight.arriveLocation ?? flight.location,
        trip
      );
      if (!origin || !destination) {
        transfer.unresolved = true;
        return transfer;
      }

      // hotel -> airport. If that exact pair isn't available (e.g. Google is
      // temporarily unavailable but the airport -> hotel arrival leg was already
      // cached), fall back to the reverse direction: driving time is ~symmetric,
      // and this reuses the arrival-transfer's cached lookup.
      let travel = await getTravelTime(origin, destination, mode);
      if (!travel) {
        travel = await getTravelTime(destination, origin, mode);
      }
      if (!travel) {
        transfer.unresolved = true;
        return transfer;
      }

      transfer.durationSeconds = travel.durationSeconds;
      transfer.durationText = travel.durationText;
      transfer.distanceText = travel.distanceText;

      // Leave the hotel = flight departure - airport buffer - drive time.
      if (!Number.isNaN(departureMs) && travel.durationSeconds != null) {
        transfer.leaveHotelBy = new Date(
          departureMs - (bufferSeconds + travel.durationSeconds) * 1000
        ).toISOString();
      }

      return transfer;
    })
  ).then((list) => list.filter(Boolean));
}

/**
 * Generator: derives hotel -> airport departure transfers. Registered in the
 * TimelineEngine. `key` names the snapshot field this generator populates.
 */
export const departureTransferGenerator = {
  key: "departureTransfers",
  generate: calculateDepartureTransfers,
};
