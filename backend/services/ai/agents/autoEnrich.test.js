import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { createChangeSet, newOperation } from "../changeset.js";
import autoEnrich from "./autoEnrich.js";
import { resetAutoEnrichLocksForTests } from "./locks.js";

const TRIP_ID = "c875d81e-4c15-4acf-a3e2-17a78a2e4b15";
const USER_ID = "user-1";
const HOURS = { weekdayText: ["Monday: 8:00 AM – 6:00 PM"] };

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
    updateOne: async (query, update) => {
      const doc = docs.find((d) => matchesQuery(d, query));
      if (!doc) return { modifiedCount: 0, matchedCount: 0 };
      Object.assign(doc, update.$set || {});
      return { modifiedCount: 1, matchedCount: 1 };
    },
  };
}

function mockDb({ proposals = [], trips = [], runs = [] } = {}) {
  const collections = {
    ai_proposals: memoryCollection(proposals),
    trips: memoryCollection(trips),
    ai_agent_runs: memoryCollection(runs, { uniqueKeys: ["userId", "key"] }),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _proposals: proposals,
    _trips: trips,
    _runs: runs,
  };
}

const GOOGLE_PLACE = {
  address: "Vámház körút 1-3, Budapest",
  rating: 4.6,
  placeId: "ChIJChimneyCake",
  website: "https://example.com",
  openingHours: HOURS,
  lat: 47.485,
  lng: 19.059,
};

async function runAutoEnrich(attractions, { enrichPlace } = {}) {
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
  const payloads = [];

  const effects = await autoEnrich.run({
    db,
    user: { id: USER_ID },
    trips: db._trips,
    now: new Date(),
    tools: {
      newOperation,
      enrichPlace: async (...args) => {
        enrichCalls += 1;
        if (enrichPlace) return enrichPlace(...args);
        return GOOGLE_PLACE;
      },
      emitProposal: async (payload) => {
        payloads.push(payload);
        return createChangeSet(db, {
          tripId: payload.tripId,
          tripName: payload.tripName,
          userId: USER_ID,
          source: payload.source,
          operations: payload.operations,
          rationale: payload.text,
        });
      },
    },
  });

  return { db, effects, enrichCalls, payloads };
}

describe("autoEnrich skips notes and unscheduled ideas", () => {
  beforeEach(() => {
    resetAutoEnrichLocksForTests();
  });

  it("does not Google a note named chimney cake workshops", async () => {
    const { effects, enrichCalls, db } = await runAutoEnrich([
      {
        id: "note-1",
        name: "chimney cake workshops",
        type: "note",
      },
    ]);

    assert.deepEqual(effects, []);
    assert.equal(enrichCalls, 0);
    assert.equal(db._proposals.length, 0);
  });

  it("does not Google an idea-status attraction missing address", async () => {
    const { effects, enrichCalls, db } = await runAutoEnrich([
      {
        id: "idea-1",
        name: "Szimpla Kert",
        type: "attraction",
        status: "idea",
      },
    ]);

    assert.deepEqual(effects, []);
    assert.equal(enrichCalls, 0);
    assert.equal(db._proposals.length, 0);
  });
});

describe("autoEnrich never writes Google rating onto the trip", () => {
  beforeEach(() => {
    resetAutoEnrichLocksForTests();
  });

  it("emits nothing when a planned stop is missing only rating", async () => {
    const { effects, enrichCalls, db } = await runAutoEnrich([
      {
        id: "parliament-1",
        name: "Hungarian Parliament",
        status: "planned",
        placeId: "ChIJParliament",
        address: "Kossuth Lajos tér 1-3",
        website: "https://www.parlament.hu",
        openingHours: HOURS,
      },
    ]);

    assert.deepEqual(effects, []);
    assert.equal(enrichCalls, 0);
    assert.equal(db._proposals.length, 0);
  });

  it("proposes address for a planned stop and leaves rating off the trip", async () => {
    const { effects, enrichCalls, payloads, db } = await runAutoEnrich([
      {
        id: "market-1",
        name: "Great Market Hall",
        status: "planned",
        placeId: "ChIJMarket",
        website: "https://example.com",
        openingHours: HOURS,
      },
    ]);

    assert.equal(enrichCalls, 1);
    assert.equal(effects.length, 1);
    assert.equal(db._proposals.length, 1);
    assert.equal(payloads.length, 1);

    const { after, before, label } = payloads[0].operations[0];
    assert.equal(after.address, GOOGLE_PLACE.address);
    assert.equal(after.rating, undefined);
    assert.equal(before.rating, undefined);
    assert.equal(/rating/i.test(payloads[0].text), false);
    assert.equal(/rating/i.test(label), false);
  });
});
