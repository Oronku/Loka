/**
 * Auto-Enrich.
 *
 * Scans upcoming trips for scheduled attractions missing useful metadata
 * (address, placeId, photo, opening hours, website) and proposes one
 * enrichment ChangeSet per place using Google Places. Notes and unscheduled
 * ideas are skipped. Google rating is never written onto the trip.
 * Output is a reviewable card on the trip — never a chat message.
 *
 * This file is the reference implementation for the agent interface:
 *   export default { name, label, run(ctx) }
 * where ctx = { db, user, trips, allTrips, now, tools }.
 */

import { hasPendingItemProposal, leftoverAfter } from "../proposalDedup.js";
import { acquireAutoEnrichLock, releaseAutoEnrichLock } from "./locks.js";

const MAX_ITEMS_PER_TRIP = 6;

const USER_FIELD_LABELS = {
  address: "address",
  openingHours: "opening hours",
  website: "website",
  photoReference: "photo",
};

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
  if (a.attractionType === "note" || a.type === "note") return false;
  if (a.status === "idea") return false;
  if (!a.status && !a.scheduledDate && !a.scheduledTime) return false;
  return true;
}

function attractionNeedsEnrichment(a) {
  if (!isEnrichableAttraction(a)) return false;
  if (!a.name) return false;
  return !a.placeId || !a.address || !a.openingHours || !a.website;
}

function stableItemId(a) {
  return a?.id ?? a?._id?.toString() ?? null;
}

function joinFields(names) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function userFacingFields(after) {
  const names = [];
  if (after.address || after.location) names.push(USER_FIELD_LABELS.address);
  if (after.openingHours) names.push(USER_FIELD_LABELS.openingHours);
  if (after.website) names.push(USER_FIELD_LABELS.website);
  if (after.photoReference) names.push(USER_FIELD_LABELS.photoReference);
  return names;
}

/**
 * @param {string} name
 * @param {string[]} fields
 */
export function enrichRationale(name, fields) {
  const listed = joinFields(fields);
  const reason =
    fields.length === 1 ? "it was missing" : fields.length === 2 ? "both were missing" : "those were missing";
  const want = fields.length === 1 ? "it" : "them";
  return `I found the ${listed} for ${name} — because ${reason}. Want ${want} on the trip?`;
}

/**
 * @param {string} name
 * @param {string[]} fields
 */
export function enrichLabel(name, fields) {
  return `Add ${joinFields(fields)} to ${name}`;
}

async function skipItemEarly(db, userId, tripId, itemId) {
  const pending = await hasPendingItemProposal(db, {
    userId,
    tripId,
    itemId,
    entity: "attraction",
    op: "update",
  });
  if (pending) {
    console.log(
      `[auto_enrich] skip reason=pending_same_item trip=${tripId} item=${itemId}`,
    );
    return true;
  }
  return false;
}

export default {
  name: "auto_enrich",
  label: "Auto-enrich",

  async run(ctx) {
    const { trips, tools, db, user } = ctx;
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
          .filter(attractionNeedsEnrichment)
          .slice(0, MAX_ITEMS_PER_TRIP);

        if (candidates.length === 0) continue;

        for (const a of candidates) {
          const itemId = stableItemId(a);
          if (!itemId) continue;

          if (await skipItemEarly(db, user?.id, tripId, itemId)) continue;

          const place = await tools.enrichPlace(a.name, city, db);
          if (!place) continue;

          const after = leftoverAfter(a, {
            ...(place.address && place.address !== a.address ? { address: place.address } : {}),
            ...(place.address && !a.location && place.address !== a.address
              ? { location: place.address }
              : {}),
            ...(place.placeId && !a.placeId ? { placeId: place.placeId } : {}),
            ...(place.photoReference && !a.photoReference
              ? { photoReference: place.photoReference }
              : {}),
            ...(place.openingHours && !a.openingHours ? { openingHours: place.openingHours } : {}),
            ...(place.website && !a.website ? { website: place.website } : {}),
            ...(place.lat != null && a.lat == null ? { lat: place.lat } : {}),
            ...(place.lng != null && a.lng == null ? { lng: place.lng } : {}),
          });

          const fields = userFacingFields(after);
          if (fields.length === 0) continue;

          const op = tools.newOperation({
            op: "update",
            entity: "attraction",
            itemId,
            before: {
              address: a.address ?? null,
              openingHours: a.openingHours ?? null,
              website: a.website ?? null,
            },
            after,
            label: enrichLabel(a.name, fields),
          });

          const created = await tools.emitProposal({
            tripId,
            tripName: trip.name,
            source: "agent:auto_enrich",
            operations: [op],
            text: enrichRationale(a.name, fields),
          });
          if (created) effects.push({ tripId, itemId, count: 1 });
        }
      } finally {
        await releaseAutoEnrichLock(db, tripId);
      }
    }

    return effects;
  },
};
