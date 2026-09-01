import assert from "node:assert/strict";
import { describe, it } from "node:test";
import integrityMonitor from "./integrityMonitor.js";

const TRIP_ID = "trip-integrity-agent";
const USER_ID = "user-integrity-agent";

function memoryCollection(docs, { uniqueKeys } = {}) {
  const filter = (query) =>
    docs.filter((d) =>
      Object.entries(query || {}).every(([k, v]) => {
        if (v && typeof v === "object" && v.$in) return v.$in.includes(d[k]);
        return d[k] === v;
      }),
    );

  return {
    find(query) {
      let rows = filter(query);
      const api = {
        sort() {
          return api;
        },
        limit() {
          return api;
        },
        project() {
          return api;
        },
        toArray: async () => rows,
      };
      return api;
    },
    findOne: async (query) =>
      docs.find((d) => Object.entries(query).every(([k, v]) => d[k] === v)) || null,
    insertOne: async (doc) => {
      if (uniqueKeys) {
        const clash = docs.some((d) => uniqueKeys.every((k) => d[k] === doc[k]));
        if (clash) throw new Error("duplicate");
      }
      docs.push(doc);
      return { insertedId: doc._id || `id-${docs.length}` };
    },
    updateOne: async (query, update, options = {}) => {
      let doc = docs.find((d) => Object.entries(query).every(([k, v]) => d[k] === v));
      if (!doc && options.upsert) {
        doc = { ...query, ...(update.$set || {}) };
        docs.push(doc);
        return { modifiedCount: 1, upsertedCount: 1 };
      }
      if (!doc) return { modifiedCount: 0 };
      Object.assign(doc, update.$set || {});
      return { modifiedCount: 1 };
    },
    insertMany: async (rows) => {
      docs.push(...rows);
    },
  };
}

function mockDb({ trips = [], runs = [], axes = [] } = {}) {
  const collections = {
    trips: memoryCollection(trips),
    ai_agent_runs: memoryCollection(runs, { uniqueKeys: ["userId", "key"] }),
    ai_trip_axes: memoryCollection(axes),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _runs: runs,
  };
}

function unhousedTrip() {
  return {
    id: TRIP_ID,
    name: "Rome gap",
    destination: "Rome",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    hotels: [{ id: "h1", name: "Centro", checkIn: "2026-09-01", checkOut: "2026-09-05" }],
    flights: [],
    attractions: [],
  };
}

async function runAgent(db, { now = new Date("2026-08-30T10:00:00.000Z") } = {}) {
  const messages = [];
  const runs = [];

  const tools = {
    async emitMessage(payload) {
      messages.push(payload);
      return payload;
    },
    async hasRecentRun(key, withinMs) {
      const doc = db._runs.find((r) => r.userId === USER_ID && r.key === key);
      if (!doc?.lastAt) return false;
      return now.getTime() - new Date(doc.lastAt).getTime() < withinMs;
    },
    async recordRun(key, meta = {}) {
      const existing = db._runs.find((r) => r.userId === USER_ID && r.key === key);
      if (existing) {
        Object.assign(existing, { lastAt: now, ...meta });
      } else {
        db._runs.push({ userId: USER_ID, key, lastAt: now, ...meta });
      }
    },
  };

  const effects = await integrityMonitor.run({
    db,
    user: { id: USER_ID },
    trips: [unhousedTrip()],
    now,
    tools,
  });

  return { effects, messages };
}

describe("integrityMonitor agent", () => {
  it("raises a blocking finding once and does not re-raise on the next run", async () => {
    const db = mockDb();
    const first = await runAgent(db);
    assert.equal(first.messages.length, 1);
    assert.match(first.messages[0].text, /Rome gap|night|stay|hotel/i);
    assert.equal(first.effects.length, 1);

    const second = await runAgent(db);
    assert.equal(second.messages.length, 0);
    assert.equal(second.effects.length, 0);
  });
});
