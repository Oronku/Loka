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

/**
 * Combine a date with a separate time-of-day into one datetime string.
 * Many items store a date ("2026-06-07") and a time ("15:00") separately;
 * timelining needs them merged so the event has a real sort key.
 */
export function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue) return timeValue || null;
  const dateStr = String(dateValue).trim();

  // Already a full datetime — use as-is.
  if (/T\d{1,2}:\d{2}/.test(dateStr) || /\d{1,2}:\d{2}/.test(dateStr.slice(10))) {
    return dateStr;
  }

  if (timeValue && /^\d{1,2}:\d{2}/.test(String(timeValue).trim())) {
    const datePart = dateStr.slice(0, 10);
    const [h, m] = String(timeValue).trim().split(":");
    const hh = h.padStart(2, "0");
    const mm = (m || "00").slice(0, 2).padStart(2, "0");
    return `${datePart}T${hh}:${mm}`;
  }

  return dateStr;
}

function pushEvent(target, event) {
  if (Number.isNaN(event.sortKey)) {
    target.unscheduled.push({ ...event, sortKey: null });
  } else {
    target.events.push(event);
  }
}

/** Collapse events that are effectively identical (e.g. a duplicated booking). */
function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((e) => {
    const sig = [e.type, e.title, e.start, e.end, e.location].join("|");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
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
    // Flights store airports under several possible field names depending on
    // the source (flight search uses departureAirportCode/arrivalAirportCode).
    const departureAirport =
      flight.departureAirportCode ||
      flight.departureAirport ||
      flight.from ||
      null;
    const arrivalAirport =
      flight.arrivalAirportCode || flight.arrivalAirport || flight.to || null;

    // Fall back to the city name when no airport code is present.
    const departQuery =
      airportQuery(departureAirport) ||
      (flight.departureCity ? `${flight.departureCity} airport` : null);
    const arriveQuery =
      airportQuery(arrivalAirport) ||
      (flight.arrivalCity ? `${flight.arrivalCity} airport` : null);

    const departLabel = departureAirport || flight.departureCity || null;
    const arriveLabel = arrivalAirport || flight.arrivalCity || null;

    pushEvent(result, {
      id: flight.id || `flight-${sourceIndex}`,
      type: "flight",
      sourceIndex,
      title: flight.flightNumber ? `Flight ${flight.flightNumber}` : "Flight",
      subtitle:
        [
          flight.airline,
          departLabel && arriveLabel
            ? `${departLabel} \u2192 ${arriveLabel}`
            : null,
        ]
          .filter(Boolean)
          .join(" \u00b7 ") || null,
      start: flight.departureDateTime || null,
      end: flight.arrivalDateTime || null,
      arrival: flight.arrivalDateTime || null,
      departureAirport: departLabel,
      arrivalAirport: arriveLabel,
      // You travel TO the departure airport, and continue FROM the arrival airport.
      arriveLocation: departQuery || extractLocation(flight),
      departLocation: arriveQuery || extractLocation(flight),
      location: arriveQuery || departQuery || extractLocation(flight),
      sortKey: toTime(flight.departureDateTime),
      raw: flight,
    });
  });

  (trip.hotels || []).forEach((hotel, sourceIndex) => {
    if (hotel.isIdea || !hotel.checkIn || !hotel.checkOut) return;
    // checkIn is a date ("2026-06-07"); arrivalTime is a time of day ("15:00").
    // Combine them so the check-in has a real timestamp and is not "unscheduled".
    const checkInTime = hotel.arrivalTime || hotel.checkInTime || null;
    const checkInAt = combineDateAndTime(hotel.checkIn, checkInTime);
    const checkOutAt = combineDateAndTime(
      hotel.checkOut,
      hotel.checkOutTime || hotel.departureTime
    );
    const hotelLocation = extractLocation(hotel) || hotel.name || null;

    pushEvent(result, {
      id: hotel.id || `hotel-${sourceIndex}`,
      type: "hotel-checkin",
      sourceIndex,
      title: hotel.name ? `Check in: ${hotel.name}` : "Hotel check-in",
      subtitle: hotel.name || null,
      start: checkInAt,
      end: checkInAt,
      arrival: checkInAt,
      checkInTime,
      location: hotelLocation,
      sortKey: toTime(checkInAt),
      raw: hotel,
    });

    pushEvent(result, {
      id: hotel.id || `hotel-${sourceIndex}`,
      type: "hotel-checkout",
      sourceIndex,
      title: hotel.name ? `Check out: ${hotel.name}` : "Hotel check-out",
      subtitle: hotel.name || null,
      start: checkOutAt,
      end: checkOutAt,
      arrival: checkOutAt,
      location: hotelLocation,
      sortKey: toTime(checkOutAt),
      raw: hotel,
    });
  });

  (trip.rides || []).forEach((ride, sourceIndex) => {
    pushEvent(result, {
      id: ride.id || `ride-${sourceIndex}`,
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
      id: attraction.id || `attraction-${sourceIndex}`,
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

  result.events = dedupeEvents(result.events);
  result.unscheduled = dedupeEvents(result.unscheduled);
  result.events.sort((a, b) => a.sortKey - b.sortKey);
  return result;
}
