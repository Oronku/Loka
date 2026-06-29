import { PLACES_CACHE_COLLECTION } from "./placeCache.js";

export const PLACES_PER_SECTION = 12;
export const PLACES_PER_EXPANDED = 24;
export const MAX_SECTIONS = 8;
export const MAX_CATEGORY_SECTIONS = 4;
export const MAX_COUNTRY_SECTIONS = 3;
const CACHE_SCAN_LIMIT = 500;

/** Canonical discover categories mapped from Google types / cache category. */
const CATEGORY_DEFINITIONS = [
  {
    id: "cafe",
    title: "Cafés",
    emoji: "☕",
    match: ["cafe", "coffee_shop"],
  },
  {
    id: "bar",
    title: "Bars & Nightlife",
    emoji: "🍸",
    match: ["bar", "night_club", "pub", "wine_bar"],
  },
  {
    id: "beach",
    title: "Beaches",
    emoji: "🏖️",
    match: ["beach"],
  },
  {
    id: "museum",
    title: "Museums",
    emoji: "🎨",
    match: ["museum", "art_gallery"],
  },
  {
    id: "shopping",
    title: "Shopping",
    emoji: "🛍️",
    match: ["shopping_mall", "store", "clothing_store", "market", "department_store"],
  },
  {
    id: "nature",
    title: "Nature",
    emoji: "🌿",
    match: ["park", "natural_feature", "hiking_area", "campground", "national_park"],
  },
  {
    id: "sight",
    title: "Sights",
    emoji: "🏛️",
    match: [
      "tourist_attraction",
      "landmark",
      "church",
      "place_of_worship",
      "monument",
      "historical_landmark",
    ],
  },
  {
    id: "food",
    title: "Food & Dining",
    emoji: "🍽️",
    match: [
      "restaurant",
      "food",
      "meal_delivery",
      "meal_takeaway",
      "bakery",
      "fast_food_restaurant",
    ],
  },
];

const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORY_DEFINITIONS.map((c) => [c.id, c])
);

function placesCache(db) {
  return db.collection(PLACES_CACHE_COLLECTION);
}

function sourceCount(doc) {
  return Array.isArray(doc.sources) ? doc.sources.length : 0;
}

function hasCoordinates(doc) {
  return (
    doc?.location &&
    typeof doc.location.lat === "number" &&
    typeof doc.location.lng === "number"
  );
}

function hasImage(doc) {
  return Array.isArray(doc.images) && doc.images.length > 0;
}

function isDiscoverable(doc) {
  return Boolean(doc?.placeId && hasCoordinates(doc) && hasImage(doc));
}

/** ISO 3166-1 alpha-2 → flag emoji. */
export function countryCodeToFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const upper = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🌍";
  return String.fromCodePoint(
    ...[...upper].map((char) => 0x1f1e6 - 65 + char.charCodeAt(0))
  );
}

/**
 * Map a cache row to a canonical discover category id, or null when unknown.
 * @param {object} doc
 */
export function resolveCanonicalCategory(doc) {
  const types = Array.isArray(doc?.types) ? doc.types : [];
  const rawCategory =
    typeof doc?.category === "string" ? doc.category.toLowerCase() : "";

  for (const def of CATEGORY_DEFINITIONS) {
    if (def.match.some((t) => types.includes(t))) return def.id;
  }

  if (rawCategory) {
    const direct = CATEGORY_BY_ID[rawCategory];
    if (direct) return direct.id;

    for (const def of CATEGORY_DEFINITIONS) {
      if (def.match.some((t) => rawCategory.includes(t.replace(/_/g, "")))) {
        return def.id;
      }
    }
  }

  return null;
}

export function formatDiscoverPlace(doc) {
  const images = Array.isArray(doc.images) ? doc.images : [];
  const count = sourceCount(doc);

  const place = {
    placeId: doc.placeId,
    name: doc.name || "",
    sourceCount: count,
  };

  if (doc.address) place.address = doc.address;
  if (doc.city) place.city = doc.city;
  if (doc.country) place.country = doc.country;
  if (doc.countryCode) place.countryCode = doc.countryCode;
  if (doc.category) place.category = doc.category;
  if (Array.isArray(doc.types) && doc.types.length) place.types = doc.types;
  if (images[0]) place.imageUrl = images[0];
  if (images.length) place.images = images;
  if (doc.summary) place.summary = doc.summary;
  if (Array.isArray(doc.tags) && doc.tags.length) place.tags = doc.tags;
  if (doc.rating != null) place.rating = doc.rating;
  if (doc.priceLevel != null) place.priceLevel = doc.priceLevel;
  if (doc.location) place.location = doc.location;

  return place;
}

/** Full discover detail from a places_cache row (before saving). */
export function formatDiscoverPlaceDetail(doc) {
  const base = formatDiscoverPlace(doc);
  return {
    ...base,
    website: doc.website ?? null,
    googleMapsUrl: doc.googleMapsUrl ?? null,
    openingHours: doc.openingHours?.weekday_text ?? doc.openingHours ?? null,
    reviews: doc.reviews ?? null,
  };
}

function sortByPopularity(a, b) {
  const countDiff = sourceCount(b) - sourceCount(a);
  if (countDiff !== 0) return countDiff;
  return (b.rating ?? 0) - (a.rating ?? 0);
}

function dedupeByPlaceId(docs) {
  const seen = new Set();
  const out = [];
  for (const doc of docs) {
    if (seen.has(doc.placeId)) continue;
    seen.add(doc.placeId);
    out.push(doc);
  }
  return out;
}

