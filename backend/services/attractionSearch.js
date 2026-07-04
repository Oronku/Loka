import googleApi from "./googleApi.js";

export const ATTRACTION_CATEGORY_TYPES = {
  all: "tourist_attraction",
  restaurant: "restaurant",
  park: "park",
  show: "tourist_attraction",
  museum: "museum",
  event: "tourist_attraction",
  themePark: "amusement_park",
  waterPark: "amusement_park",
};

const DISCOVER_SECTION_DEFS = [
  { id: "trending", type: "trending", title: "Trending", emoji: "🔥", category: "all" },
  {
    id: "category-restaurant",
    type: "category",
    title: "Food & Dining",
    emoji: "🍽️",
    category: "restaurant",
  },
  { id: "category-museum", type: "category", title: "Museums", emoji: "🎨", category: "museum" },
  { id: "category-park", type: "category", title: "Nature", emoji: "🌿", category: "park" },
  {
    id: "category-themePark",
    type: "category",
    title: "Activities",
    emoji: "🎢",
    category: "themePark",
  },
];

const PLACES_PER_SECTION = 12;

function countryNameFromCode(code) {
  if (!code || code.length !== 2) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase());
  } catch {
    return null;
  }
}

function parseCountryCodes(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((entry) => entry.trim().toUpperCase())
        .filter((entry) => /^[A-Z]{2}$/.test(entry))
    ),
  ];
}

function radiusFromViewport(lat, latitudeDelta, longitudeDelta, explicitRadius) {
  if (Number.isFinite(explicitRadius) && explicitRadius > 0) {
    return Math.min(Math.max(Math.round(explicitRadius), 500), 50000);
  }

  const latDelta = Number.isFinite(latitudeDelta) ? latitudeDelta : 0.08;
  const lngDelta = Number.isFinite(longitudeDelta) ? longitudeDelta : latDelta;
  const latMeters = latDelta * 111320;
  const lngMeters = lngDelta * 111320 * Math.cos((lat * Math.PI) / 180);
  const estimated = Math.max(latMeters, lngMeters) / 2;
  return Math.min(Math.max(Math.round(estimated), 1500), 50000);
}

export function mapNearbyPlace(place) {
  return {
    placeId: place.place_id,
    name: place.name,
    formattedAddress: place.vicinity || place.formatted_address || "",
    rating: place.rating ?? null,
    userRatingsTotal: place.user_ratings_total ?? 0,
    priceLevel: place.price_level ?? null,
    types: place.types || [],
    lat: place.geometry?.location?.lat ?? null,
    lng: place.geometry?.location?.lng ?? null,
    photoReference: place.photos?.[0]?.photo_reference ?? null,
    imageUrl: place.photos?.[0]?.photo_reference
      ? googleApi.getPhotoUrl(place.photos[0].photo_reference, 400)
      : null,
  };
}

function matchesCountryFilter(place, countryCodes) {
  if (countryCodes.length === 0) return true;
  const address = (place.formattedAddress || "").toLowerCase();
  if (!address) return true;
  return countryCodes.some((code) => {
    const name = countryNameFromCode(code);
    return name ? address.includes(name.toLowerCase()) : false;
  });
}

function dedupeAttractions(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.placeId || seen.has(item.placeId)) continue;
    seen.add(item.placeId);
    out.push(item);
  }
  return out;
}

function sortByPopularity(a, b) {
  const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
  if (ratingDiff !== 0) return ratingDiff;
  return (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0);
}

async function resolveSearchLocation({ destination, lat, lng }) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  const trimmedDestination = typeof destination === "string" ? destination.trim() : "";
  if (!trimmedDestination) return null;

  const geo = await googleApi.searchPlaceByText(trimmedDestination);
  return geo?.location || null;
}

async function searchAttractionsForCategory(location, radius, category, query, destination) {
  const googleType = ATTRACTION_CATEGORY_TYPES[category] || category;

  if (query) {
    const typeLabel = googleType.replace(/_/g, " ");
    const searchQuery = destination
      ? `${query} ${typeLabel} in ${destination}`
      : `${query} ${typeLabel}`;
    const results = await googleApi.searchPlacesByText(searchQuery, location, {
      type: googleType === "tourist_attraction" ? null : googleType,
      limit: 20,
    });
    return results;
  }

  const places = await googleApi.nearbySearch(location, radius, googleType);
  return places.map((place) => mapNearbyPlace(place));
}

/**
 * Shared attraction search used by trip "Add places", Explore search, and Discover.
 */
export async function searchAttractions(options = {}) {
  const {
    destination = "",
    lat,
    lng,
    latitudeDelta,
    longitudeDelta,
    category = "all",
    query = "",
    radius: radiusParam,
    countries = "",
  } = options;

  const location = await resolveSearchLocation({
    destination,
    lat: lat != null ? parseFloat(lat) : null,
    lng: lng != null ? parseFloat(lng) : null,
  });

  if (!location) {
    const err = new Error("Could not resolve search location");
    err.status = 400;
    throw err;
  }

  const countryCodes = parseCountryCodes(countries);
  const radius = radiusFromViewport(
    location.lat,
    parseFloat(latitudeDelta),
    parseFloat(longitudeDelta),
    parseInt(radiusParam, 10)
  );

  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  const activeCategory = typeof category === "string" ? category.trim() : "all";

  let attractions = await searchAttractionsForCategory(
    location,
    radius,
    activeCategory,
    trimmedQuery,
    typeof destination === "string" ? destination.trim() : ""
  );

  attractions = dedupeAttractions(attractions)
    .filter((place) => matchesCountryFilter(place, countryCodes))
    .sort(sortByPopularity);

  return {
    attractions,
    destination: typeof destination === "string" ? destination.trim() : "",
    category: activeCategory,
    location,
    radius,
    countries: countryCodes,
  };
}

export async function searchAttractionSections(options = {}) {
  const base = await searchAttractions({ ...options, category: "all", query: "" });
  const { location, radius, countries, destination } = base;
  const countryCodes = parseCountryCodes(
    Array.isArray(countries) ? countries.join(",") : countries
  );

  const sections = [];

  for (const def of DISCOVER_SECTION_DEFS) {
    let attractions = await searchAttractionsForCategory(
      location,
      radius,
      def.category,
      "",
      destination
    );
    attractions = dedupeAttractions(attractions)
      .filter((place) => matchesCountryFilter(place, countryCodes))
      .sort(sortByPopularity)
      .slice(0, PLACES_PER_SECTION);

    if (attractions.length === 0) continue;

    sections.push({
      id: def.id,
      type: def.type,
      title: def.title,
      emoji: def.emoji,
      places: attractions.map((place) => ({
        placeId: place.placeId,
        name: place.name,
        address: place.formattedAddress,
        category: def.category === "all" ? undefined : def.category,
        types: place.types,
        imageUrl: place.imageUrl,
        rating: place.rating,
        priceLevel: place.priceLevel,
        location:
          place.lat != null && place.lng != null
            ? { lat: place.lat, lng: place.lng }
            : undefined,
        sourceCount: place.userRatingsTotal ?? 0,
      })),
    });

    if (sections.length >= 5) break;
  }

  return {
    sections,
    location,
    radius,
    countries: countryCodes,
  };
}
