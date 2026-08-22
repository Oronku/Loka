import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { createChangeSet, newOperation } from "./changeset.js";
import {
  afterAlreadyPresent,
  findSkipReason,
  proposalDedupKey,
  stableSerialize,
} from "./proposalDedup.js";
import autoEnrich from "./agents/autoEnrich.js";
import {
  acquireAutoEnrichLock,
  releaseAutoEnrichLock,
  resetAutoEnrichLocksForTests,
} from "./agents/locks.js";

const TRIP_ID = "c875d81e-4c15-4acf-a3e2-17a78a2e4b15";
const USER_ID = "user-1";
const ITEM_ID = "parliament-1";
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

function hoursOp(after = { openingHours: HOURS }) {
  return newOperation({
    op: "update",
    entity: "attraction",
    itemId: ITEM_ID,
    before: { openingHours: null },
    after,
    label: "Add opening hours to Parliament",
  });
}

describe("proposalDedup key", () => {
  it("is stable for the same item + fields regardless of key order", () => {
    const a = proposalDedupKey(TRIP_ID, [
      { op: "update", entity: "attraction", itemId: ITEM_ID, after: { website: "https://a", openingHours: HOURS } },
    ]);
    const b = proposalDedupKey(TRIP_ID, [
      { op: "update", entity: "attraction", itemId: ITEM_ID, after: { openingHours: HOURS, website: "https://a" } },
    ]);
    assert.equal(a, b);
    assert.match(a, new RegExp(`${TRIP_ID}\\|attraction\\|update\\|${ITEM_ID}\\|openingHours,website`));
  });

  it("treats weekday_text and weekdayText as the same hours", () => {
    assert.equal(
      stableSerialize({ weekday_text: HOURS.weekdayText }, "openingHours"),
      stableSerialize({ weekdayText: HOURS.weekdayText }, "openingHours"),
    );
  });

  it("ignores random add ids so two airport-transfer adds fingerprint the same", () => {
    const a = proposalDedupKey(TRIP_ID, [
      { op: "add", entity: "ride", after: { id: "rand-1", pickup: "BUD", dropoff: "Hotel", date: "2026-09-01", createdAt: "t1" } },
    ]);
    const b = proposalDedupKey(TRIP_ID, [
      { op: "add", entity: "ride", after: { id: "rand-2", pickup: "BUD", dropoff: "Hotel", date: "2026-09-01", createdAt: "t2" } },
    ]);
    assert.equal(a, b);
  });
});

describe("afterAlreadyPresent", () => {
  it("matches hours already on the attraction", () => {
    assert.equal(
      afterAlreadyPresent({ openingHours: HOURS, name: "Parliament" }, { openingHours: HOURS }),
      true,
    );
  });

  it("treats address and location as interchangeable", () => {
    assert.equal(
      afterAlreadyPresent({ address: "Kossuth Lajos tér 1" }, { location: "Kossuth Lajos tér 1" }),
      true,
    );
  });
});

