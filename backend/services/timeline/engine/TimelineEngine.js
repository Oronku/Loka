import { buildTimeline } from "../buildTimeline.js";
import { travelLegGenerator } from "../generators/travelLegGenerator.js";
import { arrivalTransferGenerator } from "../generators/arrivalTransferGenerator.js";
import { departureTransferGenerator } from "../generators/departureTransferGenerator.js";

export const TIMELINE_SNAPSHOT_VERSION = 7;
const DEFAULT_MODE = "driving";

/**
 * Ordered generator registry. Each generator exposes a `key` (the snapshot field
 * it populates) and a `generate(trip, events, opts)` method.
 *
 * To add a new derived timeline rule (e.g. DepartureTransfer, Walking, Transit),
 * create a generator module and append it here. The engine below iterates the
 * registry without needing any change — open for extension, closed for
 * modification. Execution order is deterministic (array order).
 */
const generators = [
  travelLegGenerator,
  arrivalTransferGenerator,
  departureTransferGenerator,
];

/**
 * Orchestrate the complete timeline calculation for a trip.
 *
 * The engine holds no timeline business logic: it builds the source events,
 * runs every registered generator, merges their output into the snapshot, and
 * returns it. It does NOT persist.
 *
 * @param {object} trip
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<object>} the full timeline snapshot
 */
export async function recalculateTimeline(trip, opts = {}) {
  const mode = opts.mode || DEFAULT_MODE;
  const { events, unscheduled } = buildTimeline(trip);

  // Run generators in parallel (preserves the prior calculateTravelLegs +
  // calculateArrivalTransfers Promise.all behavior). Order stays deterministic
  // because results are keyed back by each generator's registry position.
  const results = await Promise.all(
    generators.map((generator) => generator.generate(trip, events, { mode }))
  );

  const generated = {};
  generators.forEach((generator, i) => {
    generated[generator.key] = results[i];
  });

  const legs = generated.legs || [];
  const transfers = generated.transfers || [];
  stampTravelIn(events, { legs, transfers });

  return {
    version: TIMELINE_SNAPSHOT_VERSION,
    mode,
    events,
    unscheduled,
    legs,
    transfers,
    departureTransfers: generated.departureTransfers || [],
    generatedAt: new Date().toISOString(),
    pending: false,
  };
}

function travelInFromSource(source, sourceName) {
  const unresolved =
    Boolean(source.unresolved) || source.durationSeconds == null;
  return {
    mode: source.mode,
    durationSeconds: unresolved ? null : source.durationSeconds,
    durationText: unresolved ? null : source.durationText ?? null,
    distanceText: unresolved ? null : source.distanceText ?? null,
    bufferSeconds: source.bufferSeconds ?? 0,
    arriveBy: unresolved ? null : source.estimatedArrival ?? null,
    leaveBy: source.leaveBy ?? null,
    unresolved,
    source: sourceName,
  };
}

/**
 * Stamp inbound-travel metadata onto hotel check-ins and attractions so the
 * client does not have to join events against legs/transfers. Additive only —
 * event.start / event.arrival are left untouched.
 */
function stampTravelIn(events, { legs, transfers }) {
  if (!Array.isArray(events) || events.length === 0) return;

  events.forEach((event, index) => {
    if (event.type !== "hotel-checkin" && event.type !== "attraction") return;

    if (event.type === "hotel-checkin") {
      const transfer = transfers.find(
        (t) => t && t.hotelSourceIndex === event.sourceIndex
      );
      if (transfer) {
        event.travelIn = travelInFromSource(transfer, "arrival-transfer");
        return;
      }
    }

    const leg = legs.find((l) => l && l.toIndex === index);
    if (leg) {
      event.travelIn = travelInFromSource(leg, "leg");
    }
  });
}
