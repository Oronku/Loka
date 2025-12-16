import express from "express";
import googleApi from "../services/googleApi.js";

const router = express.Router();

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

    if (!place_id) {
      return res.status(400).json({ error: "place_id parameter is required" });
    }

    const details = await googleApi.getPlaceDetails(place_id, [
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
      "price_level",
      "types",
    ]);

    const placeDetails = {
      placeId: details.place_id,
      name: details.name,
      formattedAddress: details.formatted_address,
      rating: details.rating,
      priceLevel: details.price_level,
      geometry: details.geometry,
      formattedPhoneNumber: details.formatted_phone_number,
      website: details.website,
      types: details.types || [],
      openingHours: details.opening_hours
        ? {
            openNow: details.opening_hours.open_now,
            weekdayText: details.opening_hours.weekday_text || [],
          }
        : null,
      photos:
        details.photos?.slice(0, 10).map((photo) => ({
          photoReference: photo.photo_reference,
          width: photo.width,
          height: photo.height,
        })) || [],
      reviews:
        details.reviews?.slice(0, 5).map((review) => ({
          authorName: review.author_name,
          rating: review.rating,
          text: review.text,
          time: review.time,
        })) || [],
    };

    res.json({ place: placeDetails });
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
