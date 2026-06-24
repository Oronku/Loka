/**
 * Trip Monitor agent.
 *
 * Watches upcoming trips for gaps and inconsistencies (e.g. no hotel covering
 * the dates, flights without a ride to/from the airport, landing city vs hotel
 * mismatch, an imminent trip with an empty itinerary) and either proposes a
 * fix (ChangeSet) or posts a heads-up notification.
 */

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
const MAX_EFFECTS_PER_TRIP = 3;

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

/** Map app flight records (departureDateTime / arrivalAirportCode) to monitor fields. */
function normalizeFlight(f) {
  const arrivalDt = f.arrivalDateTime || f.date || null;
  const date = arrivalDt ? String(arrivalDt).slice(0, 10) : null;
  let time = f.arrivalTimeLocal || f.time || "12:00";
  if (arrivalDt && String(arrivalDt).includes("T") && !f.arrivalTimeLocal) {
    time = String(arrivalDt).slice(11, 16);
  }
  const arrivalAirportCode = f.arrivalAirportCode || f.arrivalAirport || "";
  const arrivalCity = f.arrivalCity || "";
  const arrivalCountry = f.arrivalCountry || "";
  const legacyArrival = f.arrival || f.arriveLocation || "";
  const arrivalLabel =
    [arrivalAirportCode, arrivalCity].filter(Boolean).join(" · ") ||
    legacyArrival ||
    "Airport";
  return {
    raw: f,
    id: f.id,
    flightNumber: f.flightNumber,
    date,
    time,
    arrivalAirportCode,
    arrivalCity,
    arrivalCountry,
    arrivalLabel,
  };
}

function hotelText(hotel) {
  return [hotel?.name, hotel?.address, hotel?.location].filter(Boolean).join(" ").toLowerCase();
}

function primaryWord(s) {
  const w = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)[0];
  return w && w.length >= 3 ? w : "";
}

/**
 * Detect when the arrival airport/city doesn't match where the hotel appears to be.
 * e.g. flight to Paris + hotel in the Dolomites.
 */
function detectLocationMismatch(flight, hotel, tripCityName) {
  if (!hotel) return null;
  const norm = normalizeFlight(flight);
  const hotelLower = hotelText(hotel);
  if (!hotelLower || hotelLower.length < 3) return null;

  const arrivalLower = norm.arrivalLabel.toLowerCase();
  const italianHints = ["dolomite", "dolomiti", "cortina", "trentino", "italy", "italia", "venice", "milano"];
  const hotelInItaly = italianHints.some((h) => hotelLower.includes(h));
  const arrivalInItaly = italianHints.some((h) => arrivalLower.includes(h));
  if (hotelInItaly && !arrivalInItaly) {
    return (
      `Your flight lands in **${norm.arrivalLabel}** but your hotel (**${hotel.name}**) looks like it's in **Italy** ` +
      `(Dolomites area). That's a long overland trip — you may need a connecting flight, train, or a hotel near the airport.`
    );
  }

  const cityWord = primaryWord(norm.arrivalCity);
  const tripWord = primaryWord(tripCityName);

  // Hotel explicitly in the arrival city — all good.
  if (cityWord && hotelLower.includes(cityWord)) return null;
  if (norm.arrivalAirportCode && hotelLower.includes(norm.arrivalAirportCode.toLowerCase())) {
    return null;
  }

  const country = (norm.arrivalCountry || "").toLowerCase();
  const frenchHints = ["france", "paris", "lyon", "nice"];
  if (country === "france" && italianHints.some((h) => hotelLower.includes(h))) {
    return (
      `Your flight lands in **${norm.arrivalLabel}** (France) but your hotel looks like it's in **Italy** ` +
      `(**${hotel.name}**). That's a long overland trip — you may need a connecting flight or train, ` +
      `or a hotel near ${norm.arrivalCity || "the airport"}.`
    );
  }
  if (country === "italy" && frenchHints.some((h) => hotelLower.includes(h)) && !hotelLower.includes("italy")) {
    return (
      `Your flight lands in **${norm.arrivalLabel}** but your hotel appears to be in **France**. ` +
      `Double-check your routing.`
    );
  }

  // Trip destination matches hotel but flight lands elsewhere.
  if (tripWord && hotelLower.includes(tripWord) && cityWord && !cityWord.includes(tripWord) && !tripWord.includes(cityWord)) {
    return (
      `Your flight lands in **${norm.arrivalLabel}** but your hotel is in **${tripCityName || hotel.name}** — ` +
      `different places. You might need a domestic connection or ground transfer between them.`
    );
  }

  // Generic: arrival city name not mentioned anywhere in hotel text.
  if (cityWord && cityWord.length >= 4 && !hotelLower.includes(cityWord)) {
    return (
      `Heads up — you land in **${norm.arrivalLabel}** but your hotel (**${hotel.name}**) doesn't look like it's there. Worth a quick check.`
    );
  }

  return null;
}

