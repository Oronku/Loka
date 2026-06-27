import axios from "axios";
import {
  matchesAirlineFlightNumber,
  normalizeFlightNumber,
} from "./flightNumberUtils.js";

/**
 * Travelpayouts API Service
 * Provides hotel and flight search with real prices + affiliate commissions
 *
 * APIs Used:
 * - Hotellook API (hotels)
 * - Aviasales API (flights)
 * - Data API (prices, destinations)
 */

class TravelpayoutsService {
  constructor() {
    this.token = process.env.TRAVELPAYOUTS_TOKEN;
    this.marker = process.env.TRAVELPAYOUTS_MARKER || "meetloca";

    // API endpoints
    this.hotellookBase = "https://engine.hotellook.com/api/v2";
    this.aviasalesBase = "https://api.travelpayouts.com/aviasales/v3";
    this.dataBase = "https://api.travelpayouts.com/data/en/v2";
  }

  /**
   * Search hotels in a city with real prices
   * @param {string} cityName - City name (e.g., "Dubai", "Paris")
   * @param {string} checkIn - Check-in date (YYYY-MM-DD)
   * @param {string} checkOut - Check-out date (YYYY-MM-DD)
   * @param {number} adults - Number of adults (default: 2)
   * @returns {Promise} Hotel search results with prices
   */
  async searchHotels(cityName, checkIn, checkOut, adults = 2) {
    try {
      if (!this.token) {
        throw new Error("Travelpayouts token not configured");
      }

      console.log(
        `🏨 Searching hotels in ${cityName} (${checkIn} to ${checkOut})`
      );

      // Step 1: Get city info from autocomplete
      const cityInfo = await this.getCityInfo(cityName);
      if (!cityInfo) {
        throw new Error(`City not found: ${cityName}`);
      }

      console.log(
        `✅ Found ${cityInfo.hotelsCount} hotels in ${cityInfo.city}`
      );

      // Since we don't have access to cache API, return affiliate search links
      // Users will see real prices on Booking.com with our tracking
      return [
        {
          id: "booking-affiliate",
          name: `Compare ${cityInfo.hotelsCount}+ Hotels`,
          description: `View real-time prices and availability in ${cityInfo.city}`,
          stars: 5,
          price: 0, // Will be handled by frontend to show "View Prices" button
          currency: "USD",
          rating: null,
          bookingLink: this.generateCityHotelSearchLink(
            cityInfo.city,
            checkIn,
            checkOut,
            adults
          ),
          affiliate: true,
          isSearchLink: true,
        },
      ];
    } catch (error) {
      console.error("Travelpayouts Hotel Search Error:", error.message);
      throw error;
    }
  }

  /**
   * Search flights between cities with real prices
   * @param {string} origin - Origin city/airport code (e.g., "TLV", "LON")
   * @param {string} destination - Destination city name or airport code
   * @param {string} departDate - Departure date (YYYY-MM-DD)
   * @param {string} returnDate - Return date (optional, YYYY-MM-DD)
   * @returns {Promise} Flight search results with prices
   */
  async searchFlights(origin, destination, departDate, returnDate = null) {
    try {
      if (!this.token) {
        throw new Error("Travelpayouts token not configured");
      }

      // If destination is a city name (not IATA code), get IATA from city info
      let destCode = destination;
      if (destination && destination.length > 3) {
        const cityInfo = await this.getCityInfo(destination);
        if (cityInfo && cityInfo.iata && cityInfo.iata.length > 0) {
          destCode = cityInfo.iata[0]; // Use first IATA code
          console.log(
            `🔄 Converted city ${destination} to airport code ${destCode}`
          );
        }
      }

      console.log(
        `✈️ Searching flights ${origin} → ${destCode} (${departDate})`
      );

      const params = {
        origin: origin,
        destination: destCode, // Use converted IATA code
        depart_date: departDate,
        currency: "USD",
        token: this.token,
      };

      if (returnDate) {
        params.return_date = returnDate;
      }

      const response = await axios.get(
        `${this.aviasalesBase}/prices_for_dates`,
        {
          params: params,
        }
      );

      const flights = response.data?.data || [];

      return flights.slice(0, 10).map((flight) => ({
        price: flight.value,
        currency: "USD",
        airline: flight.airline,
        flightNumber: flight.flight_number,
        departure: {
          airport: flight.origin,
          date: flight.depart_date,
          time: flight.departure_at,
        },
        arrival: {
          airport: flight.destination,
          date: flight.return_date || flight.depart_date,
          time: flight.return_at,
        },
        duration: flight.duration,
        stops: flight.number_of_changes || 0,
        bookingLink: this.generateFlightBookingLink(
          origin,
          destCode, // Use converted IATA code
          departDate,
          returnDate
        ),
        affiliate: true,
      }));
    } catch (error) {
      console.error("Travelpayouts Flight Search Error:", error.message);
      throw error;
    }
  }

