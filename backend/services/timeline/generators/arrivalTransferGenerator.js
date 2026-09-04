import { combineDateAndTime, toTime } from "../buildTimeline.js";
import { resolveAirportLabel } from "../shared/location.js";
import { resolveLocationString } from "../shared/locationResolver.js";
import { getTravelTime } from "../shared/travelTimeService.js";
import { POST_FLIGHT_BUFFER_SECONDS } from "../shared/constants.js";

/** Day index (UTC) for matching events that fall on the same calendar day. */
function dayIndex(value) {
  const t = toTime(value);
  return Number.isNaN(t) ? null : Math.floor(t / 86400000);
}

/**
 * True when the user already added an explicit ride for the airport → hotel leg,
 * so we should not also synthesize an arrival-transfer (which duplicates it).
 */
function hasUserRideForArrivalTransfer(trip, flight, checkin) {
  const rides = trip?.rides;
  if (!Array.isArray(rides) || rides.length === 0) return false;

  const flightDay = dayIndex(flight.end);
  const hotelLabel = (checkin.subtitle || checkin.title || "").toLowerCase();
  const hotelShort = hotelLabel.replace(/^check in:\s*/i, "").trim();
  const airportCode = (flight.arrivalAirport || "").toLowerCase();

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
 * For each hotel check-in, find the relevant inbound flight and compute the
 * airport -> hotel transfer (drive time + estimated hotel arrival).
 *
 * This is independent of timeline ordering: a same-day flight that lands at
 * 20:10 is still matched to a 15:00 policy check-in. Returns "info card" style
 * objects so the static check-in time is left untouched.
 *
 * @param {object} trip
 * @param {object[]} events ordered events from buildTimeline
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<object[]>} transfers
 */
export async function calculateArrivalTransfers(trip, events, opts = {}) {
  const mode = opts.mode || "driving";
  const flights = events.filter(
    (e) => e.type === "flight" && e.departLocation && !Number.isNaN(toTime(e.end))
  );
  const checkins = events.filter((e) => e.type === "hotel-checkin");
  if (flights.length === 0 || checkins.length === 0) return [];

  return Promise.all(
    checkins.map(async (checkin) => {
      const checkinDay = dayIndex(checkin.start);

      // Prefer the latest flight arriving on/before the check-in day; otherwise
      // the flight whose arrival day is closest to the check-in.
      const candidates = flights
        .map((f) => ({ f, day: dayIndex(f.end), at: toTime(f.end) }))
        .filter((c) => c.day != null);
      const onOrBefore = candidates.filter(
        (c) => checkinDay == null || c.day <= checkinDay
      );
      // No flight arrives on/before the check-in, so the traveller did not fly
      // in to this hotel. Falling back to any flight pairs the check-in with a
      // later arrival and places the airport ride suggestion at a time that
      // cannot happen.
      if (onOrBefore.length === 0) return null;
      const pool = onOrBefore;
      pool.sort((a, b) =>
        checkinDay == null
          ? b.at - a.at
          : Math.abs(a.day - checkinDay) - Math.abs(b.day - checkinDay) ||
            b.at - a.at
      );
      const flight = pool[0]?.f;
      if (!flight) return null;

      if (hasUserRideForArrivalTransfer(trip, flight, checkin)) {
        return null;
      }

      const raw = flight.raw || {};
      const transfer = {
        type: "arrival-transfer",
        hotelTitle: checkin.hotelName || checkin.subtitle || checkin.title,
        hotelSourceIndex: checkin.sourceIndex,
        flightTitle: flight.title,
        // Never emit "" — frontend `??` treats empty string as present.
        fromAirport: resolveAirportLabel(
          flight.arrivalAirport,
          raw.arrivalAirportCode,
          raw.arrivalAirport,
          raw.to,
          raw.arrivalCity
        ),
        mode,
        flightArrival: flight.end || null,
        bufferSeconds: POST_FLIGHT_BUFFER_SECONDS,
        durationSeconds: null,
        durationText: null,
        distanceText: null,
        estimatedArrival: null,
        unresolved: false,
      };

      const origin = await resolveLocationString(
        flight.departLocation ?? flight.location,
        trip
      );
      const destination = await resolveLocationString(
        checkin.arriveLocation ?? checkin.location,
        trip
      );
      if (!origin || !destination) {
        transfer.unresolved = true;
        return transfer;
      }

      const travel = await getTravelTime(origin, destination, mode);
      if (!travel) {
        transfer.unresolved = true;
        return transfer;
      }

      transfer.durationSeconds = travel.durationSeconds;
      transfer.durationText = travel.durationText;
      transfer.distanceText = travel.distanceText;

      // Land + 30 min to clear the airport + drive time -> reach the hotel.
      const arr = toTime(flight.end);
      if (!Number.isNaN(arr) && travel.durationSeconds != null) {
        transfer.estimatedArrival = new Date(
          arr + (POST_FLIGHT_BUFFER_SECONDS + travel.durationSeconds) * 1000
        ).toISOString();
      }

      return transfer;
    })
  ).then((list) => list.filter(Boolean));
}

/**
 * Generator: derives airport -> hotel arrival transfers. Registered in the
 * TimelineEngine. `key` names the snapshot field this generator populates.
 */
export const arrivalTransferGenerator = {
  key: "transfers",
  generate: calculateArrivalTransfers,
};
