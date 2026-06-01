import axios from "axios";

const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";
const GOOGLE_DISTANCE_BASE_URL =
  "https://maps.googleapis.com/maps/api/distancematrix";

class GoogleAPIService {
  constructor() {
    // Don't check API key in constructor - it might not be loaded yet
  }

  get apiKey() {
    return process.env.GOOGLE_API_KEY;
  }

  // Places Autocomplete
  async autocomplete(input, types = null) {
    if (!this.apiKey) {
      throw new Error("Google API key not configured");
    }

    try {
      const params = {
        input,
        key: this.apiKey,
        language: "en",
      };

      if (types) {
        params.types = types;
      }

      const response = await axios.get(
        `${GOOGLE_PLACES_BASE_URL}/autocomplete/json`,
        {
          params,
        }
      );

      if (
        response.data.status !== "OK" &&
        response.data.status !== "ZERO_RESULTS"
      ) {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      return response.data.predictions;
    } catch (error) {
      console.error("Google Autocomplete API error:", error.message);
      throw new Error("Failed to fetch autocomplete suggestions");
    }
  }

  // Place Details
  async getPlaceDetails(
    placeId,
    fields = [
      "place_id",
      "name",
      "formatted_address",
      "rating",
      "geometry",
      "formatted_phone_number",
      "website",
      "opening_hours",
      "photos",
      "reviews",
    ]
  ) {
    if (!this.apiKey) {
      throw new Error("Google API key not configured");
    }

    try {
      const response = await axios.get(
        `${GOOGLE_PLACES_BASE_URL}/details/json`,
        {
          params: {
            place_id: placeId,
            fields: fields.join(","),
            key: this.apiKey,
            language: "en",
          },
        }
      );

      if (response.data.status !== "OK") {
        throw new Error(
          `Google Place Details API error: ${response.data.status}`
        );
      }

      return response.data.result;
    } catch (error) {
      console.error("Google Place Details API error:", error.message);
      throw new Error("Failed to fetch place details");
    }
  }

  // Distance Matrix
  async getDistanceMatrix(origins, destinations, mode = "driving") {
    if (!this.apiKey) {
      throw new Error("Google API key not configured");
    }

    try {
      // Handle array of locations or single location
      const originsStr = Array.isArray(origins) ? origins.join("|") : origins;
      const destinationsStr = Array.isArray(destinations)
        ? destinations.join("|")
        : destinations;

      const response = await axios.get(`${GOOGLE_DISTANCE_BASE_URL}/json`, {
        params: {
          origins: originsStr,
          destinations: destinationsStr,
          mode,
          key: this.apiKey,
          language: "en",
          units: "metric",
        },
      });

      if (response.data.status !== "OK") {
        throw new Error(
          `Google Distance Matrix API error: ${response.data.status}`
        );
      }

      return response.data;
    } catch (error) {
      console.error("Google Distance Matrix API error:", error.message);
      throw new Error("Failed to calculate distance and duration");
    }
  }

  // Nearby Search for places
  async nearbySearch(location, radius = 5000, type = null) {
    if (!this.apiKey) {
      throw new Error("Google API key not configured");
    }

    try {
      const params = {
        location: `${location.lat},${location.lng}`,
        radius,
        key: this.apiKey,
        language: "en",
      };

      if (type) {
        params.type = type;
      }

      const response = await axios.get(
        `${GOOGLE_PLACES_BASE_URL}/nearbysearch/json`,
        {
          params,
        }
      );

      if (
        response.data.status !== "OK" &&
        response.data.status !== "ZERO_RESULTS"
      ) {
        throw new Error(
          `Google Nearby Search API error: ${response.data.status}`
        );
      }

      return response.data.results;
    } catch (error) {
      console.error("Google Nearby Search API error:", error.message);
      throw new Error("Failed to search nearby places");
    }
  }

  // Text Search for places (returns first match — used for geocoding)
  async searchPlaceByText(query, location = null) {
    if (!this.apiKey) {
      throw new Error("Google API key not configured");
    }

    try {
      const params = {
        query,
        key: this.apiKey,
        language: "en",
      };

      // Optionally bias results to a location
      if (location) {
        params.location = `${location.lat},${location.lng}`;
        params.radius = 50000; // 50km radius
      }

      const response = await axios.get(
        `${GOOGLE_PLACES_BASE_URL}/textsearch/json`,
        {
          params,
        }
      );

      if (
        response.data.status !== "OK" &&
        response.data.status !== "ZERO_RESULTS"
      ) {
        console.error(`Google Text Search API error: ${response.data.status}`);
        return null;
      }

      // Return the first result with most relevant info
      if (response.data.results && response.data.results.length > 0) {
        const place = response.data.results[0];
        return {
          placeId: place.place_id,
          name: place.name,
          address: place.formatted_address,
          rating: place.rating || null,
          userRatingsTotal: place.user_ratings_total || 0,
          location: place.geometry?.location || null,
          types: place.types || [],
          priceLevel: place.price_level || null,
          // Add photo reference (first photo if available)
          photoReference: place.photos?.[0]?.photo_reference || null,
          photoWidth: place.photos?.[0]?.width || null,
          photoHeight: place.photos?.[0]?.height || null,
        };
      }

      return null;
    } catch (error) {
      console.error("Google Text Search API error:", error.message);
      return null;
    }
  }

  /**
   * Text Search — returns multiple lodging results, optionally biased to a location.
   */
  async textSearch(query, location = null, limit = 20) {
    if (!this.apiKey) {
      throw new Error("Google API key not configured");
    }

    try {
      const params = {
        query,
        key: this.apiKey,
        language: "en",
        type: "lodging",
      };

      if (location?.lat != null && location?.lng != null) {
        params.location = `${location.lat},${location.lng}`;
        params.radius = 50000;
      }

      const response = await axios.get(
        `${GOOGLE_PLACES_BASE_URL}/textsearch/json`,
        { params }
      );

      if (
        response.data.status !== "OK" &&
        response.data.status !== "ZERO_RESULTS"
      ) {
        console.error(`Google Text Search API error: ${response.data.status}`);
        return [];
      }

      return (response.data.results || []).slice(0, limit).map((place) => ({
        placeId: place.place_id,
        name: place.name,
        formattedAddress: place.formatted_address,
        rating: place.rating ?? null,
        userRatingsTotal: place.user_ratings_total ?? 0,
        lat: place.geometry?.location?.lat ?? null,
        lng: place.geometry?.location?.lng ?? null,
        priceLevel: place.price_level ?? null,
        photoReference: place.photos?.[0]?.photo_reference ?? null,
        imageUrl: place.photos?.[0]?.photo_reference
          ? this.getPhotoUrl(place.photos[0].photo_reference, 400)
          : null,
      }));
    } catch (error) {
      console.error("Google Text Search API error:", error.message);
      return [];
    }
  }

  // Get photo URL from photo reference
  getPhotoUrl(photoReference, maxWidth = 400) {
    if (!this.apiKey || !photoReference) {
      return null;
    }

    return `${GOOGLE_PLACES_BASE_URL}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${this.apiKey}`;
  }
}

export default new GoogleAPIService();
