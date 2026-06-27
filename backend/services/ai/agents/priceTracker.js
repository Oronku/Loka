/**
 * Flight Price Tracker agent.
 *
 * Re-prices each flight on active trips (~once/day per flight), stores history,
 * and notifies the user when a meaningful price drop is detected.
 */

import {
  priceFlight,
  getPriceState,
  recommendForYourFlight,
  getLatestCheckedAt,
  resolveFlightId,
} from "../../flightPriceTracker.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MEANINGFUL_DROP_PCT = 5;

function tripIdOf(trip) {
  return trip.id || trip._id?.toString() || null;
}

function formatRoute(flight) {
  const from = flight.departureAirportCode || "?";
  const to = flight.arrivalAirportCode || "?";
  return `${from} → ${to}`;
}

async function wasCheckedRecently(tripId, flightId, now) {
  const latest = await getLatestCheckedAt(tripId, flightId);
  if (!latest) return false;
  return now.getTime() - new Date(latest).getTime() < ONE_DAY_MS;
}

export default {
  name: "price_tracker",
  label: "Price tracker",

  async run(ctx) {
    const { trips, tools, now } = ctx;
    const effects = [];

    for (const trip of trips) {
      const tripId = tripIdOf(trip);
      if (!tripId) continue;

      const flights = trip.flights || [];

      for (let sourceIndex = 0; sourceIndex < flights.length; sourceIndex++) {
        const flight = flights[sourceIndex];
        const flightId = resolveFlightId(flight, sourceIndex);
        if (!flightId) continue;

        try {
          if (await wasCheckedRecently(tripId, flightId, now)) continue;

          const before = await getPriceState(tripId, flightId);
          const snapshot = await priceFlight(trip, flight, flightId);
          if (!snapshot) continue;

          const state = await getPriceState(tripId, flightId);
          const rec =
            state.yourFlight?.current != null
              ? recommendForYourFlight(
                  state.yourFlight,
                  flight.departureDateTime,
                  now,
                )
              : null;

          effects.push({
            tripId,
            flightId,
            price: state.matchedFlightPrice,
            recommendation: rec?.action ?? null,
          });

          if (!state.yourFlight?.current) continue;

          const dropPct =
            state.yourFlight.changePct != null &&
            state.yourFlight.changePct <= -MEANINGFUL_DROP_PCT;
          const meaningfulDrop =
            state.yourFlight.trend === "down" &&
            state.yourFlight.previous != null &&
            state.yourFlight.current < state.yourFlight.previous &&
            (dropPct ||
              (before.yourFlight?.current != null &&
                state.yourFlight.current < before.yourFlight.current));

          if (!meaningfulDrop || !rec) continue;

          const dedupKey = `price_tracker:drop:${tripId}:${flightId}`;
          if (await tools.hasRecentRun(dedupKey, ONE_DAY_MS)) continue;

          const route = formatRoute(flight);
          const savings = state.yourFlight.previous - state.yourFlight.current;
          const currency = state.yourFlight.currency || state.currency || "";
          const pct =
            state.yourFlight.changePct != null
              ? `${Math.abs(state.yourFlight.changePct)}%`
              : "a bit";

          await tools.emitMessage({
            text:
              `Good news — your flight **${route}** dropped **${pct}** ` +
              `(now **${currency}${state.yourFlight.current}**, saving ~${currency}${savings} vs last check). ` +
              `${rec.action === "buy" ? "Looks like a good time to book." : "Worth watching."}`,
            tripId,
            type: "heads_up",
            source: "agent:price_tracker",
            target: { entity: "flight", itemId: flightId },
          });
          await tools.recordRun(dedupKey, { tripId, flightId });
        } catch (err) {
          console.error(
            `[price_tracker] flight ${flightId} on trip ${tripId} failed:`,
            err.message,
          );
        }
      }
    }

    return effects;
  },
};
