import axios from "axios";

/**
 * RapidAPI Hotels Service (Booking.com)
 * Provides real hotel prices from Booking.com
 */
class RapidApiHotelsService {
  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY;
    this.baseUrl = "https://booking-com15.p.rapidapi.com/api/v1";
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Search hotels with real prices
   */
  async searchHotels(
    cityName,
    checkIn,
    checkOut,
    adults = 2,
    specificHotelName = null
  ) {
    try {
      if (!this.apiKey) {
        throw new Error("RapidAPI key not configured");
      }

      console.log(
        `🏨 [RapidAPI] Searching hotels in ${cityName}${specificHotelName ? ` - ${specificHotelName}` : ""}`
      );

      // Step 1: Get destination ID
      const destResponse = await axios.get(
        `${this.baseUrl}/hotels/searchDestination`,
        {
          params: { query: cityName },
          headers: {
            "X-RapidAPI-Key": this.apiKey,
            "X-RapidAPI-Host": "booking-com15.p.rapidapi.com",
          },
        }
      );

      const destinations = destResponse.data?.data || [];
      if (destinations.length === 0) {
        throw new Error(`City not found: ${cityName}`);
      }

      const destination = destinations[0];
      console.log(
        `✅ Found destination: ${destination.name} (${destination.dest_id})`
      );

      // Step 2: Search hotels
      const hotelsResponse = await axios.get(
        `${this.baseUrl}/hotels/searchHotels`,
        {
          params: {
            dest_id: destination.dest_id,
            search_type: destination.search_type,
            arrival_date: checkIn,
            departure_date: checkOut,
            adults: adults,
            room_qty: 1,
            page_number: 1,
            units: "metric",
            temperature_unit: "c",
            languagecode: "en-us",
            currency_code: "USD",
          },
          headers: {
            "X-RapidAPI-Key": this.apiKey,
            "X-RapidAPI-Host": "booking-com15.p.rapidapi.com",
          },
        }
      );

      let hotels = hotelsResponse.data?.data?.hotels || [];

      // If specific hotel name provided, filter for it with fuzzy matching
      if (specificHotelName) {
        const searchWords = specificHotelName
          .toLowerCase()
          .split(" ")
          .filter((w) => w.length > 2);
        const allHotels = [...hotels];

        // Try exact match first
        hotels = allHotels.filter((hotel) =>
          hotel.property?.name
            ?.toLowerCase()
            .includes(specificHotelName.toLowerCase())
        );

        // If no exact match, try fuzzy matching (60% of words must match)
        if (hotels.length === 0 && searchWords.length > 0) {
          console.log(
            `🔍 No exact match, trying fuzzy matching for "${specificHotelName}"`
          );
          hotels = allHotels.filter((hotel) => {
            const hotelName = hotel.property?.name?.toLowerCase() || "";
            const matches = searchWords.filter((word) =>
              hotelName.includes(word)
            );
            return matches.length >= Math.ceil(searchWords.length * 0.6);
          });
        }

        // If still no match, try first word only (hotel brand)
        if (hotels.length === 0 && searchWords.length > 0) {
          console.log(
            `🔍 Fuzzy match failed, trying brand name: "${searchWords[0]}"`
          );
          hotels = allHotels.filter((hotel) =>
            hotel.property?.name?.toLowerCase().includes(searchWords[0])
          );
        }

        console.log(
          `🔍 Filtered to ${hotels.length} hotels matching "${specificHotelName}"`
        );
      }

      console.log(`✅ Found ${hotels.length} hotels with prices`);

      // Return top 5 hotels (or just 1 if specific hotel)
      const limit = specificHotelName ? 1 : 5;
      return hotels.slice(0, limit).map((hotel) => ({
        id: hotel.hotel_id,
        name: hotel.property?.name || "Hotel",
        stars: hotel.property?.qualityClass || 0, // Hotel star rating (1-5)
        price: Math.round(
          hotel.property?.priceBreakdown?.grossPrice?.value || 0
        ),
        currency: "USD",
        pricePerNight: Math.round(
          (hotel.property?.priceBreakdown?.grossPrice?.value || 0) /
            this.getDaysDiff(checkIn, checkOut)
        ),
        rating: Math.round((hotel.property?.reviewScore || 0) * 10) / 10, // Review score (0-10)
        location: hotel.property?.name || "",
        photos: hotel.property?.photoUrls || [],
        amenities: [],
        bookingLink: `https://www.booking.com/hotel/${hotel.property?.countryCode?.toLowerCase()}/${hotel.property?.name?.toLowerCase()?.replace(/\s+/g, "-")}.html?aid=2371057&label=meetloca`,
        affiliate: true,
      }));
    } catch (error) {
      console.error("RapidAPI Hotels Error:", error.message);
      throw error;
    }
  }