function pickArrivalFlight(flights, city) {
  const list = (flights || []).map(normalizeFlight);
  if (list.length === 0) return null;
  const cityLower = (city || "").toLowerCase();
  const matched = list.filter((f) => {
    const label = f.arrivalLabel.toLowerCase();
    const c = (f.arrivalCity || "").toLowerCase();
    return (cityLower && (label.includes(cityLower) || c.includes(cityLower))) || false;
  });
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
        const primaryHotel = hotels[0] || null;
        const primaryFlight = flights.length ? pickArrivalFlight(flights, city)?.raw || flights[flights.length - 1] : null;
        const norm = primaryFlight ? normalizeFlight(primaryFlight) : null;

        // Flight lands in one place, hotel is somewhere else (e.g. Paris → Dolomites).
        if (tripEffects < MAX_EFFECTS_PER_TRIP && primaryFlight && primaryHotel) {
          const mismatch = detectLocationMismatch(primaryFlight, primaryHotel, city);
          if (mismatch) {
            const flightId = norm.id || `${norm.flightNumber || "flight"}:${norm.date || ""}`;
            const dedupKey = `trip_monitor:mismatch:${tripId}:${flightId}`;
            if (!(await tools.hasRecentRun(dedupKey, SEVEN_DAYS))) {
              await tools.emitMessage({
                text: mismatch,
                tripId,
                type: "heads_up",
                source: "agent:trip_monitor",
                target: norm.id ? { entity: "flight", itemId: norm.id } : null,
              });
              await tools.recordRun(dedupKey, { tripId, flightId });
              effects.push({ tripId, type: "mismatch", flightId });
              tripEffects++;
            }
          }
        }

        // Flight without an airport transfer on arrival day.
        if (tripEffects < MAX_EFFECTS_PER_TRIP && norm?.date) {
          const flightId = norm.id || `${norm.flightNumber || "flight"}:${norm.date}`;
          if (!hasRideOnDate(rides, norm.date)) {
            const dedupKey = `trip_monitor:ride:${tripId}:${flightId}`;
            if (!(await tools.hasRecentRun(dedupKey, SEVEN_DAYS))) {
              const pickup = norm.arrivalLabel;
              const dropoff = hotelDropoff(hotels, city);
              const after = {
                id: tools.randomUUID(),
                pickup,
                dropoff,
                date: norm.date,
                time: norm.time || "12:00",
                createdAt: new Date(),
              };

              let rationale =
                `You're flying into **${pickup}** on ${norm.date} but don't have a ride yet — ` +
                `want me to add an airport transfer to **${dropoff}**?`;
              const mismatch = primaryHotel
                ? detectLocationMismatch(primaryFlight, primaryHotel, city)
                : null;
              if (mismatch) {
                rationale =
                  `Land at **${pickup}**, then get to **${dropoff}**. ` +
                  `(Note: that's a long distance — see the heads-up above.)`;
              }

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
                text: rationale,
                target: norm.id ? { entity: "flight", itemId: norm.id } : null,
              });
              await tools.recordRun(dedupKey, { tripId, flightId });
              effects.push({ tripId, type: "ride", flightId });
              tripEffects++;
            }
          }
        }

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
                tripId,
                type: "heads_up",
                source: "agent:trip_monitor",
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
                tripId,
                type: "heads_up",
                source: "agent:trip_monitor",
              });
              await tools.recordRun(dedupKey, { tripId });
              effects.push({ tripId, type: "no_hotel" });
              tripEffects++;
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
