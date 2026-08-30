import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import googleApi from "./googleApi.js";
import {
  CACHE_REFRESH_MS,
  PLACES_CACHE_COLLECTION,
  computeOpenNow,
  formatPlaceDetailsFromCache,
  getPlaceDetailsForApi,
} from "./placeCache.js";

const PLACE_ID = "ChIJTestPlace";

function memoryCollection(docs) {
  return {
    findOne: async (query) =>
      docs.find((d) => Object.entries(query).every(([k, v]) => d[k] === v)) || null,
    updateOne: async (query, update, { upsert } = {}) => {
      let doc = docs.find((d) => d.placeId === query.placeId);
      if (!doc && upsert) {
        doc = { placeId: query.placeId, ...update.$setOnInsert };
        docs.push(doc);
      }
      if (doc) {
        Object.assign(doc, update.$set || {});
      }
      return { modifiedCount: 1, upsertedCount: upsert && !doc ? 1 : 0 };
    },
  };
}

function mockDb(cacheDocs = []) {
  const collections = {
    [PLACES_CACHE_COLLECTION]: memoryCollection(cacheDocs),
  };
  return {
    collection(name) {
      return collections[name];
    },
    _cache: cacheDocs,
  };
}

const GOOGLE_RESULT = {
  place_id: PLACE_ID,
  name: "Eiffel Tower",
  formatted_address: "Champ de Mars, 5 Av. Anatole France, 75007 Paris",
  rating: 4.7,
  user_ratings_total: 420000,
  price_level: 2,
  geometry: { location: { lat: 48.858, lng: 2.294 } },
  formatted_phone_number: "+33 892 70 12 39",
  website: "https://toureiffel.paris",
  url: "https://maps.google.com/?cid=123",
  business_status: "OPERATIONAL",
  types: ["tourist_attraction", "point_of_interest"],
  editorial_summary: { overview: "Iconic iron lattice tower." },
  utc_offset: 120,
  current_opening_hours: {
    open_now: true,
    weekday_text: ["Monday: 9:00 AM – 12:00 AM"],
    periods: [
      { open: { day: 1, time: "0900" }, close: { day: 1, time: "2359" } },
    ],
  },
  photos: [{ photo_reference: "photo-abc", width: 800, height: 600 }],
  reviews: [
    {
      author_name: "Alice",
      rating: 5,
      text: "Amazing views",
      time: 1700000000,
    },
  ],
};

describe("computeOpenNow", () => {
  it("returns null without periods or utc offset", () => {
    assert.equal(computeOpenNow(null, 60), null);
    assert.equal(computeOpenNow({ periods: [] }, null), null);
  });
});

describe("formatPlaceDetailsFromCache", () => {
  it("preserves the GET /api/places/details place shape", () => {
    const place = formatPlaceDetailsFromCache({
      placeId: PLACE_ID,
      name: "Eiffel Tower",
      address: "Champ de Mars",
      rating: 4.7,
      userRatingsTotal: 100,
      priceLevel: 2,
      location: { lat: 48.858, lng: 2.294 },
      summary: "Iconic tower",
      formattedPhoneNumber: "+33 1",
      website: "https://toureiffel.paris",
      googleMapsUrl: "https://maps.google.com/?cid=1",
      businessStatus: "OPERATIONAL",
      types: ["tourist_attraction"],
      utcOffsetMinutes: 120,
      openingHours: {
        weekday_text: ["Monday: 9:00 AM – 12:00 AM"],
        periods: [{ open: { day: 1, time: "0900" }, close: { day: 1, time: "2359" } }],
      },
      photosMeta: [{ photoReference: "photo-abc", width: 800, height: 600 }],
      reviews: GOOGLE_RESULT.reviews,
    });

    assert.equal(place.placeId, PLACE_ID);
    assert.equal(place.name, "Eiffel Tower");
    assert.equal(place.formattedAddress, "Champ de Mars");
    assert.equal(place.rating, 4.7);
    assert.equal(place.userRatingsTotal, 100);
    assert.equal(place.priceLevel, 2);
    assert.ok(place.geometry?.location);
    assert.equal(place.description, "Iconic tower");
    assert.equal(place.formattedPhoneNumber, "+33 1");
    assert.equal(place.website, "https://toureiffel.paris");
    assert.equal(place.googleMapsUrl, "https://maps.google.com/?cid=1");
    assert.equal(place.businessStatus, "OPERATIONAL");
    assert.deepEqual(place.types, ["tourist_attraction"]);
    assert.ok("openNow" in place.openingHours);
    assert.ok(Array.isArray(place.openingHours.weekdayText));
    assert.equal(place.photos[0].photoReference, "photo-abc");
    assert.equal(place.reviews[0].authorName, "Alice");
  });
});

