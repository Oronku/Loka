/**
 * Auto-Enrich agent.
 *
 * Scans upcoming trips for attractions/hotels that are missing useful metadata
 * (address, rating, placeId, photo) and proposes an enrichment ChangeSet using
 * Google Places. Output lands in the user's Loka chat as a reviewable diff.
 *
 * This file is the reference implementation for the agent interface:
 *   export default { name, label, run(ctx) }
 * where ctx = { db, user, trips, allTrips, now, tools }.
 */

const MAX_ITEMS_PER_TRIP = 6;

function tripCity(trip) {
  const first = trip.destinations?.[0];
  if (!first) return trip.destination || null;
  return typeof first === "string" ? first : first.name;
}

function attractionNeedsEnrichment(a) {
  if (!a?.name) return false;
  return !a.placeId || !a.address || a.rating == null;
}

export default {
  name: "auto_enrich",
  label: "Auto-enrich",

  async run(ctx) {
    const { trips, tools } = ctx;
    const effects = [];

    for (const trip of trips) {
      const tripId = trip.id || trip._id?.toString();
      if (!tripId) continue;

      const city = tripCity(trip);
      const candidates = (trip.attractions || [])
        .filter(attractionNeedsEnrichment)
        .slice(0, MAX_ITEMS_PER_TRIP);

      if (candidates.length === 0) continue;

      const operations = [];
      for (const a of candidates) {
        // Skip if we already proposed enrichment for this exact item recently.
        const dedupKey = `auto_enrich:${tripId}:${a.id}`;
        if (await tools.hasRecentRun(dedupKey, 7 * 24 * 60 * 60 * 1000)) continue;

        const place = await tools.enrichPlace(a.name, city);
        if (!place) continue;

        const after = {};
        if (place.address && place.address !== a.address) after.address = place.address;
        if (place.address && place.address !== a.location) after.location = place.address;
        if (place.rating != null && a.rating == null) after.rating = place.rating;
        if (place.placeId && !a.placeId) after.placeId = place.placeId;
        if (place.photoReference && !a.photoReference) after.photoReference = place.photoReference;

        if (Object.keys(after).length === 0) continue;

        operations.push(
          tools.newOperation({
            op: "update",
            entity: "attraction",
            itemId: a.id,
            before: { address: a.address ?? null, rating: a.rating ?? null },
            after,
            label: `Enrich ${a.name}${place.rating != null ? ` · ★${place.rating}` : ""}`,
          }),
        );
        await tools.recordRun(dedupKey, { tripId, itemId: a.id });
      }

      if (operations.length === 0) continue;

      const text =
        `I found extra details for ${operations.length} place${operations.length === 1 ? "" : "s"} ` +
        `on **${trip.name}** (addresses, ratings, photos). Review and apply if you'd like.`;

      await tools.emitProposal({
        tripId,
        tripName: trip.name,
        source: "agent:auto_enrich",
        operations,
        text,
      });
      effects.push({ tripId, count: operations.length });
    }

    return effects;
  },
};