  /** Fetch route fares for a date (raw Aviasales rows). */
  async fetchRouteFares(origin, destination, departDate, limit = 30) {
    if (!this.token) return [];

    const params = {
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      depart_date: departDate,
      currency: "USD",
      sorting: "price",
      direct: "false",
      one_way: "true",
      limit,
      token: this.token,
    };

    const response = await axios.get(`${this.aviasalesBase}/prices_for_dates`, {
      params,
    });

    return response.data?.data || [];
  }

  mapAviasalesRow(flight, origin, destination) {
    const airline = flight.airline || "";
    const flightNum = flight.flight_number ?? "";
    const fullNumber = normalizeFlightNumber(`${airline}${flightNum}`);
    const price = flight.price ?? flight.value ?? 0;
    return {
      price,
      currency: flight.currency || "USD",
      airline,
      flightNumber: fullNumber || null,
      airlineIata: airline,
      flightNum: String(flightNum),
      departureTime: flight.departure_at || null,
      arrivalTime: flight.return_at || null,
      stops: flight.transfers ?? flight.number_of_changes ?? 0,
      bookingLink: this.generateFlightBookingLink(origin, destination, flight.departure_at?.slice?.(0, 10) || ""),
    };
  }

  buildRoutePricing(rows, origin, destination, flightNumber) {
    const mapped = rows
      .filter((row) => (row.price ?? row.value ?? 0) > 0)
      .map((row) => this.mapAviasalesRow(row, origin, destination));
    if (!mapped.length) return null;

    mapped.sort((a, b) => a.price - b.price);
    const routeLowest = mapped[0];
    const alternatives = mapped.slice(0, 5).map((f, i) => ({
      offerId: `aviasales-${i}-${f.flightNumber || "unknown"}`,
      airline: f.airline,
      flightNumber: f.flightNumber,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      stops: f.stops,
      price: f.price,
      currency: f.currency,
    }));

    let matched = null;
    if (flightNumber) {
      matched =
        mapped.find((f) =>
          matchesAirlineFlightNumber(flightNumber, f.airlineIata, f.flightNum),
        ) ||
        mapped.find((f) => f.flightNumber === normalizeFlightNumber(flightNumber)) ||
        null;
    }

    const hasCheaperOptions =
      (matched == null && alternatives.length > 0) ||
      (matched != null && matched.price > routeLowest.price);

    return {
      priceScope: "route",
      price: routeLowest.price,
      currency: routeLowest.currency,
      offerId: null,
      routeLowest: routeLowest.price,
      matchedFlightPrice: matched?.price ?? null,
      matchedFlightFound: matched != null,
      hasCheaperOptions,
      cheaperBy:
        hasCheaperOptions && matched ? matched.price - routeLowest.price : null,
      alternatives,
      routeSource: "travelpayouts",
      matchedFlightSource: matched ? "travelpayouts" : null,
      routeBookable: false,
      matchedFlightBookable: false,
    };
  }

  /** Route + optional matched-flight pricing from Aviasales / Travelpayouts. */
  async getRoutePricing(origin, destination, departDate, flightContext = {}) {
    if (!this.isConfigured()) return null;
    try {
      const rows = await this.fetchRouteFares(origin, destination, departDate);
      return this.buildRoutePricing(
        rows,
        origin,
        destination,
        flightContext.flightNumber,
      );
    } catch (error) {
      console.error("[Travelpayouts] getRoutePricing:", error.message);
      return null;
    }
  }

