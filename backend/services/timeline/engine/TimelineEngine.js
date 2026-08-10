import { buildTimeline } from "../buildTimeline.js";
import { travelLegGenerator } from "../generators/travelLegGenerator.js";
import { arrivalTransferGenerator } from "../generators/arrivalTransferGenerator.js";
import { departureTransferGenerator } from "../generators/departureTransferGenerator.js";

export const TIMELINE_SNAPSHOT_VERSION = 5;
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

  return {
    version: TIMELINE_SNAPSHOT_VERSION,
    mode,
    events,
    unscheduled,
    legs: generated.legs || [],
    transfers: generated.transfers || [],
    departureTransfers: generated.departureTransfers || [],
    generatedAt: new Date().toISOString(),
    pending: false,
  };
}
