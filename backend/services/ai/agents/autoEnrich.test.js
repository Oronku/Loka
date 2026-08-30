import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import autoEnrich, {
  PLACE_FACTS_TTL_MS,
  buildSilentEnrichmentUpdates,
  placeFactsAreStale,
} from "./autoEnrich.js";
import { resetAutoEnrichLocksForTests } from "./locks.js";

const TRIP_ID = "c875d81e-4c15-4acf-a3e2-17a78a2e4b15";
const USER_ID = "user-1";
const HOURS = { weekdayText: ["Monday: 8:00 AM – 6:00 PM"] };
const STALE_FETCHED_AT = new Date(Date.now() - PLACE_FACTS_TTL_MS - 60_000).toISOString();
const FRESH_FETCHED_AT = new Date().toISOString();

function matchesQuery(doc, query) {
  if (!query) return true;
  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      if (!expected.some((clause) => matchesQuery(doc, clause))) return false;
      continue;
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      if (Object.prototype.hasOwnProperty.call(expected, "$gte")) {
        if (doc[key] == null || new Date(doc[key]) < new Date(expected.$gte)) return false;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$lte")) {
        if (doc[key] == null || new Date(doc[key]) > new Date(expected.$lte)) return false;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$ne")) {
        if (doc[key] === expected.$ne) return false;
        continue;
      }
    }
    if (key === "attractions.id") {
      if (!(doc.attractions || []).some((row) => row.id === expected)) return false;
      continue;
    }
    if (doc[key] !== expected) return false;
  }
  return true;
}

function memoryCollection(docs, { uniqueKeys } = {}) {
  return {
    find(query) {
      const rows = docs.filter((d) => matchesQuery(d, query));
      const api = {
        sort() {
          return api;
        },
        limit() {
          return api;
        },
        toArray: async () => rows,
      };
      return api;
    },
    findOne: async (query) => docs.find((d) => matchesQuery(d, query)) || null,
    insertOne: async (doc) => {
      if (uniqueKeys) {
        const clash = docs.some((d) => uniqueKeys.every((k) => d[k] === doc[k]));
        if (clash) {
          const err = new Error("E11000 duplicate key");
          err.code = 11000;
          throw err;
        }
      }
      docs.push(doc);
      return { insertedId: doc._id || `id-${docs.length}` };
    },
    updateOne: async (query, update, options = {}) => {
      const doc = docs.find((d) => matchesQuery(d, query));
      if (!doc) return { modifiedCount: 0, matchedCount: 0 };
      if (update.$set && options.arrayFilters?.length) {
        const filterId = options.arrayFilters[0]["el.id"];
        for (const [path, value] of Object.entries(update.$set)) {
          if (path === "updatedAt") continue;
          const match = path.match(/^attractions\.\$\[el\]\.(.+)$/);
          if (!match) continue;
          const item = (doc.attractions || []).find((row) => row.id === filterId);
          if (item) item[match[1]] = value;
        }
      } else {
        Object.assign(doc, update.$set || {});
      }
      return { modifiedCount: 1, matchedCount: 1 };
    },
  };
}

function mockDb({ trips = [], runs = [] } = {}) {
  const collections = {
    trips: memoryCollection(trips),
    ai_agent_runs: memoryCollection(runs, { uniqueKeys: ["userId", "key"] }),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _trips: trips,
    _runs: runs,
  };
}

const GOOGLE_PLACE = {
  address: "Vámház körút 1-3, Budapest",
  rating: 4.6,
  placeId: "ChIJChimneyCake",
  photoReference: "photo-ref-abc",
  website: "https://example.com",
  openingHours: HOURS,
  lat: 47.485,
  lng: 19.059,
};

async function runAutoEnrich(attractions, { enrichPlace, now = new Date() } = {}) {
  const db = mockDb({
    trips: [
      {
        id: TRIP_ID,
        name: "Hila & Noam Budapest",
        attractions,
      },
    ],
  });

  let enrichCalls = 0;
  let emitProposalCalls = 0;

  const effects = await autoEnrich.run({
    db,
    user: { id: USER_ID },
    trips: db._trips,
    now,
    tools: {
      enrichPlace: async (...args) => {
        enrichCalls += 1;
        if (enrichPlace) return enrichPlace(...args);
        return GOOGLE_PLACE;
      },
      emitProposal: async () => {
        emitProposalCalls += 1;
        throw new Error("auto_enrich must never emit proposals");
      },
    },
  });

  return { db, effects, enrichCalls, emitProposalCalls };
}