  /** Matched-flight price only — used when Duffel has route data but no match. */
  async getMatchedFlightPrice(origin, destination, departDate, flightNumber) {
    if (!this.isConfigured() || !flightNumber) return null;
    try {
      const rows = await this.fetchRouteFares(origin, destination, departDate);
      const mapped = rows
        .filter((row) => (row.price ?? row.value ?? 0) > 0)
        .map((row) => this.mapAviasalesRow(row, origin, destination));
      const matched =
        mapped.find((f) =>
          matchesAirlineFlightNumber(flightNumber, f.airlineIata, f.flightNum),
        ) ||
        mapped.find((f) => f.flightNumber === normalizeFlightNumber(flightNumber)) ||
        null;
      if (!matched) return null;
      return {
        price: matched.price,
        currency: matched.currency,
        source: "travelpayouts",
      };
    } catch (error) {
      console.error("[Travelpayouts] getMatchedFlightPrice:", error.message);
      return null;
    }
  }

  /**
   * Get cheapest flight prices for a route (for AI to estimate)
   * @param {string} origin - Origin airport code
   * @param {string} destination - Destination airport code
   * @returns {Promise} Cheapest prices
   */
  async getCheapestFlights(origin, destination) {
    try {
      const response = await axios.get(`${this.dataBase}/prices/month-matrix`, {
        params: {
          origin: origin,
          destination: destination,
          currency: "USD",
          token: this.token,
        },
      });

      const prices = response.data?.data || [];
      if (prices.length === 0) return null;

      // Get cheapest price
      const cheapest = prices.reduce((min, p) =>
        p.value < min.value ? p : min
      );

      return {
        price: cheapest.value,
        departDate: cheapest.depart_date,
        returnDate: cheapest.return_date,
      };
    } catch (error) {
      console.error("Cheapest Flight Error:", error.message);
      return null;
    }
  }

  /**
   * Get city ID from city name
   */
  async getCityId(cityName) {
    try {
      console.log(`🔍 Looking up city ID for: ${cityName}`);

      // Use the autocomplete API instead of lookup
      const response = await axios.get(
        `https://yasen.hotellook.com/autocomplete`,
        {
          params: {
            term: cityName,
            lang: "en",
            limit: 1,
          },
        }
      );

      const cities = response.data?.cities || [];
      if (cities.length === 0) {
        console.log(`❌ No city found for: ${cityName}`);
        return null;
      }

      const city = cities[0];
      console.log(
        `✅ Found city: ${city.city} (ID: ${city.id}) in ${city.country}`
      );

      return city.id;
    } catch (error) {
      console.error("City ID Error:", error.message);
      return null;
    }
  }

  /**
   * Get city info including ID and hotel count
   */
  async getCityInfo(cityName) {
    try {
      console.log(`🔍 Looking up city info for: ${cityName}`);

      const response = await axios.get(
        `https://yasen.hotellook.com/autocomplete`,
        {
          params: {
            term: cityName,
            lang: "en",
            limit: 1,
          },
        }
      );

      const cities = response.data?.cities || [];
      if (cities.length === 0) {
        console.log(`❌ No city found for: ${cityName}`);
        return null;
      }

      return cities[0];
    } catch (error) {
      console.error("City Info Error:", error.message);
      return null;
    }
  }

  /**
   * Generate affiliate search link for hotels in a city
   */
  generateCityHotelSearchLink(cityName, checkIn, checkOut, adults = 2) {
    // Use Booking.com with affiliate tracking
    const params = new URLSearchParams({
      ss: cityName,
      checkin: checkIn,
      checkout: checkOut,
      group_adults: adults,
      aid: "2371057", // Travelpayouts Booking.com affiliate ID
      label: this.marker,
    });

    return `https://www.booking.com/searchresults.html?${params.toString()}`;
  }

  /**
   * Generate affiliate booking link for hotels
   */
  generateHotelBookingLink(hotelId, cityId, checkIn, checkOut) {
    return (
      `https://search.hotellook.com/?` +
      `hotelId=${hotelId}&` +
      `checkIn=${checkIn}&` +
      `checkOut=${checkOut}&` +
      `marker=${this.marker}`
    );
  }

  /**
   * Generate affiliate booking link for flights
   */
  generateFlightBookingLink(origin, destination, departDate, returnDate) {
    let link =
      `https://www.aviasales.com/search/` +
      `${origin}${departDate}` +
      `${destination}`;

    if (returnDate) {
      link += returnDate;
    }

    link += `?marker=${this.marker}`;
    return link;
  }

  /**
   * Calculate days difference
   */
  getDaysDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return !!this.token && this.token !== "your_token_here";
  }
}

export default new TravelpayoutsService();
