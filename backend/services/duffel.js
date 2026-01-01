import axios from "axios";

class DuffelService {
  constructor() {
    this.apiKey = process.env.DUFFEL_API_KEY;
    this.baseUrl = "https://api.duffel.com";
    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "Duffel-Version": "v2",
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    };
  }

  isConfigured() {
    return !!this.apiKey && this.apiKey !== "GET_FROM_duffel.com";
  }

  /**
   * Search for flights between two airports
   * @param {string} origin - IATA code (e.g., "TLV")
   * @param {string} destination - IATA code (e.g., "LHR")
   * @param {string} departureDate - ISO date (e.g., "2026-01-16")
   * @param {string} returnDate - ISO date for round trip (optional)
   * @param {number} adults - Number of adult passengers (default: 1)
   * @param {string} cabinClass - "economy", "premium_economy", "business", "first" (default: "economy")
   */
  async searchFlights(
    origin,
    destination,
    departureDate,
    returnDate = null,
    adults = 1,
    cabinClass = "economy"
  ) {
    try {
      console.log(
        `✈️ [Duffel] Searching flights: ${origin} → ${destination} on ${departureDate}`
      );

      if (!this.isConfigured()) {
        console.log("⚠️ Duffel API key not configured");
        return [];
      }

      // Build slices (one-way or round-trip)
      const slices = [
        {
          origin,
          destination,
          departure_date: departureDate,
        },
      ];

      // Add return flight if specified
      if (returnDate) {
        slices.push({
          origin: destination,
          destination: origin,
          departure_date: returnDate,
        });
      }

      // Build passengers array
      const passengers = [];
      for (let i = 0; i < adults; i++) {
        passengers.push({ type: "adult" });
      }

      // Create offer request
      const requestBody = {
        data: {
          slices,
          passengers,
          cabin_class: cabinClass,
          max_connections: 2, // Allow up to 2 stops
        },
      };

      console.log("📤 Duffel Request:", JSON.stringify(requestBody, null, 2));

      // Step 1: Create offer request
      const offerRequestResponse = await axios.post(
        `${this.baseUrl}/air/offer_requests`,
        requestBody,
        { headers: this.headers }
      );

      const offerRequestId = offerRequestResponse.data.data.id;
      console.log(`📋 Offer request created: ${offerRequestId}`);

      // Step 2: Get offers (wait a bit for results)
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay

      const offersResponse = await axios.get(
        `${this.baseUrl}/air/offers?offer_request_id=${offerRequestId}&max_connections=2&sort=total_amount`,
        { headers: this.headers }
      );

      const offers = offersResponse.data.data || [];
      console.log(`✅ Found ${offers.length} flight offers`);

      if (offers.length === 0) {
        console.log("⚠️ No flights found");
        return [];
      }

      // Transform to our format
      const flights = offers.slice(0, 10).map((offer) => {
        const outboundSlice = offer.slices[0];
        const firstSegment = outboundSlice.segments[0];
        const lastSegment =
          outboundSlice.segments[outboundSlice.segments.length - 1];

        // Calculate stops
        const stops = outboundSlice.segments.length - 1;

        // Format duration (ISO 8601 duration to human readable)
        const duration = this.formatDuration(outboundSlice.duration);

        // Get airline name
        const airline = firstSegment.operating_carrier.name;

        // Get price
        const price = parseFloat(offer.total_amount);
        const currency = offer.total_currency;

        return {
          id: offer.id,
          airline,
          origin: firstSegment.origin.iata_code,
          destination: lastSegment.destination.iata_code,
          departureTime: firstSegment.departing_at,
          arrivalTime: lastSegment.arriving_at,
          duration,
          stops,
          price: Math.round(price),
          currency,
          cabinClass: offer.cabin_class,
          // Duffel offers can be booked directly
          bookingLink: `https://www.duffel.com/book/${offer.id}`,
          // Additional info
          segments: outboundSlice.segments.map((seg) => ({
            origin: seg.origin.iata_code,
            destination: seg.destination.iata_code,
            airline: seg.operating_carrier.name,
            flightNumber: seg.operating_carrier_flight_number,
            departureTime: seg.departing_at,
            arrivalTime: seg.arriving_at,
          })),
          // For round trips, include return flight info
          returnFlight: offer.slices[1]
            ? {
                departureTime: offer.slices[1].segments[0].departing_at,
                arrivalTime:
                  offer.slices[1].segments[offer.slices[1].segments.length - 1]
                    .arriving_at,
                duration: this.formatDuration(offer.slices[1].duration),
                stops: offer.slices[1].segments.length - 1,
              }
            : null,
          affiliate: false, // Duffel is direct booking, not affiliate
          source: "Duffel",
        };
      });

      return flights;
    } catch (error) {
      console.error(
        "❌ Duffel API Error:",
        error.response?.data || error.message
      );
      if (error.response?.data?.errors) {
        console.error(
          "Errors:",
          JSON.stringify(error.response.data.errors, null, 2)
        );
      }
      return [];
    }
  }
  /**
   * Advanced Duffel flight search supporting v2 API
   * @param {object} options - All Duffel parameters (see API docs)
   */
  async searchFlights(options) {
    try {
      if (!this.isConfigured()) {
        console.log("⚠️ Duffel API key not configured");
        return [];
      }

      // Build request body as in Duffel v2
      const requestBody = { data: { ...options } };
      console.log(
        "📤 Duffel v2 Request:",
        JSON.stringify(requestBody, null, 2)
      );

      // POST to offer_requests
      const response = await axios.post(
        `${this.baseUrl}/air/offer_requests?return_offers=false&supplier_timeout=10000`,
        requestBody,
        { headers: this.headers }
      );

      // Return full Duffel response (user can handle offers, errors, etc)
      return response.data;
    } catch (error) {
      console.error(
        "❌ Duffel API Error:",
        error.response?.data || error.message
      );
      if (error.response?.data?.errors) {
        console.error(
          "Errors:",
          JSON.stringify(error.response.data.errors, null, 2)
        );
      }
      return { error: error.response?.data || error.message };
    }
  }

  /**
   * Format ISO 8601 duration to human readable
   * Example: "PT4H30M" → "4h 30m"
   */
  formatDuration(isoDuration) {
    if (!isoDuration) return "";

    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return isoDuration;

    const hours = match[1] ? `${match[1]}h` : "";
    const minutes = match[2] ? `${match[2]}m` : "";

    return `${hours} ${minutes}`.trim();
  }

  /**
   * Get airport suggestions for autocomplete
   * @param {string} query - Search query (city or airport name)
   */
  async searchAirports(query) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/places/suggestions?query=${encodeURIComponent(query)}`,
        { headers: this.headers }
      );

      const places = response.data.data || [];

      return places
        .filter((place) => place.type === "airport")
        .map((place) => ({
          iataCode: place.iata_code,
          name: place.name,
          city: place.city_name,
          country: place.country_name,
        }));
    } catch (error) {
      console.error(
        "❌ Duffel Airport Search Error:",
        error.response?.data || error.message
      );
      return [];
    }
  }
}

export default new DuffelService();
