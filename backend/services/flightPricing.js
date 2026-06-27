import duffel from "./duffel.js";
import googleFlights from "./googleFlights.js";
import travelpayouts from "./travelpayouts.js";

const SOURCE_LABELS = {
  duffel: "Duffel",
  google_flights: "Google Flights",
  travelpayouts: "Aviasales",
};

function recalcCheaperOptions(pricing) {
  const routeLow = pricing.routeLowest ?? pricing.price;
  const matched = pricing.matchedFlightPrice;
  if (matched == null) {
    pricing.hasCheaperOptions = (pricing.alternatives?.length ?? 0) > 0;
    pricing.cheaperBy = null;
  } else if (matched > routeLow) {
    pricing.hasCheaperOptions = true;
    pricing.cheaperBy = matched - routeLow;
  } else {
    pricing.hasCheaperOptions = false;
    pricing.cheaperBy = null;
  }
  return pricing;
}

function annotateDuffel(pricing) {
  return recalcCheaperOptions({
    ...pricing,
    routeSource: "duffel",
    matchedFlightSource: pricing.matchedFlightFound ? "duffel" : null,
    matchedFlightBookable: pricing.matchedFlightFound,
    routeBookable: true,
  });
}

/**
 * Fetch route + matched-flight pricing with Duffel primary and
 * Google Flights / Travelpayouts fallbacks for missing data.
 */
export async function fetchFlightPricing(
  origin,
  destination,
  departureDate,
  baggage = {},
  flightContext = {},
) {
  const { flightNumber } = flightContext;
  let pricing = null;

  if (duffel.isConfigured()) {
    try {
      const duffelResult = await duffel.getRoutePricing(
        origin,
        destination,
        departureDate,
        baggage,
        flightContext,
      );
      if (duffelResult) {
        pricing = annotateDuffel(duffelResult);
      }
    } catch (error) {
      console.error("[pricing] Duffel failed:", error.message);
    }
  }

  if (pricing && flightNumber && !pricing.matchedFlightFound) {
    const fallbackMatch = await tryFallbackMatchedFlight(
      origin,
      destination,
      departureDate,
      flightNumber,
    );
    if (fallbackMatch) {
      pricing.matchedFlightPrice = fallbackMatch.price;
      pricing.matchedFlightFound = true;
      pricing.matchedFlightSource = fallbackMatch.source;
      pricing.matchedFlightBookable = false;
      recalcCheaperOptions(pricing);
    }
  }

  if (!pricing) {
    pricing = await tryFallbackRoutePricing(
      origin,
      destination,
      departureDate,
      flightNumber,
    );
  }

  return pricing;
}

export function getSourceLabel(source) {
  return SOURCE_LABELS[source] || source;
}

async function tryFallbackMatchedFlight(origin, destination, departureDate, flightNumber) {
  if (googleFlights.isConfigured()) {
    try {
      const result = await googleFlights.getMatchedFlightPrice(
        origin,
        destination,
        departureDate,
        flightNumber,
      );
      if (result) return result;
    } catch (error) {
      console.error("[pricing] Google Flights match failed:", error.message);
    }
  }

  if (travelpayouts.isConfigured()) {
    try {
      const result = await travelpayouts.getMatchedFlightPrice(
        origin,
        destination,
        departureDate,
        flightNumber,
      );
      if (result) return result;
    } catch (error) {
      console.error("[pricing] Travelpayouts match failed:", error.message);
    }
  }

  return null;
}

async function tryFallbackRoutePricing(origin, destination, departureDate, flightNumber) {
  if (googleFlights.isConfigured()) {
    try {
      const result = await googleFlights.getRoutePricing(
        origin,
        destination,
        departureDate,
        { flightNumber },
      );
      if (result) return result;
    } catch (error) {
      console.error("[pricing] Google Flights route failed:", error.message);
    }
  }

  if (travelpayouts.isConfigured()) {
    try {
      const result = await travelpayouts.getRoutePricing(
        origin,
        destination,
        departureDate,
        { flightNumber },
      );
      if (result) return result;
    } catch (error) {
      console.error("[pricing] Travelpayouts route failed:", error.message);
    }
  }

  return null;
}
