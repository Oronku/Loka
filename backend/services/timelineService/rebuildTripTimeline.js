import { memoryStore } from "../../config/memoryStore.js";
import { findById, getTripsCollection } from "../trip.service.js";
import { buildTimeline } from "./buildTimeline.js";
import {
  calculateTravelLegs,
  calculateArrivalTransfers,
} from "./calculateTravelLegs.js";

export const TIMELINE_SNAPSHOT_VERSION = 1;
const DEFAULT_MODE = "driving";

/**
 * Build a full timeline snapshot for a trip (events + travel legs).
 * Does NOT persist. May perform external (cached) travel-time calls.
 * @param {object} trip
 * @param {{ mode?: string }} [opts]
 */
export async function buildTripTimeline(trip, opts = {}) {
  const mode = opts.mode || DEFAULT_MODE;
  const { events, unscheduled } = buildTimeline(trip);
  const [legs, transfers] = await Promise.all([
    calculateTravelLegs(trip, events, { mode }),
    calculateArrivalTransfers(trip, events, { mode }),
  ]);

  return {
    version: TIMELINE_SNAPSHOT_VERSION,
    mode,
    events,
    unscheduled,
    legs,
    transfers,
    generatedAt: new Date().toISOString(),
    pending: false,
  };
}

/**
 * Cheap, instant snapshot: correct event ordering but no travel times yet.
 * Marked `pending: true` so clients know travel legs/transfers are still being
 * computed in the background. Does NOT perform any external calls.
 * @param {object} trip
 * @param {{ mode?: string }} [opts]
 */
export function buildPendingSnapshot(trip, opts = {}) {
  const mode = opts.mode || DEFAULT_MODE;
  const { events, unscheduled } = buildTimeline(trip);
  return {
    version: 0,
    mode,
    events,
    unscheduled,
    legs: [],
    transfers: [],
    generatedAt: new Date().toISOString(),
    pending: true,
  };
}

function snapshotTripId(trip) {
  return trip?.id || trip?._id?.toString() || null;
}

/**
 * Immediately persist a `pending` snapshot reflecting the trip's current items,
 * so reads during the background rebuild window are fresh (never stale) and
 * clearly flagged as still calculating. Returns the snapshot (or null).
 * @param {object} trip
 * @param {{ mode?: string }} [opts]
 */
export async function markTripTimelinePending(trip, opts = {}) {
  const tripId = snapshotTripId(trip);
  if (!tripId) return null;
  const snapshot = buildPendingSnapshot(trip, opts);
  await persistSnapshot(tripId, snapshot);
  return snapshot;
}

async function persistSnapshot(tripId, snapshot) {
  const collection = getTripsCollection();
  if (collection) {
    await collection.updateOne(
      { id: tripId },
      { $set: { timelineSnapshot: snapshot } }
    );
  } else {
    memoryStore.trips.update(tripId, { timelineSnapshot: snapshot });
  }
}

/**
 * Rebuild and persist the timeline snapshot for a trip. Awaitable.
 * @param {string} tripId
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<object|null>} the stored snapshot, or null if trip missing
 */
export async function rebuildTripTimeline(tripId, opts = {}) {
  const trip = await findById(tripId);
  if (!trip) return null;

  const snapshot = await buildTripTimeline(trip, opts);
  await persistSnapshot(tripId, snapshot);
  return snapshot;
}

const inFlight = new Map(); // tripId -> Promise
const pending = new Map(); // tripId -> latest opts

function runRebuild(tripId, opts) {
  const promise = rebuildTripTimeline(tripId, opts)
    .catch((err) => {
      console.error(`Timeline rebuild failed for trip ${tripId}:`, err.message);
    })
    .finally(() => {
      inFlight.delete(tripId);
      if (pending.has(tripId)) {
        const nextOpts = pending.get(tripId);
        pending.delete(tripId);
        runRebuild(tripId, nextOpts);
      }
    });

  inFlight.set(tripId, promise);
  return promise;
}

/**
 * Trigger a timeline rebuild without blocking the caller. Safe to call right
 * after responding to a mutating request.
 * @param {string} tripId
 * @param {{ mode?: string }} [opts]
 */
export function scheduleTimelineRebuild(tripId, opts = {}) {
  if (!tripId) return;

  if (inFlight.has(tripId)) {
    // A rebuild is already running; remember to run once more afterwards.
    pending.set(tripId, opts);
    return;
  }
  runRebuild(tripId, opts);
}

/**
 * Ensure a fresh full snapshot exists, blocking until it does. If a background
 * rebuild is already in flight for this trip, await it instead of starting a
 * second one (so we never double-call the travel APIs). Returns the snapshot.
 * @param {string} tripId
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<object|null>}
 */
export async function ensureTripTimeline(tripId, opts = {}) {
  if (!tripId) return null;
  if (inFlight.has(tripId)) {
    return (await inFlight.get(tripId)) || null;
  }
  return (await runRebuild(tripId, opts)) || null;
}