describe("placeFactsAreStale", () => {
  it("treats missing timestamp with present facts as stale", () => {
    assert.equal(
      placeFactsAreStale({ address: "1 Main St", openingHours: HOURS, website: "https://x.com" }),
      true,
    );
  });

  it("treats fresh timestamp as not stale", () => {
    assert.equal(
      placeFactsAreStale({
        address: "1 Main St",
        openingHours: HOURS,
        website: "https://x.com",
        placeFactsFetchedAt: FRESH_FETCHED_AT,
      }),
      false,
    );
  });

  it("treats old timestamp as stale", () => {
    assert.equal(
      placeFactsAreStale(
        {
          address: "1 Main St",
          openingHours: HOURS,
          website: "https://x.com",
          placeFactsFetchedAt: STALE_FETCHED_AT,
        },
        Date.now(),
      ),
      true,
    );
  });
});

describe("buildSilentEnrichmentUpdates", () => {
  it("never includes rating", () => {
    const updates = buildSilentEnrichmentUpdates(
      { status: "planned" },
      { ...GOOGLE_PLACE, rating: 4.9 },
      { refreshStale: false },
    );
    assert.equal(updates.rating, undefined);
  });

  it("refreshes place facts when refreshStale is true", () => {
    const updates = buildSilentEnrichmentUpdates(
      {
        address: "old address",
        openingHours: { weekdayText: ["Old hours"] },
        website: "https://old.example.com",
        location: "old address",
      },
      GOOGLE_PLACE,
      { refreshStale: true },
    );
    assert.equal(updates.address, GOOGLE_PLACE.address);
    assert.equal(updates.openingHours, GOOGLE_PLACE.openingHours);
    assert.equal(updates.website, GOOGLE_PLACE.website);
  });
});

describe("autoEnrich skips notes and unscheduled ideas", () => {
  beforeEach(() => {
    resetAutoEnrichLocksForTests();
  });

  it("does not Google a note named chimney cake workshops", async () => {
    const { effects, enrichCalls } = await runAutoEnrich([
      {
        id: "note-1",
        name: "chimney cake workshops",
        type: "note",
      },
    ]);

    assert.deepEqual(effects, []);
    assert.equal(enrichCalls, 0);
  });

  it("does not Google an idea-status attraction missing address", async () => {
    const { effects, enrichCalls } = await runAutoEnrich([
      {
        id: "idea-1",
        name: "Szimpla Kert",
        type: "attraction",
        status: "idea",
      },
    ]);

    assert.deepEqual(effects, []);
    assert.equal(enrichCalls, 0);
  });

  it("does not enrich placeholder events", async () => {
    const { effects, enrichCalls } = await runAutoEnrich([
      {
        id: "placeholder-1",
        name: "Dinner somewhere",
        type: "event",
        attractionType: "event",
        placeholder: true,
        status: "planned",
        scheduledDate: "2026-09-01",
        scheduledTime: "19:00",
      },
    ]);

    assert.deepEqual(effects, []);
    assert.equal(enrichCalls, 0);
  });
});

