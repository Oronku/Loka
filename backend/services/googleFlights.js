/**
 * Google Flights API via RapidAPI
 * Search for flight prices using Google Flights data
 *
 * Subscribe at: https://rapidapi.com/DataCrawler/api/google-flights2
 * Pricing: Free tier available, then ~$10/month for more searches
 */

import axios from "axios";

class GoogleFlightsService {
  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY;
    this.baseUrl = "https://google-flights2.p.rapidapi.com/api/v1";
    this.headers = {
      "X-RapidAPI-Key": this.apiKey,
      "X-RapidAPI-Host": "google-flights2.p.rapidapi.com",
    };
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Convert airport IATA code to Google Flights ID
   * Google Flights uses location IDs like "airport.TLV" or "city.LON"
   */
  getLocationId(iataCode) {
    // For most airports, prefix with "airport."
    return `airport.${iataCode}`;
  }

  /**
   * Search for flights between two airports
   * @param {string} origin - Origin IATA code (e.g., "TLV")
   * @param {string} destination - Destination IATA code (e.g., "LHR")
   * @param {string} departureDate - Departure date (YYYY-MM-DD)
   * @param {string} returnDate - Optional return date for round trip
   * @param {number} adults - Number of adults (default: 1)
   * @param {string} travelClass - ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
   * @returns {Promise<Array>} Array of flight options with prices
   */
  async searchFlights(
    origin,
    destination,
    departureDate,
    returnDate = null,
    adults = 1,
    travelClass = "ECONOMY"
  ) {
    if (!this.isConfigured()) {
      throw new Error("Google Flights API key not configured");
    }

    try {
      console.log(
        `✈️ [Google Flights] Searching: ${origin} → ${destination} on ${departureDate}`
      );

      const params = {
        departure_id: origin,
        arrival_id: destination,
        outbound_date: departureDate,
        adults: adults,
        currency: "USD",
        language_code: "en-US",
        travel_class: travelClass,
      };

      // Add return date for round trip
      if (returnDate) {
        params.return_date = returnDate;
      }

      const response = await axios.get(`${this.baseUrl}/searchFlights`, {
        params,
        headers: this.headers,
        timeout: 15000,
      });

      if (!response.data || !response.data.data) {
        console.error("❌ Invalid response from Google Flights API");
        return [];
      }

      const flights = this.parseFlights(
        response.data.data,
        origin,
        destination
      );
      console.log(`✅ Found ${flights.length} flights from Google Flights`);

      return flights;
    } catch (error) {
      if (error.response?.status === 403) {
        console.error(
          "❌ Google Flights API: Not subscribed. Subscribe at: https://rapidapi.com/DataCrawler/api/google-flights2"
        );
        throw new Error("Please subscribe to Google Flights API on RapidAPI");
      }
      console.error("Google Flights API Error:", error.message);
      throw error;
    }
  }

  /**
   * Parse Google Flights response into our format
   */
  parseFlights(data, origin, destination) {
    const flights = [];

    // Google Flights returns "best_flights" and "other_flights"
    const allFlights = [
      ...(data.best_flights || []),
      ...(data.other_flights || []).slice(0, 5), // Limit other flights
    ];

    for (const flight of allFlights) {
      try {
        // Each flight can have multiple segments (with layovers)
        const segments = flight.flights || [];
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];

        if (!firstSegment || !lastSegment) continue;

        // Calculate total stops
        const stops = segments.length - 1;

        // Get airlines (might be multiple for connecting flights)
        const airlines = [...new Set(segments.map((s) => s.airline))].join(
          ", "
        );

        // Parse price
        const price = flight.price ? parseInt(flight.price) : 0;

        // Parse duration (format: "10h 45m" or "645")
        let durationMinutes = 0;
        if (flight.total_duration) {
          if (typeof flight.total_duration === "number") {
            durationMinutes = flight.total_duration;
          } else {
            // Parse "10h 45m" format
            const hours = flight.total_duration.match(/(\d+)h/);
            const minutes = flight.total_duration.match(/(\d+)m/);
            durationMinutes =
              (hours ? parseInt(hours[1]) * 60 : 0) +
              (minutes ? parseInt(minutes[1]) : 0);
          }
        }

        flights.push({
          airline: airlines,
          origin: origin,
          destination: destination,
          departureTime: firstSegment.departure_airport?.time || null,
          arrivalTime: lastSegment.arrival_airport?.time || null,
          price: price,
          currency: "USD",
          stops: stops,
          duration: flight.total_duration,
          durationMinutes: durationMinutes,
          flightNumbers: segments
            .map((s) => s.flight_number)
            .filter(Boolean)
            .join(", "),
          aircraft: segments
            .map((s) => s.airplane)
            .filter(Boolean)
            .join(", "),
          // Google Flights deep link (affiliate-ready)
          bookingLink:
            flight.booking_link ||
            `https://www.google.com/travel/flights?hl=en&q=Flights%20from%20${origin}%20to%20${destination}`,
          carbonEmissions: flight.carbon_emissions?.this_flight || 0,
          affiliate: true,
          provider: "Google Flights",
        });
      } catch (err) {
        console.error("Error parsing flight:", err.message);
      }
    }

    return flights;
  }

  /**
   * Get airport autocomplete suggestions
   * Useful for search forms
   */
  async searchAirports(query) {
    if (!this.isConfigured()) {
      throw new Error("Google Flights API key not configured");
    }

    try {
      const response = await axios.get(`${this.baseUrl}/searchAirport`, {
        params: {
          query: query,
          language_code: "en-US",
        },
        headers: this.headers,
        timeout: 10000,
      });

      return response.data?.data || [];
    } catch (error) {
      console.error("Airport search error:", error.message);
      return [];
    }
  }
}

export default new GoogleFlightsService();