describe("getPlaceDetailsForApi", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("serves fresh cache without calling Google", async () => {
    const db = mockDb([
      {
        placeId: PLACE_ID,
        name: "Cached Tower",
        address: "Cached address",
        rating: 4.5,
        userRatingsTotal: 10,
        updatedAt: new Date(),
        openingHours: { weekday_text: ["Mon: 9-5"], periods: [] },
        utcOffsetMinutes: 60,
        photosMeta: [],
        types: [],
      },
    ]);

    const getDetails = mock.method(googleApi, "getPlaceDetails", async () => {
      throw new Error("should not call Google");
    });

    const result = await getPlaceDetailsForApi(db, PLACE_ID);
    assert.equal(getDetails.mock.callCount(), 0);
    assert.equal(result.fromCache, true);
    assert.equal(result.stale, false);
    assert.equal(result.place.name, "Cached Tower");
    assert.equal(result.place.cacheStale, undefined);
  });

  it("fetches and caches when cache is absent", async () => {
    const db = mockDb([]);
    const originalKey = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = "test-key";

    mock.method(googleApi, "getPlaceDetails", async () => GOOGLE_RESULT);

    try {
      const result = await getPlaceDetailsForApi(db, PLACE_ID);
      assert.equal(result.fromCache, false);
      assert.equal(result.place.name, "Eiffel Tower");
      assert.equal(result.place.formattedAddress, GOOGLE_RESULT.formatted_address);
      assert.equal(db._cache.length, 1);
      assert.equal(db._cache[0].placeId, PLACE_ID);
    } finally {
      process.env.GOOGLE_API_KEY = originalKey;
    }
  });

  it("falls back to stale cache when Google fails", async () => {
    const db = mockDb([
      {
        placeId: PLACE_ID,
        name: "Stale Tower",
        address: "Old address",
        rating: 4.0,
        userRatingsTotal: 5,
        updatedAt: new Date(Date.now() - CACHE_REFRESH_MS - 1000),
        openingHours: { weekday_text: ["Mon: 9-5"], periods: [] },
        utcOffsetMinutes: 60,
        photosMeta: [],
        types: [],
      },
    ]);

    const originalKey = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = "test-key";
    mock.method(googleApi, "getPlaceDetails", async () => {
      throw new Error("Google unavailable");
    });

    try {
      const result = await getPlaceDetailsForApi(db, PLACE_ID);
      assert.equal(result.fromCache, true);
      assert.equal(result.stale, true);
      assert.equal(result.place.name, "Stale Tower");
      assert.equal(result.place.cacheStale, true);
    } finally {
      process.env.GOOGLE_API_KEY = originalKey;
    }
  });

  it("returns null when cache is absent and Google fails", async () => {
    const db = mockDb([]);
    const originalKey = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = "test-key";
    mock.method(googleApi, "getPlaceDetails", async () => {
      throw new Error("Google unavailable");
    });

    try {
      const result = await getPlaceDetailsForApi(db, PLACE_ID);
      assert.equal(result, null);
    } finally {
      process.env.GOOGLE_API_KEY = originalKey;
    }
  });
});