describe("autoEnrich silent fill", () => {
  beforeEach(() => {
    resetAutoEnrichLocksForTests();
  });

  it("never emits proposals", async () => {
    const { emitProposalCalls } = await runAutoEnrich([
      {
        id: "market-1",
        name: "Great Market Hall",
        status: "planned",
      },
    ]);
    assert.equal(emitProposalCalls, 0);
  });

  it("silently writes missing address, openingHours, and website", async () => {
    const { effects, db } = await runAutoEnrich([
      {
        id: "market-1",
        name: "Great Market Hall",
        status: "planned",
      },
    ]);

    assert.equal(effects.length, 1);
    const item = db._trips[0].attractions[0];
    assert.equal(item.address, GOOGLE_PLACE.address);
    assert.equal(item.openingHours, GOOGLE_PLACE.openingHours);
    assert.equal(item.website, GOOGLE_PLACE.website);
    assert.equal(item.placeFactsFetchedAt != null, true);
    assert.equal(item.rating, undefined);
  });

  it("silently fills plumbing fields without proposals", async () => {
    const { effects, enrichCalls, db } = await runAutoEnrich([
      {
        id: "colosseum-1",
        name: "Colosseum",
        status: "planned",
        address: "Piazza del Colosseo, 1",
        website: "https://example.com",
        openingHours: HOURS,
        placeFactsFetchedAt: FRESH_FETCHED_AT,
      },
    ]);

    assert.equal(enrichCalls, 1);
    assert.equal(effects.length, 1);
    const item = db._trips[0].attractions[0];
    assert.equal(item.placeId, GOOGLE_PLACE.placeId);
    assert.equal(item.photoReference, GOOGLE_PLACE.photoReference);
    assert.equal(item.lat, GOOGLE_PLACE.lat);
  });

  it("does not call Google when all facts and plumbing are fresh", async () => {
    const { effects, enrichCalls } = await runAutoEnrich([
      {
        id: "parliament-1",
        name: "Hungarian Parliament",
        status: "planned",
        placeId: "ChIJParliament",
        photoReference: "ref",
        imageUrl: "https://img.example/x.jpg",
        lat: 47.5,
        lng: 19.04,
        address: "Kossuth Lajos tér 1-3",
        website: "https://www.parlament.hu",
        openingHours: HOURS,
        placeFactsFetchedAt: FRESH_FETCHED_AT,
      },
    ]);

    assert.deepEqual(effects, []);
    assert.equal(enrichCalls, 0);
  });

  it("refreshes stale place facts but leaves fresh facts alone", async () => {
    const refreshedHours = { weekdayText: ["Monday: 9:00 AM – 7:00 PM"] };
    const { effects, enrichCalls, db } = await runAutoEnrich(
      [
        {
          id: "stale-1",
          name: "Eiffel Tower",
          status: "planned",
          placeId: "ChIJEiffel",
          photoReference: "ref",
          imageUrl: "https://img.example/x.jpg",
          lat: 48.858,
          lng: 2.294,
          address: "Old address",
          website: "https://old.example.com",
          openingHours: { weekdayText: ["Old hours"] },
          placeFactsFetchedAt: STALE_FETCHED_AT,
        },
        {
          id: "fresh-1",
          name: "Louvre",
          status: "planned",
          placeId: "ChIJLouvre",
          photoReference: "ref2",
          imageUrl: "https://img.example/y.jpg",
          lat: 48.861,
          lng: 2.337,
          address: "Rue de Rivoli",
          website: "https://louvre.fr",
          openingHours: HOURS,
          placeFactsFetchedAt: FRESH_FETCHED_AT,
        },
      ],
      {
        enrichPlace: async (name) => {
          if (name === "Eiffel Tower") {
            return {
              ...GOOGLE_PLACE,
              address: "Champ de Mars, Paris",
              website: "https://toureiffel.paris",
              openingHours: refreshedHours,
            };
          }
          return GOOGLE_PLACE;
        },
      },
    );

    assert.equal(enrichCalls, 1);
    assert.equal(effects.length, 1);

    const staleItem = db._trips[0].attractions.find((a) => a.id === "stale-1");
    assert.equal(staleItem.address, "Champ de Mars, Paris");
    assert.equal(staleItem.openingHours, refreshedHours);
    assert.equal(staleItem.website, "https://toureiffel.paris");

    const freshItem = db._trips[0].attractions.find((a) => a.id === "fresh-1");
    assert.equal(freshItem.address, "Rue de Rivoli");
  });

  it("never writes Google rating onto the trip", async () => {
    const { db } = await runAutoEnrich([
      {
        id: "market-1",
        name: "Great Market Hall",
        status: "planned",
      },
    ]);

    assert.equal(db._trips[0].attractions[0].rating, undefined);
  });

  it("respects MAX_ITEMS_PER_TRIP", async () => {
    const attractions = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      name: `Place ${i}`,
      status: "planned",
    }));

    const { enrichCalls } = await runAutoEnrich(attractions);
    assert.equal(enrichCalls, 6);
  });
});
