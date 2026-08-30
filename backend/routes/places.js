import express from "express";
import googleApi from "../services/googleApi.js";
import { getDb } from "../config/database.js";
import { getPlaceDetailsForApi } from "../services/placeCache.js";
import {
  searchAttractions,
  searchAttractionSections,
} from "../services/attractionSearch.js";

const router = express.Router();

// Search attractions near a destination or map coordinates (shared by trip Add places, Explore, Discover)
router.get("/attractions", async (req, res) => {
  try {
    const destination = (req.query.destination || "").trim();
    const { lat, lng, latitudeDelta, longitudeDelta, countries, format } =
      req.query;

    if (!destination && (lat == null || lng == null)) {
      return res.status(400).json({
        error: "destination or lat/lng query parameters are required",
      });
    }

    const searchOptions = {
      destination,
      lat,
      lng,
      latitudeDelta,
      longitudeDelta,
      category: req.query.category,
      query: req.query.query,
      radius: req.query.radius,
      countries,
    };

    if (format === "sections") {
      const feed = await searchAttractionSections(searchOptions);
      return res.json(feed);
    }

    const result = await searchAttractions(searchOptions);
    res.json(result);
  } catch (error) {
    console.error("Attractions search error:", error.message);
    const status = error.status || 500;
    res.status(status).json({
      error:
        status === 400
          ? error.message
          : "Failed to search attractions",
      message: error.message,
    });
  }
});

// Places autocomplete for attractions, restaurants, etc.
router.get("/autocomplete", async (req, res) => {
  try {
    const { input, types = "establishment" } = req.query;

    if (!input || input.trim().length < 2) {
      return res
        .status(400)
        .json({
          error:
            "Input parameter is required and must be at least 2 characters",
        });
    }

    const predictions = await googleApi.autocomplete(input.trim(), types);

    const placeSuggestions = predictions.map((prediction) => ({
      placeId: prediction.place_id,
      name: prediction.structured_formatting.main_text,
      formattedAddress: prediction.description,
      types: prediction.types,
    }));

    res.json({ suggestions: placeSuggestions });
  } catch (error) {
    console.error("Places autocomplete error:", error.message);
    res.status(500).json({
      error: "Failed to fetch place suggestions",
      message: error.message,
    });
  }
});

// Place details for attractions
router.get("/details", async (req, res) => {
  try {
    const { place_id } = req.query;
    const language = (req.query.language || "en").toString();

    if (!place_id) {
      return res.status(400).json({ error: "place_id parameter is required" });
    }

    const db = getDb();
    const result = await getPlaceDetailsForApi(db, place_id, language);

    if (!result?.place) {
      return res.status(404).json({
        error: "Failed to fetch place details",
        message: "Place not found",
      });
    }

    res.json({ place: result.place });
  } catch (error) {
    console.error("Place details error:", error.message);
    res.status(500).json({
      error: "Failed to fetch place details",
      message: error.message,
    });
  }
});

// Search nearby attractions
router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 5000, type } = req.query;

    if (!lat || !lng) {
      return res
        .status(400)
        .json({ error: "lat and lng parameters are required" });
    }

    const location = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    };

    if (isNaN(location.lat) || isNaN(location.lng)) {
      return res
        .status(400)
        .json({ error: "lat and lng must be valid numbers" });
    }

    const places = await googleApi.nearbySearch(
      location,
      parseInt(radius),
      type
    );

    const nearbyPlaces = places.map((place) => ({
      placeId: place.place_id,
      name: place.name,
      vicinity: place.vicinity,
      rating: place.rating,
      priceLevel: place.price_level,
      types: place.types,
      geometry: place.geometry,
      photos:
        place.photos?.slice(0, 1).map((photo) => ({
          photoReference: photo.photo_reference,
          width: photo.width,
          height: photo.height,
        })) || [],
      openingHours: place.opening_hours
        ? {
            openNow: place.opening_hours.open_now,
          }
        : null,
    }));

    res.json({
      places: nearbyPlaces,
      location,
      radius: parseInt(radius),
    });
  } catch (error) {
    console.error("Nearby places search error:", error.message);
    res.status(500).json({
      error: "Failed to search nearby places",
      message: error.message,
    });
  }
});

// Search attractions by category
router.get("/search-by-category", async (req, res) => {
  try {
    const { lat, lng, category, radius = 10000 } = req.query;

    if (!lat || !lng || !category) {
      return res
        .status(400)
        .json({ error: "lat, lng, and category parameters are required" });
    }

    const location = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    };

    // Map categories to Google Places types
    const typeMapping = {
      restaurant: "restaurant",
      tourist_attraction: "tourist_attraction",
      museum: "museum",
      park: "park",
      shopping: "shopping_mall",
      entertainment: "amusement_park",
      nightlife: "night_club",
    };

    const googleType = typeMapping[category] || category;

    const places = await googleApi.nearbySearch(
      location,
      parseInt(radius),
      googleType
    );

    const categorizedPlaces = places.map((place) => ({
      placeId: place.place_id,
      name: place.name,
      vicinity: place.vicinity,
      rating: place.rating,
      priceLevel: place.price_level,
      types: place.types,
      geometry: place.geometry,
      photos:
        place.photos?.slice(0, 1).map((photo) => ({
          photoReference: photo.photo_reference,
          width: photo.width,
          height: photo.height,
        })) || [],
      openingHours: place.opening_hours
        ? {
            openNow: place.opening_hours.open_now,
          }
        : null,
    }));

    res.json({
      places: categorizedPlaces,
      category,
      location,
      radius: parseInt(radius),
    });
  } catch (error) {
    console.error("Category search error:", error.message);
    res.status(500).json({
      error: "Failed to search places by category",
      message: error.message,
    });
  }
});

// Get photo URL from photo reference
router.get("/photo", async (req, res) => {
  try {
    const { photo_reference, maxwidth = 400 } = req.query;

    if (!photo_reference) {
      return res
        .status(400)
        .json({ error: "photo_reference parameter is required" });
    }

    const photoUrl = googleApi.getPhotoUrl(photo_reference, parseInt(maxwidth));

    if (!photoUrl) {
      return res
        .status(404)
        .json({ error: "Photo not found or API key not configured" });
    }

    res.json({ photoUrl });
  } catch (error) {
    console.error("Get photo URL error:", error.message);
    res.status(500).json({
      error: "Failed to get photo URL",
      message: error.message,
    });
  }
});

export default router;
