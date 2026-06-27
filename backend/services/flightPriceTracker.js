import { getDb } from "../config/database.js";
import { fetchFlightPricing } from "./flightPricing.js";

const COLLECTION = "flight_price_history";

/** Stable id for price history — uses stored id or timeline index fallback. */
export function resolveFlightId(flight, sourceIndex) {
  if (flight?.id) return flight.id;
  if (typeof sourceIndex === "number" && sourceIndex >= 0) {
    return `flight-${sourceIndex}`;
  }
  return null;
}

/** Find a trip flight by stored id or `flight-{index}` fallback. */
export function findFlightById(trip, flightId) {
  const flights = trip.flights || [];
  const byId = flights.find((f) => f.id === flightId);
  if (byId) {
    return { flight: byId, flightId: byId.id || flightId };
  }

  const match = /^flight-(\d+)$/.exec(String(flightId));
  if (match) {
    const idx = Number(match[1]);
    const flight = flights[idx];
    if (flight) {
      return { flight, flightId: flight.id || flightId };
    }
  }

  return { flight: null, flightId: null };
}

function emptyState() {
  return {
    current: null,
    previous: null,
    lowest: null,
    highest: null,
    average: null,
    currency: null,
    trend: "flat",
    changeAmount: null,
    changePct: null,
    carryOnBags: null,
    checkedBags: null,
    priceScope: "route",
    routeLowest: null,
    matchedFlightPrice: null,
    matchedFlightFound: false,
    matchedFlightSource: null,
    routeSource: null,
    matchedFlightBookable: false,
    routeBookable: false,
    hasCheaperOptions: false,
    cheaperBy: null,
    alternatives: [],
    yourFlight: null,
    lastCheckedAt: null,
    history: [],
  };
}

function daysUntilDeparture(departureDateTime, now = new Date()) {
  if (!departureDateTime) return Infinity;
  const dep = String(departureDateTime).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dep)) return Infinity;
  const depMs = new Date(`${dep}T12:00:00`).getTime();
  const todayMs = new Date(`${now.toISOString().slice(0, 10)}T12:00:00`).getTime();
  return Math.round((depMs - todayMs) / (24 * 60 * 60 * 1000));
}

function isValidIata(code) {
  return typeof code === "string" && /^[A-Za-z]{3}$/.test(code.trim());
}

/**
 * Re-price a stored flight via Duffel and append a history snapshot.
 * Skips flights missing IATA codes or departure date.
 */