describe("findSkipReason + createChangeSet", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");

  it("skips a second pending enrich on the same item (chat or background)", async () => {
    const db = mockDb({
      proposals: [
        {
          userId: USER_ID,
          tripId: TRIP_ID,
          status: "pending",
          source: "chat",
          operations: [hoursOp()],
        },
      ],
    });
    const skip = await findSkipReason(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      operations: [hoursOp({ openingHours: HOURS, website: "https://parlament.hu" })],
      source: "agent:auto_enrich",
      now,
    });
    assert.equal(skip?.reason, "pending_same_item");

    const created = await createChangeSet(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      source: "agent:auto_enrich",
      operations: [hoursOp()],
      now,
    });
    assert.equal(created, null);
    assert.equal(db._proposals.length, 1);
  });

  it("skips when the item already has those values", async () => {
    const db = mockDb({
      trips: [
        {
          id: TRIP_ID,
          attractions: [{ id: ITEM_ID, name: "Parliament", openingHours: HOURS }],
        },
      ],
    });
    const skip = await findSkipReason(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      operations: [hoursOp()],
      source: "agent:auto_enrich",
      now,
    });
    assert.equal(skip?.reason, "already_on_item");
  });

  it("skips when the latest applied proposal already has those after-values", async () => {
    const db = mockDb({
      trips: [
        {
          id: TRIP_ID,
          attractions: [{ id: ITEM_ID, name: "Parliament" }],
        },
      ],
      proposals: [
        {
          userId: USER_ID,
          tripId: TRIP_ID,
          status: "applied",
          appliedAt: now,
          operations: [hoursOp()],
        },
      ],
    });
    const skip = await findSkipReason(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      operations: [hoursOp()],
      source: "agent:auto_enrich",
      now,
    });
    assert.equal(skip?.reason, "already_applied");
  });

  it("skips a recently rejected background suggestion with the same fields", async () => {
    const db = mockDb({
      proposals: [
        {
          userId: USER_ID,
          tripId: TRIP_ID,
          status: "rejected",
          rejectedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          operations: [hoursOp()],
        },
      ],
    });
    const skip = await findSkipReason(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      operations: [hoursOp()],
      source: "agent:auto_enrich",
      now,
    });
    assert.equal(skip?.reason, "recently_rejected");

    const chatSkip = await findSkipReason(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      operations: [hoursOp()],
      source: "chat",
      now,
    });
    assert.equal(chatSkip, null);
  });

  it("does not treat a different field set as the same rejected suggestion", async () => {
    const db = mockDb({
      proposals: [
        {
          userId: USER_ID,
          tripId: TRIP_ID,
          status: "rejected",
          rejectedAt: now,
          operations: [hoursOp()],
        },
      ],
    });
    const skip = await findSkipReason(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      operations: [hoursOp({ website: "https://parlament.hu" })],
      source: "agent:auto_enrich",
      now,
    });
    assert.equal(skip, null);
  });
});

describe("autoEnrich already-applied hours", () => {
  beforeEach(() => {
    resetAutoEnrichLocksForTests();
  });

  it("creates 0 proposals when Parliament hours were already applied", async () => {
    const db = mockDb({
      trips: [
        {
          id: TRIP_ID,
          name: "Hila & Noam Budapest",
          attractions: [
            {
              id: ITEM_ID,
              name: "Hungarian Parliament",
              status: "planned",
              address: "Kossuth Lajos tér 1-3",
              rating: 4.7,
              placeId: "ChIJParliament",
              website: "https://www.parlament.hu",
            },
          ],
        },
      ],
      proposals: [
        {
          userId: USER_ID,
          tripId: TRIP_ID,
          status: "applied",
          appliedAt: new Date(),
          operations: [hoursOp()],
        },
      ],
    });

    const effects = await autoEnrich.run({
      db,
      user: { id: USER_ID },
      trips: db._trips,
      now: new Date(),
      tools: {
        newOperation,
        enrichPlace: async () => ({
          address: "Kossuth Lajos tér 1-3",
          rating: 4.7,
          placeId: "ChIJParliament",
          website: "https://www.parlament.hu",
          openingHours: HOURS,
        }),
        emitProposal: async (payload) =>
          createChangeSet(db, {
            tripId: payload.tripId,
            tripName: payload.tripName,
            userId: USER_ID,
            source: payload.source,
            operations: payload.operations,
            rationale: payload.text,
          }),
      },
    });

    assert.deepEqual(effects, []);
    assert.equal(db._proposals.filter((p) => p.status === "pending").length, 0);
  });
});

describe("autoEnrich in-flight lock", () => {
  beforeEach(() => {
    resetAutoEnrichLocksForTests();
  });

  it("refuses a second run for the same trip", async () => {
    const db = mockDb();
    const first = await acquireAutoEnrichLock(db, TRIP_ID);
    const second = await acquireAutoEnrichLock(db, TRIP_ID);
    assert.equal(first, true);
    assert.equal(second, false);
    await releaseAutoEnrichLock(db, TRIP_ID);
    const third = await acquireAutoEnrichLock(db, TRIP_ID);
    assert.equal(third, true);
  });
});