function takePlaces(docs, limit) {
  return dedupeByPlaceId(docs).slice(0, limit).map(formatDiscoverPlace);
}

function buildTrendingSection(docs, limit = PLACES_PER_SECTION) {
  const places = takePlaces([...docs].sort(sortByPopularity), limit);
  if (places.length === 0) return null;

  return {
    id: "trending",
    type: "trending",
    title: "Trending",
    emoji: "🔥",
    places,
  };
}

function buildCategorySection(categoryId, docs, limit = PLACES_PER_SECTION) {
  const def = CATEGORY_BY_ID[categoryId];
  if (!def) return null;

  const inCategory = docs.filter((d) => resolveCanonicalCategory(d) === categoryId);
  const places = takePlaces([...inCategory].sort(sortByPopularity), limit);
  if (places.length === 0) return null;

  return {
    id: `category-${categoryId}`,
    type: "category",
    title: def.title,
    emoji: def.emoji,
    places,
  };
}

function buildCountrySection(countryKey, docs, limit = PLACES_PER_SECTION) {
  const sample = docs.find(
    (d) =>
      (d.countryCode && d.countryCode.toUpperCase() === countryKey) ||
      (d.country && d.country.toLowerCase() === countryKey.toLowerCase())
  );
  if (!sample) return null;

  const inCountry = docs.filter((d) => {
    if (sample.countryCode) {
      return d.countryCode?.toUpperCase() === sample.countryCode.toUpperCase();
    }
    return d.country?.toLowerCase() === sample.country?.toLowerCase();
  });

  const places = takePlaces([...inCountry].sort(sortByPopularity), limit);
  if (places.length === 0) return null;

  const countryCode = sample.countryCode?.toUpperCase() || null;
  const id = countryCode ? `country-${countryCode}` : `country-${countryKey}`;

  return {
    id,
    type: "country",
    title: sample.country || countryKey,
    emoji: countryCodeToFlag(countryCode),
    places,
  };
}

function rankCategoryIds(docs) {
  const counts = new Map();
  for (const doc of docs) {
    const cat = resolveCanonicalCategory(doc);
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

function rankCountryKeys(docs) {
  const buckets = new Map();

  for (const doc of docs) {
    const code = doc.countryCode?.toUpperCase();
    const key = code || doc.country?.trim();
    if (!key) continue;

    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, { key, count: 1, code: code || null });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .map((b) => b.key);
}

/**
 * Load discoverable rows from places_cache, ordered by popularity.
 * @param {import('mongodb').Db} db
 */
async function loadDiscoverablePlaces(db) {
  const rows = await placesCache(db)
    .aggregate([
      {
        $addFields: {
          sourceCount: { $size: { $ifNull: ["$sources", []] } },
        },
      },
      {
        $match: {
          placeId: { $exists: true, $ne: null },
          "location.lat": { $exists: true, $ne: null },
          "location.lng": { $exists: true, $ne: null },
          images: { $exists: true, $type: "array", $not: { $size: 0 } },
        },
      },
      { $sort: { sourceCount: -1, rating: -1 } },
      { $limit: CACHE_SCAN_LIMIT },
    ])
    .toArray();

  return rows.filter(isDiscoverable);
}

/**
 * Build discover feed sections from places_cache.
 *
 * @param {import('mongodb').Db} db
 * @param {{ country?: string|null, category?: string|null }} [filters]
 */
export async function buildDiscoverFeed(db, filters = {}) {
  if (!db) return { sections: [] };

  const docs = await loadDiscoverablePlaces(db);
  if (docs.length === 0) return { sections: [] };

  const categoryFilter =
    typeof filters.category === "string" ? filters.category.trim().toLowerCase() : null;
  const countryFilter =
    typeof filters.country === "string" ? filters.country.trim() : null;

  const sections = [];

  if (categoryFilter) {
    const section = buildCategorySection(
      categoryFilter,
      docs,
      PLACES_PER_EXPANDED
    );
    if (section) sections.push(section);
    return { sections };
  }

  if (countryFilter) {
    const normalizedCountry = countryFilter.toUpperCase();
    const key =
      normalizedCountry.length === 2
        ? normalizedCountry
        : countryFilter.toLowerCase();
    const section = buildCountrySection(key, docs, PLACES_PER_EXPANDED);
    if (section) sections.push(section);
    return { sections };
  }

  const trending = buildTrendingSection(docs);
  if (trending) sections.push(trending);

  const categoryIds = rankCategoryIds(docs).slice(0, MAX_CATEGORY_SECTIONS);
  for (const categoryId of categoryIds) {
    if (sections.length >= MAX_SECTIONS) break;
    const section = buildCategorySection(categoryId, docs);
    if (section) sections.push(section);
  }

  const countryKeys = rankCountryKeys(docs).slice(0, MAX_COUNTRY_SECTIONS);
  for (const countryKey of countryKeys) {
    if (sections.length >= MAX_SECTIONS) break;
    const section = buildCountrySection(countryKey, docs);
    if (section) sections.push(section);
  }

  return { sections };
}

/**
 * Look up a single places_cache row for discover detail.
 * @param {import('mongodb').Db} db
 * @param {string} placeId
 */
export async function getDiscoverPlaceById(db, placeId) {
  if (!db || !placeId) return null;
  const doc = await placesCache(db).findOne({ placeId });
  if (!doc) return null;
  return formatDiscoverPlaceDetail(doc);
}
