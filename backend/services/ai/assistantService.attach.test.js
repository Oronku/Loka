import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_WELCOME,
  attachEphemeralToTrip,
} from "./assistantService.js";

const TRIP_ID = "c875d81e-4c15-4acf-a3e2-17a78a2e4b15";
const USER_ID = "user-1";
const USER = { id: USER_ID, email: "user@example.com", name: "Noam" };

function matchesQuery(doc, query) {
  if (!query) return true;
  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      if (!expected.some((clause) => matchesQuery(doc, clause))) return false;
      continue;
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
        const exists = doc[key] !== undefined;
        if (Boolean(expected.$exists) !== exists) return false;
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

function memoryCollection(docs) {
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
      docs.push(doc);
      return { insertedId: doc._id || `id-${docs.length}` };
    },
    insertMany: async (newDocs) => {
      const insertedIds = {};
      newDocs.forEach((doc, i) => {
        docs.push(doc);
        insertedIds[i] = doc._id || `id-${docs.length}`;
      });
      return { insertedIds, insertedCount: newDocs.length };
    },
    updateOne: async (query, update) => {
      const doc = docs.find((d) => matchesQuery(d, query));
      if (!doc) return { modifiedCount: 0, matchedCount: 0 };
      Object.assign(doc, update.$set || {});
      return { modifiedCount: 1, matchedCount: 1 };
    },
    updateMany: async (query, update) => {
      let matched = 0;
      for (const doc of docs) {
        if (!matchesQuery(doc, query)) continue;
        Object.assign(doc, update.$set || {});
        matched += 1;
      }
      return { matchedCount: matched, modifiedCount: matched };
    },
  };
}

function mockDb({ trips = [], chats = [], messages = [], proposals = [] } = {}) {
  const collections = {
    trips: memoryCollection(trips),
    chats: memoryCollection(chats),
    messages: memoryCollection(messages),
    ai_proposals: memoryCollection(proposals),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _trips: trips,
    _chats: chats,
    _messages: messages,
    _proposals: proposals,
  };
}

describe("attachEphemeralToTrip", () => {
  it("inserts history after the seeded welcome and skips a duplicate welcome", async () => {
    const db = mockDb({
      trips: [{ id: TRIP_ID, userId: USER_ID, name: "Lisbon" }],
    });

    const result = await attachEphemeralToTrip(db, USER, {
      tripId: TRIP_ID,
      history: [
        { role: "assistant", content: AI_WELCOME },
        { role: "user", content: "Lisbon in September" },
        { role: "assistant", content: "Great — I'll sketch a long weekend." },
        { role: "user", content: "" },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.tripId, TRIP_ID);
    assert.ok(result.chatId);

    const texts = db._messages.map((m) => m.text);
    assert.equal(texts[0], AI_WELCOME);
    assert.deepEqual(texts.slice(1), [
      "Lisbon in September",
      "Great — I'll sketch a long weekend.",
    ]);
    assert.equal(texts.filter((t) => t === AI_WELCOME).length, 1);

    assert.equal(db._messages[1].senderId, USER_ID);
    assert.equal(db._messages[1].senderName, "Noam");
    assert.equal(db._messages[2].senderId, "loka-bot");
    assert.equal(db._messages[2].senderName, "Loka");
    assert.ok(db._messages.every((m) => m.chatId === result.chatId));
    assert.ok(db._messages[0].timestamp.getTime() < db._messages[1].timestamp.getTime());
    assert.ok(db._messages[1].timestamp.getTime() < db._messages[2].timestamp.getTime());

    const chat = db._chats[0];
    assert.equal(chat.contextType, "ai_assistant_trip");
    assert.equal(chat.contextId, TRIP_ID);
    assert.equal(chat.lastMessage, "Great — I'll sketch a long weekend.");
  });

  it("titles the thread from the first user message when none is provided", async () => {
    const long =
      "Plan a week in Lisbon with some good food, walking tours, and a day trip to Sintra please";
    const db = mockDb({
      trips: [{ id: TRIP_ID, userId: USER_ID }],
    });

    const result = await attachEphemeralToTrip(db, USER, {
      tripId: TRIP_ID,
      history: [
        { role: "assistant", content: AI_WELCOME },
        { role: "user", content: long },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.title.length <= 61, true);
    assert.equal(result.title.startsWith("Plan a week in Lisbon"), true);
    assert.equal(result.title.endsWith("…"), true);
    assert.equal(db._chats[0].title, result.title);
    assert.equal(result.conversation.title, result.title);
    assert.equal(result.conversation.tripId, TRIP_ID);
    assert.equal(result.conversation._id, result.chatId);
  });

  it("uses a provided title instead of the first user message", async () => {
    const db = mockDb({
      trips: [{ id: TRIP_ID, userId: USER_ID }],
    });

    const result = await attachEphemeralToTrip(db, USER, {
      tripId: TRIP_ID,
      title: "Lisbon weekend",
      history: [{ role: "user", content: "Something much longer than the title" }],
    });

    assert.equal(result.ok, true);
    assert.equal(result.title, "Lisbon weekend");
    assert.equal(db._chats[0].title, "Lisbon weekend");
  });

  it("relinks orphan proposals for the user and trip", async () => {
    const db = mockDb({
      trips: [{ id: TRIP_ID, userId: USER_ID }],
      proposals: [
        { userId: USER_ID, tripId: TRIP_ID, chatId: null, status: "pending" },
        { userId: USER_ID, tripId: TRIP_ID, status: "pending" },
        { userId: USER_ID, tripId: TRIP_ID, chatId: "already-linked", status: "pending" },
        { userId: "other", tripId: TRIP_ID, chatId: null, status: "pending" },
      ],
    });

    const result = await attachEphemeralToTrip(db, USER, {
      tripId: TRIP_ID,
      history: [{ role: "user", content: "Go" }],
    });

    assert.equal(result.ok, true);
    assert.equal(db._proposals[0].chatId, result.chatId);
    assert.equal(db._proposals[1].chatId, result.chatId);
    assert.equal(db._proposals[2].chatId, "already-linked");
    assert.equal(db._proposals[3].chatId, null);
  });

  it("rejects a missing trip", async () => {
    const db = mockDb({ trips: [] });
    const result = await attachEphemeralToTrip(db, USER, {
      tripId: TRIP_ID,
      history: [{ role: "user", content: "Hi" }],
    });
    assert.deepEqual(result, { ok: false, status: 404, error: "Trip not found" });
    assert.equal(db._chats.length, 0);
    assert.equal(db._messages.length, 0);
  });

  it("rejects a trip the user does not belong to", async () => {
    const db = mockDb({
      trips: [{ id: TRIP_ID, userId: "someone-else", sharedWith: [] }],
    });
    const result = await attachEphemeralToTrip(db, USER, {
      tripId: TRIP_ID,
      history: [{ role: "user", content: "Hi" }],
    });
    assert.deepEqual(result, { ok: false, status: 403, error: "Not a trip member" });
    assert.equal(db._chats.length, 0);
  });

  it("allows a sharedWith participant to attach", async () => {
    const db = mockDb({
      trips: [
        {
          id: TRIP_ID,
          userId: "owner-1",
          sharedWith: [{ userId: USER_ID, name: "Noam" }],
        },
      ],
    });
    const result = await attachEphemeralToTrip(db, USER, {
      tripId: TRIP_ID,
      history: [{ role: "user", content: "Hi" }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.tripId, TRIP_ID);
  });
});