  /**
   * Search flights with real prices from Booking.com
   * @param {string} origin - Origin airport code (e.g., "TLV")
   * @param {string} destination - Destination airport code (e.g., "WAW")
   * @param {string} departureDate - Departure date (YYYY-MM-DD)
   * @param {string} returnDate - Optional return date for round trip
   * @param {number} adults - Number of adults
   * @param {string} cabinClass - economy, business, first
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
      if (!this.apiKey) {
        throw new Error("RapidAPI key not configured");
      }

      console.log(
        `✈️ [RapidAPI Flights] Searching: ${origin} → ${destination} on ${departureDate}`
      );

      const params = {
        fromId: origin,
        toId: destination,
        departDate: departureDate,
        adults: adults.toString(),
        cabinClass: cabinClass,
        sort: "BEST", // BEST, CHEAPEST, FASTEST
      };

      // Add return date for round trip
      if (returnDate) {
        params.returnDate = returnDate;
      }

      const response = await axios.get(
        `${this.baseUrl}/flights/searchFlights`,
        {
          params,
          headers: {
            "X-RapidAPI-Key": this.apiKey,
            "X-RapidAPI-Host": "booking-com15.p.rapidapi.com",
          },
          timeout: 30000, // Flights can take longer
        }
      );

      const flightsData = response.data?.data?.flights || [];

      if (flightsData.length === 0) {
        console.log("⚠️ No flights found");
        return [];
      }

      // Parse flights
      const flights = flightsData.slice(0, 5).map((flight) => {
        const segments = flight.segments || [];
        const firstSegment = segments[0] || {};
        const lastSegment = segments[segments.length - 1] || {};

        // Calculate stops
        const stops = segments.length - 1;

        // Get price
        const price = flight.priceBreakdown?.total?.units || 0;

        // Duration in minutes
        const durationMinutes = flight.totalDuration || 0;
        const hours = Math.floor(durationMinutes / 60);
        const mins = durationMinutes % 60;
        const durationStr = `${hours}h ${mins}m`;

        return {
          airline: firstSegment.operatingCarrier?.name || "Unknown",
          flightNumber: firstSegment.flightNumber || "",
          origin: origin,
          destination: destination,
          departureTime: firstSegment.departureTime || null,
          arrivalTime: lastSegment.arrivalTime || null,
          price: price,
          currency: "USD",
          stops: stops,
          duration: durationStr,
          durationMinutes: durationMinutes,
          // Booking.com flight link with affiliate
          bookingLink: `https://www.booking.com/flights?aid=2371057&label=meetloca&from=${origin}&to=${destination}&depart=${departureDate}${returnDate ? `&return=${returnDate}` : ""}`,
          affiliate: true,
          provider: "Booking.com Flights",
        };
      });

      console.log(`✅ Found ${flights.length} flights from Booking.com`);
      return flights;
    } catch (error) {
      console.error("RapidAPI Flights Error:", error.message);
      if (error.response?.status === 404) {
        console.log("⚠️ Flights endpoint might not be available");
      }
      return []; // Return empty instead of throwing
    }
  }

  /**
   * Calculate days difference
   */
  getDaysDiff(checkIn, checkOut) {
    const date1 = new Date(checkIn);
    const date2 = new Date(checkOut);
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays || 1;
  }
}

export default new RapidApiHotelsService();
