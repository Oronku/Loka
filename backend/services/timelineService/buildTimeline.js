export function toTime(value) {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** Best-effort location string usable by Google APIs: "lat,lng" or an address. */
export function extractLocation(raw) {
  if (!raw || typeof raw !== "object") return null;

  const coords =
    raw.coordinates || raw.location?.coordinates || raw.geometry?.location;
  if (coords && coords.lat != null && coords.lng != null) {
    return `${coords.lat},${coords.lng}`;
  }

  if (typeof raw.location === "string" && raw.location.trim()) {
    return raw.location.trim();
  }
  if (typeof raw.address === "string" && raw.address.trim()) {
    return raw.address.trim();
  }
  if (
    typeof raw.formatted_address === "string" &&
    raw.formatted_address.trim()
  ) {
    return raw.formatted_address.trim();
  }
  return null;
}

/**
 * Turn an airport value into a geocodable query. A bare IATA code like "CDG"
 * becomes "CDG airport"; anything else (a full name/address) is used as-is.
 */
export function airportQuery(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    return `${trimmed.toUpperCase()} airport`;
  }
  return trimmed;
}

function pushEvent(target, event) {
  if (Number.isNaN(event.sortKey)) {
    target.unscheduled.push({ ...event, sortKey: null });
  } else {
    target.events.push(event);
  }
}

/**
 * Merge a trip's sub-resources into a single sorted event list.
 * @param {object} trip
 * @returns {{ events: object[], unscheduled: object[] }}
 */
export function buildTimeline(trip) {
  const result = { events: [], unscheduled: [] };
  if (!trip || typeof trip !== "object") return result;

  (trip.flights || []).forEach((flight, sourceIndex) => {
    const departureAirport = flight.departureAirport || flight.from || null;
    const arrivalAirport = flight.arrivalAirport || flight.to || null;
    const departQuery = airportQuery(departureAirport);
    const arriveQuery = airportQuery(arrivalAirport);
    pushEvent(result, {
      type: "flight",
      sourceIndex,
      title: flight.flightNumber ? `Flight ${flight.flightNumber}` : "Flight",
      subtitle:
        [
          flight.airline,
          departureAirport && arrivalAirport
            ? `${departureAirport} \u2192 ${arrivalAirport}`
            : null,
        ]
          .filter(Boolean)
          .join(" \u00b7 ") || null,
      start: flight.departureDateTime || null,
      end: flight.arrivalDateTime || null,
      arrival: flight.arrivalDateTime || null,
      departureAirport,
      arrivalAirport,
      // You travel TO the departure airport, and continue FROM the arrival airport.
      arriveLocation: departQuery || extractLocation(flight),
      departLocation: arriveQuery || extractLocation(flight),
      location: departQuery || extractLocation(flight),
      sortKey: toTime(flight.departureDateTime),
      raw: flight,
    });
  });

  (trip.hotels || []).forEach((hotel, sourceIndex) => {
    const arrival = hotel.arrivalTime || hotel.checkIn || null;
    pushEvent(result, {
      type: "hotel-checkin",
      sourceIndex,
      title: hotel.name ? `Check in: ${hotel.name}` : "Hotel check-in",
      subtitle: hotel.name || null,
      start: arrival,
      end: arrival,
      arrival,
      checkInTime: hotel.checkIn || null,
      location: extractLocation(hotel) || hotel.name || null,
      sortKey: toTime(arrival),
      raw: hotel,
    });

    pushEvent(result, {
      type: "hotel-checkout",
      sourceIndex,
      title: hotel.name ? `Check out: ${hotel.name}` : "Hotel check-out",
      subtitle: hotel.name || null,
      start: hotel.checkOut || null,
      end: hotel.checkOut || null,
      arrival: hotel.checkOut || null,
      location: extractLocation(hotel) || hotel.name || null,
      sortKey: toTime(hotel.checkOut),
      raw: hotel,
    });
  });

  (trip.rides || []).forEach((ride, sourceIndex) => {
    pushEvent(result, {
      type: "ride",
      sourceIndex,
      title:
        ride.pickup && ride.dropoff
          ? `${ride.pickup} \u2192 ${ride.dropoff}`
          : "Ride",
      subtitle: ride.provider || null,
      start: ride.pickupDateTime || null,
      end: ride.dropoffDateTime || ride.pickupDateTime || null,
      arrival: ride.dropoffDateTime || ride.pickupDateTime || null,
      // For routing, the ride ends at its dropoff location.
      location: ride.dropoff || extractLocation(ride),
      sortKey: toTime(ride.pickupDateTime),
      raw: ride,
    });
  });

  (trip.attractions || []).forEach((attraction, sourceIndex) => {
    const when =
      attraction.scheduledDateTime || attraction.scheduledDate || null;
    pushEvent(result, {
      type: "attraction",
      sourceIndex,
      title: attraction.name || "Attraction",
      subtitle: attraction.category || null,
      start: when,
      end: attraction.endDateTime || when,
      arrival: when,
      location: extractLocation(attraction) || attraction.name || null,
      sortKey: toTime(when),
      raw: attraction,
    });
  });

  result.events.sort((a, b) => a.sortKey - b.sortKey);
  return result;
}