export async function priceFlight(trip, flight, flightId) {
  const origin = flight.departureAirportCode?.trim?.()?.toUpperCase?.() || flight.departureAirportCode;
  const destination = flight.arrivalAirportCode?.trim?.()?.toUpperCase?.() || flight.arrivalAirportCode;
  const departureDateTime = flight.departureDateTime;
  const resolvedFlightId = flightId || flight.id;

  if (
    !isValidIata(origin) ||
    !isValidIata(destination) ||
    !departureDateTime ||
    !resolvedFlightId
  ) {
    return null;
  }

  const departureDate = String(departureDateTime).slice(0, 10);
  const carryOnBags =
    typeof flight.carryOnBags === "number" && flight.carryOnBags >= 0
      ? flight.carryOnBags
      : 1;
  const checkedBags =
    typeof flight.checkedBags === "number" && flight.checkedBags >= 0
      ? flight.checkedBags
      : 0;

  const pricing = await fetchFlightPricing(
    origin,
    destination,
    departureDate,
    { carryOnBags, checkedBags },
    { flightNumber: flight.flightNumber },
  );
  if (!pricing) return null;

  const db = getDb();
  if (!db) return null;

  const tripId = trip.id || trip._id?.toString();
  const doc = {
    tripId,
    flightId: resolvedFlightId,
    userId: trip.userId,
    route: { origin, destination, departureDate },
    carryOnBags,
    checkedBags,
    // Only the matched flight fare is tracked over time; route low is snapshot-only.
    price: pricing.matchedFlightPrice ?? null,
    currency: pricing.currency,
    offerId: pricing.offerId,
    priceScope: pricing.priceScope,
    routeLowest: pricing.routeLowest,
    matchedFlightPrice: pricing.matchedFlightPrice,
    matchedFlightFound: pricing.matchedFlightFound,
    matchedFlightSource: pricing.matchedFlightSource ?? null,
    routeSource: pricing.routeSource ?? null,
    matchedFlightBookable: pricing.matchedFlightBookable ?? false,
    routeBookable: pricing.routeBookable ?? false,
    hasCheaperOptions: pricing.hasCheaperOptions,
    cheaperBy: pricing.cheaperBy,
    alternatives: pricing.alternatives,
    checkedAt: new Date(),
  };

  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

/** Build trend stats from a newest-first list of prices. */
function buildTrendState(values) {
  if (!values.length) return null;
  const current = values[0];
  const previous = values.length > 1 ? values[1] : null;
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const average = Math.round(values.reduce((sum, p) => sum + p, 0) / values.length);

  let trend = "flat";
  let changeAmount = null;
  let changePct = null;

  if (previous != null) {
    changeAmount = current - previous;
    changePct =
      previous !== 0 ? Math.round((changeAmount / previous) * 1000) / 10 : null;
    if (changeAmount > 0) trend = "up";
    else if (changeAmount < 0) trend = "down";
  }

  return {
    current,
    previous,
    lowest,
    highest,
    average,
    trend,
    changeAmount,
    changePct,
  };
}

function getTrackedHistory(history) {
  return history.filter((h) => h.matchedFlightPrice != null);
}

function getYourFlightState(history) {
  const tracked = getTrackedHistory(history);
  if (!tracked.length) return null;
  const stats = buildTrendState(tracked.map((h) => h.matchedFlightPrice));
  return stats ? { ...stats, currency: tracked[0].currency } : null;
}

/** Load price history and compute trend stats for a flight. */
export async function getPriceState(tripId, flightId) {
  const db = getDb();
  if (!db) return emptyState();

  const history = await db
    .collection(COLLECTION)
    .find({ tripId, flightId })
    .sort({ checkedAt: -1 })
    .toArray();

  if (history.length === 0) return emptyState();

  const latest = history[0];
  const tracked = getTrackedHistory(history);
  const yourFlight = getYourFlightState(history);
  const currency = latest.currency;

  return {
    current: latest.matchedFlightPrice ?? null,
    previous: yourFlight?.previous ?? null,
    lowest: yourFlight?.lowest ?? null,
    highest: yourFlight?.highest ?? null,
    average: yourFlight?.average ?? null,
    currency,
    trend: yourFlight?.trend ?? "flat",
    changeAmount: yourFlight?.changeAmount ?? null,
    changePct: yourFlight?.changePct ?? null,
    carryOnBags: latest.carryOnBags ?? null,
    checkedBags: latest.checkedBags ?? null,
    priceScope: latest.priceScope ?? "route",
    routeLowest: latest.routeLowest ?? null,
    matchedFlightPrice: latest.matchedFlightPrice ?? null,
    matchedFlightFound: latest.matchedFlightFound ?? false,
    matchedFlightSource: latest.matchedFlightSource ?? null,
    routeSource: latest.routeSource ?? null,
    matchedFlightBookable: latest.matchedFlightBookable ?? false,
    routeBookable: latest.routeBookable ?? false,
    hasCheaperOptions: latest.hasCheaperOptions ?? false,
    cheaperBy: latest.cheaperBy ?? null,
    alternatives: latest.alternatives ?? [],
    yourFlight,
    lastCheckedAt: latest.checkedAt,
    history: tracked.map((h) => ({
      price: h.matchedFlightPrice,
      checkedAt: h.checkedAt,
    })),
  };
}

/**
 * Heuristic buy / wait / watch recommendation from route price state and departure.
 */
export function recommend(state, departureDateTime, now = new Date()) {
  const { current, lowest, trend } = state;

  if (current == null) {
    return { action: "watch", reason: "No price data yet — check back after the first scan." };
  }

  const days = daysUntilDeparture(departureDateTime, now);

  if (days < 14) {
    return {
      action: "buy",
      reason: "Your departure is within two weeks — prices rarely drop much closer to the date.",
    };
  }

  if (lowest != null && current <= lowest * 1.05) {
    return {
      action: "buy",
      reason: "The lowest fare on this route is at or near the historical low we've tracked.",
    };
  }

  if (trend === "down" && days > 30) {
    return {
      action: "wait",
      reason: "Route prices are trending down and your trip is still more than a month away.",
    };
  }

  return {
    action: "watch",
    reason: "No strong signal yet — we'll keep tracking prices on this route.",
  };
}

/**
 * Buy / wait / watch recommendation for the user's specific matched flight.
 */
export function recommendForYourFlight(yourFlight, departureDateTime, now = new Date()) {
  const { current, lowest, trend } = yourFlight;

  if (current == null) {
    return null;
  }

  const days = daysUntilDeparture(departureDateTime, now);

  if (days < 14) {
    return {
      action: "buy",
      reason: "Your departure is within two weeks — this flight rarely gets cheaper closer to the date.",
    };
  }

  if (lowest != null && current <= lowest * 1.05) {
    return {
      action: "buy",
      reason: "This flight is at or near the lowest price we've tracked for it.",
    };
  }

  if (trend === "down" && days > 30) {
    return {
      action: "wait",
      reason: "This flight's price is trending down and your trip is still more than a month away.",
    };
  }

  return {
    action: "watch",
    reason: "No strong signal yet — we'll keep tracking this flight's price.",
  };
}

/** Latest checkedAt for throttle checks (agent). */
export async function getLatestCheckedAt(tripId, flightId) {
  const db = getDb();
  if (!db) return null;
  const doc = await db
    .collection(COLLECTION)
    .findOne({ tripId, flightId }, { sort: { checkedAt: -1 } });
  return doc?.checkedAt ?? null;
}

export async function buildPriceResponse(tripId, flightId, departureDateTime) {
  const state = await getPriceState(tripId, flightId);
  const recommendation =
    state.matchedFlightFound && state.yourFlight?.current != null
      ? recommendForYourFlight(state.yourFlight, departureDateTime)
      : null;
  return { ...state, recommendation };
}
