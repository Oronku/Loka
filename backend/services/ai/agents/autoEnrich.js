/**
 * Auto-Enrich.
 *
 * Background job: scans upcoming trips for scheduled attractions missing place
 * metadata or carrying stale cached facts, fetches from Google Places, and writes
 * straight onto the trip — never via a proposal.
 *
 * Objective facts about a place (address, opening hours, website, coordinates,
 * photos, placeId) belong to the place, not the user's trip. There is nothing
 * to approve; the app displays them live. Proposals are for trip decisions only.
 *
 * Notes and unscheduled ideas are skipped. Google rating is never written onto
 * the trip. Output is silent DB updates plus optional timeline rebuild — never a
 * chat message or review card.
 *
 * Reference agent interface:
 *   export default { name, label, run(ctx) }
 * where ctx = { db, user, trips, allTrips, now, tools }.
 */

import { buildIdQuery } from "../../trip.service.js";
import { scheduleTimelineRebuild } from "../../timeline/index.js";
import { acquireAutoEnrichLock, releaseAutoEnrichLock } from "./locks.js";

const MAX_ITEMS_PER_TRIP = 6;

/** Place-fact cache TTL — hours change rarely but do change; 7 days balances freshness vs API cost. */
export const PLACE_FACTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tripCity(trip) {
  const first = trip.destinations?.[0];
  if (!first) return trip.destination || null;
  return typeof first === "string" ? first : first.name;
}

/**
 * Notes and Ideas-tab items are not trip stops — do not Google them.
 * Keep planned/booked items, and anything with a scheduled date/time.
 */
function isEnrichableAttraction(a) {
  if (!a) return false;
  if (a.placeholder === true || a.isPlaceholder === true) return false;
  if (a.attractionType === "note" || a.type === "note") return false;
  if (a.status === "idea") return false;
  if (!a.status && !a.scheduledDate && !a.scheduledTime) return false;
  return true;
}

function missingPlumbingFields(a) {
  return (
    !a.placeId ||
    !a.photoReference ||
    !a.imageUrl ||
    a.lat == null ||
    a.lng == null
  );
}

function missingPlaceFacts(a) {
  return !a.address || !a.openingHours || !a.website;
}

/**
 * @param {object} a
 * @param {number} nowMs
 */
export function placeFactsAreStale(a, nowMs = Date.now()) {
  const hasFacts = !!(a.address || a.openingHours || a.website);
  if (!hasFacts) return false;
  if (!a.placeFactsFetchedAt) return true;
  return nowMs - new Date(a.placeFactsFetchedAt).getTime() > PLACE_FACTS_TTL_MS;
}

function attractionNeedsEnrichment(a, nowMs) {
  if (!isEnrichableAttraction(a)) return false;
  if (!a.name) return false;
  return (
    missingPlumbingFields(a) ||
    missingPlaceFacts(a) ||
    placeFactsAreStale(a, nowMs)
  );
}

function stableItemId(a) {
  return a?.id ?? a?._id?.toString() ?? null;
}

/**
 * Build silent field updates from a Google enrich result. Never includes rating.
 *
 * @param {object} a current attraction
 * @param {object} place enrichPlace result
 * @param {{ refreshStale: boolean }} options
 */
export function buildSilentEnrichmentUpdates(a, place, { refreshStale }) {
  const updates = {};

  if (!a.placeId && place.placeId) updates.placeId = place.placeId;
  if (!a.photoReference && place.photoReference) {
    updates.photoReference = place.photoReference;
  }
  if (a.lat == null && place.lat != null) updates.lat = place.lat;
  if (a.lng == null && place.lng != null) updates.lng = place.lng;

  if ((!a.address || refreshStale) && place.address) {
    updates.address = place.address;
    if ((!a.location || refreshStale) && place.address) {
      updates.location = place.address;
    }
  }
  if ((!a.openingHours || refreshStale) && place.openingHours) {
    updates.openingHours = place.openingHours;
  }
  if ((!a.website || refreshStale) && place.website) {
    updates.website = place.website;
  }

  return updates;
}

/**
 * Write silent enrichment fields directly on the trip.
 *
 * @returns {Promise<boolean>} whether the trip document was modified
 */
async function silentlyFillFields(db, tripId, itemId, updates, fetchedAt) {
  const setFields = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value == null) continue;
    setFields[`attractions.$[el].${key}`] = value;
  }
  if (fetchedAt) {
    setFields["attractions.$[el].placeFactsFetchedAt"] = fetchedAt;
  }
  if (Object.keys(setFields).length === 0) return false;

  setFields.updatedAt = new Date().toISOString();
  const result = await db.collection("trips").updateOne(
    { ...buildIdQuery(tripId), "attractions.id": itemId },
    { $set: setFields },
    { arrayFilters: [{ "el.id": itemId }] },
  );
  const modified = (result.modifiedCount ?? 0) > 0;
  if (modified) scheduleTimelineRebuild(tripId);
  return modified;
}

export default {
  name: "auto_enrich",
  label: "Auto-enrich",

  async run(ctx) {
    const { trips, tools, db } = ctx;
    const nowMs = ctx.now?.getTime?.() ?? Date.now();
    const fetchedAt = (ctx.now ?? new Date()).toISOString();
    const effects = [];

    for (const trip of trips) {
      const tripId = trip.id || trip._id?.toString();
      if (!tripId) continue;

      const locked = await acquireAutoEnrichLock(db, tripId, ctx.now);
      if (!locked) {
        console.log(`[auto_enrich] skip reason=in_flight trip=${tripId}`);
        continue;
      }

      try {
        const city = tripCity(trip);
        const candidates = (trip.attractions || [])
          .filter((a) => attractionNeedsEnrichment(a, nowMs))
          .slice(0, MAX_ITEMS_PER_TRIP);

        if (candidates.length === 0) continue;

        for (const a of candidates) {
          const itemId = stableItemId(a);
          if (!itemId) continue;

          const place = await tools.enrichPlace(a.name, city, db);
          if (!place) continue;

          const refreshStale = placeFactsAreStale(a, nowMs);
          const updates = buildSilentEnrichmentUpdates(a, place, { refreshStale });

          const modified = await silentlyFillFields(
            db,
            tripId,
            itemId,
            updates,
            fetchedAt,
          );
          if (modified) effects.push({ tripId, itemId, filled: true });
        }
      } finally {
        await releaseAutoEnrichLock(db, tripId);
      }
    }

    return effects;
  },
};
