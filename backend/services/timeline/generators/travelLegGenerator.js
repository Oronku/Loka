import { toTime } from "../buildTimeline.js";
import { resolveLocationString } from "../shared/locationResolver.js";
import { getTravelTime } from "../shared/travelTimeService.js";
import { POST_FLIGHT_BUFFER_SECONDS } from "../shared/constants.js";

/**
 * Compute travel legs between consecutive scheduled events.
 * @param {object} trip
 * @param {object[]} events ordered events from buildTimeline
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<object[]>} legs
 */
export async function calculateTravelLegs(trip, events, opts = {}) {
  const mode = opts.mode || "driving";
  if (!Array.isArray(events) || events.length < 2) return [];

  // A leg leaves from one event's departLocation and arrives at the next
  // event's arriveLocation. These differ for flights (depart airport vs
  // arrival airport); for other events both fall back to `location`.
  const departLocations = await Promise.all(
    events.map((event) =>
      resolveLocationString(event.departLocation ?? event.location, trip)
    )
  );
  const arriveLocations = await Promise.all(
    events.map((event) =>
      resolveLocationString(event.arriveLocation ?? event.location, trip)
    )
  );

  // Resolve every leg in parallel; per-pair caching keeps repeat builds cheap.
  return Promise.all(
    events.slice(0, -1).map(async (from, i) => {
      const to = events[i + 1];
      const origin = departLocations[i];
      const destination = arriveLocations[i + 1];

      // After a flight, add a fixed buffer before the onward drive can start.
      const bufferSeconds =
        from.type === "flight" ? POST_FLIGHT_BUFFER_SECONDS : 0;

      const leg = {
        fromIndex: i,
        toIndex: i + 1,
        fromTitle: from.title,
        toTitle: to.title,
        mode,
        unresolved: false,
        durationSeconds: null,
        durationText: null,
        distanceText: null,
        bufferSeconds,
        gapSeconds: null,
        tight: false,
        leaveBy: null,
        estimatedArrival: null,
      };

      const prevEnd = toTime(from.end || from.start);
      const nextStart = toTime(to.start);
      if (!Number.isNaN(prevEnd) && !Number.isNaN(nextStart)) {
        leg.gapSeconds = Math.round((nextStart - prevEnd) / 1000);
      }

      if (!origin || !destination) {
        leg.unresolved = true;
        return leg;
      }

      const travel = await getTravelTime(origin, destination, mode);
      if (!travel) {
        leg.unresolved = true;
        return leg;
      }

      leg.durationSeconds = travel.durationSeconds;
      leg.durationText = travel.durationText;
      leg.distanceText = travel.distanceText;

      // When you reach the next place: end of previous event + post-flight
      // buffer (if any) + travel duration. E.g. land at 20:10, +30 min to exit
      // the airport, ~40 min drive -> reach the hotel ~21:20.
      if (!Number.isNaN(prevEnd) && travel.durationSeconds != null) {
        leg.estimatedArrival = new Date(
          prevEnd + (bufferSeconds + travel.durationSeconds) * 1000
        ).toISOString();
      }

      const effectiveTravel =
        travel.durationSeconds != null
          ? travel.durationSeconds + bufferSeconds
          : null;
      if (
        leg.gapSeconds != null &&
        effectiveTravel != null &&
        effectiveTravel > leg.gapSeconds
      ) {
        leg.tight = true;
        if (!Number.isNaN(nextStart)) {
          leg.leaveBy = new Date(
            nextStart - effectiveTravel * 1000
          ).toISOString();
        }
      }

      return leg;
    })
  );
}

/**
 * Generator: derives inter-event travel legs. Registered in the TimelineEngine.
 * `key` names the snapshot field this generator populates.
 */
export const travelLegGenerator = {
  key: "legs",
  generate: calculateTravelLegs,
};
