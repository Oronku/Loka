/**
 * Trip Monitor agent.
 *
 * Watches upcoming trips for gaps and inconsistencies (e.g. no hotel covering
 * the dates, flights without a ride to/from the airport, attractions with no
 * scheduled date, an imminent trip with an empty itinerary) and either proposes
 * a fix (ChangeSet) or posts a heads-up message.
 *
 * Interface: export default { name, label, run(ctx) }
 * Filled in by a subagent — see registry.js for how it's wired.
 */

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
const MAX_EFFECTS_PER_TRIP = 2;

function tripCity(trip) {
  const first = trip.destinations?.[0];
  if (!first) return trip.destination || null;
  return typeof first === "string" ? first : first.name;
}

function daysUntil(startDate, now) {
  if (!startDate) return Infinity;
  const start = String(startDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return Infinity;
  const today = now.toISOString().slice(0, 10);
  const startMs = new Date(`${start}T12:00:00`).getTime();
  const todayMs = new Date(`${today}T12:00:00`).getTime();
  return Math.round((startMs - todayMs) / (24 * 60 * 60 * 1000));
}

function hasRideOnDate(rides, date) {
  if (!date) return false;
  const d = String(date).slice(0, 10);
  return (rides || []).some((r) => String(r.date || "").slice(0, 10) === d);
}

function arrivalMatchesCity(arrival, city) {
  if (!arrival || !city) return false;
  const a = arrival.toLowerCase();
  const c = city.toLowerCase();
  return a.includes(c) || c.includes(a);
}

function pickArrivalFlight(flights, city) {
  const list = flights || [];
  if (list.length === 0) return null;
  const matched = list.filter((f) => arrivalMatchesCity(f.arrival, city));
  if (matched.length > 0) return matched[matched.length - 1];
  return list[list.length - 1];
}

function hotelDropoff(hotels, city) {
  const hotel = (hotels || [])[0];
  if (!hotel) return city || "Destination";
  return hotel.name || hotel.address || hotel.location || city || "Destination";
}

export default {
  name: "trip_monitor",
  label: "Trip monitor",

  async run(ctx) {
    const { trips, tools, now } = ctx;
    const effects = [];

    for (const trip of trips) {
      try {
        const tripId = trip.id || trip._id?.toString();
        if (!tripId) continue;

        let tripEffects = 0;
        const city = tripCity(trip);
        const flights = trip.flights || [];
        const hotels = trip.hotels || [];
        const rides = trip.rides || [];
        const attractions = trip.attractions || [];
        const tripName = trip.name || "trip";

        // Imminent trip with an empty itinerary.
        if (tripEffects < MAX_EFFECTS_PER_TRIP) {
          const days = daysUntil(trip.startDate, now);
          const isEmpty = flights.length === 0 && hotels.length === 0 && attractions.length === 0;
          if (isEmpty && days >= 0 && days <= 3) {
            const dedupKey = `trip_monitor:empty:${tripId}`;
            if (!(await tools.hasRecentRun(dedupKey, THREE_DAYS))) {
              await tools.emitMessage({
                text:
                  `Your **${tripName}** trip starts soon and is still empty — ` +
                  `tell me what you'd like to do and I'll plan it.`,
              });
              await tools.recordRun(dedupKey, { tripId });
              effects.push({ tripId, type: "empty" });
              tripEffects++;
            }
          }
        }

        // Multi-night trip with no accommodation.
        if (tripEffects < MAX_EFFECTS_PER_TRIP) {
          const start = trip.startDate ? String(trip.startDate).slice(0, 10) : null;
          const end = trip.endDate ? String(trip.endDate).slice(0, 10) : null;
          const spansNight = start && end && start !== end;
          if (spansNight && hotels.length === 0) {
            const dedupKey = `trip_monitor:no_hotel:${tripId}`;
            if (!(await tools.hasRecentRun(dedupKey, SEVEN_DAYS))) {
              await tools.emitMessage({
                text:
                  `Heads up — your **${tripName}** trip doesn't have anywhere to stay yet. ` +
                  `Want me to find hotels?`,
              });
              await tools.recordRun(dedupKey, { tripId });
              effects.push({ tripId, type: "no_hotel" });
              tripEffects++;
            }
          }
        }

        // Flight without an airport transfer on arrival day.
        if (tripEffects < MAX_EFFECTS_PER_TRIP && flights.length > 0) {
          const flight = pickArrivalFlight(flights, city);
          if (flight) {
            const flightDate = flight.date ? String(flight.date).slice(0, 10) : null;
            const flightId = flight.id || `${flight.flightNumber || "flight"}:${flightDate || ""}`;
            if (flightDate && !hasRideOnDate(rides, flightDate)) {
              const dedupKey = `trip_monitor:ride:${tripId}:${flightId}`;
              if (!(await tools.hasRecentRun(dedupKey, SEVEN_DAYS))) {
                const pickup = flight.arrival || "Airport";
                const dropoff = hotelDropoff(hotels, city);
                const after = {
                  id: tools.randomUUID(),
                  pickup,
                  dropoff,
                  date: flightDate,
                  time: flight.time || "12:00",
                  createdAt: new Date(),
                };

                await tools.emitProposal({
                  tripId,
                  tripName: trip.name,
                  source: "agent:trip_monitor",
                  operations: [
                    tools.newOperation({
                      op: "add",
                      entity: "ride",
                      after,
                      label: `Airport transfer: ${pickup} → ${dropoff}`,
                    }),
                  ],
                  text:
                    `You're flying into **${pickup}** on ${flightDate} but don't have a ride yet — ` +
                    `want me to add an airport transfer to **${dropoff}**?`,
                });
                await tools.recordRun(dedupKey, { tripId, flightId });
                effects.push({ tripId, type: "ride", flightId });
                tripEffects++;
              }
            }
          }
        }
      } catch (err) {
        console.error(`[trip_monitor] trip failed:`, err.message);
      }
    }

    return effects;
  },
};
