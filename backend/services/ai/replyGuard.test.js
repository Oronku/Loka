import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ObjectId } from "mongodb";
import { newOperation } from "./changeset.js";
import { buildSystemPrompt } from "./prompt.js";
import {
  claimsCompletedWrite,
  honestNoProposalText,
  honestSkippedProposalText,
  settleChatProposal,
  shouldReusePending,
} from "./replyGuard.js";

const TRIP_ID = "c875d81e-4c15-4acf-a3e2-17a78a2e4b15";
const USER_ID = "user-1";
const ITEM_ID = "dinner-1";

function matchesQuery(doc, query) {
  if (!query) return true;
  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      if (!expected.some((clause) => matchesQuery(doc, clause))) return false;
      continue;
    }
    if (key === "_id") {
      if (String(doc._id) !== String(expected)) return false;
      continue;
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
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
      const insertedId = doc._id || new ObjectId();
      docs.push({ ...doc, _id: insertedId });
      return { insertedId };
    },
  };
}

function mockDb({ proposals = [], trips = [] } = {}) {
  const collections = {
    ai_proposals: memoryCollection(proposals),
    trips: memoryCollection(trips),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _proposals: proposals,
  };
}

function addDinnerOp() {
  return newOperation({
    op: "add",
    entity: "attraction",
    after: {
      id: ITEM_ID,
      name: "Dinner",
      scheduledDate: "2026-09-17",
      scheduledTime: "16:00",
    },
    label: "Dinner (2026-09-17 16:00)",
  });
}

describe("claimsCompletedWrite", () => {
  it("catches English past-tense write claims", () => {
    assert.equal(claimsCompletedWrite("I set this up for September 17th at 4:00PM."), true);
    assert.equal(claimsCompletedWrite("I set something up for you on September 17th."), true);
    assert.equal(claimsCompletedWrite("I've scheduled dinner for tomorrow."), true);
    assert.equal(claimsCompletedWrite("All set — you're booked at 16:00."), true);
    assert.equal(claimsCompletedWrite("I added it to your trip."), true);
  });

  it("catches Hebrew past-tense write claims", () => {
    assert.equal(claimsCompletedWrite("סידרתי לך משהו ב-17 בספטמבר ב-16:00"), true);
    assert.equal(claimsCompletedWrite("קבעתי לשעה ארבע"), true);
  });

  it("leaves proposal language and questions alone", () => {
    assert.equal(claimsCompletedWrite("I can put dinner on a card for Thursday."), false);
    assert.equal(claimsCompletedWrite("Want me to add this?"), false);
    assert.equal(claimsCompletedWrite("Here's a card for September 17 at 16:00."), false);
  });
});

describe("honest rewrites", () => {
  it("rewrites in the user's language", () => {
    assert.match(honestNoProposalText("I set this up."), /haven't touched/i);
    assert.match(honestNoProposalText("סידרתי לך"), /עוד לא נגעתי/);
    assert.match(
      honestSkippedProposalText("done", { reason: "already_on_item" }),
      /already on your trip/i,
    );
  });
});

describe("shouldReusePending", () => {
  it("reuses only a pending same-item skip with an id", () => {
    assert.equal(shouldReusePending({ reason: "pending_same_item", existingId: "abc" }), true);
    assert.equal(shouldReusePending({ reason: "already_on_item", existingId: "abc" }), false);
    assert.equal(shouldReusePending({ reason: "pending_same_item" }), false);
  });
});

describe("settleChatProposal", () => {
  it("rewrites a false done-claim when there are no operations", async () => {
    const settled = await settleChatProposal(mockDb(), {
      userId: USER_ID,
      result: {
        text: "I set this up for September 17th at 4:00PM.",
        operations: [],
        createsTrip: false,
        targetTripId: TRIP_ID,
      },
    });
    assert.equal(settled.changeSet, null);
    assert.match(settled.text, /haven't touched/i);
  });

  it("creates a ChangeSet and keeps the model text when tools fired", async () => {
    const db = mockDb();
    const settled = await settleChatProposal(db, {
      userId: USER_ID,
      chatId: "chat-1",
      result: {
        text: "I put dinner on a card for Thursday 16:00.",
        operations: [addDinnerOp()],
        createsTrip: false,
        targetTripId: TRIP_ID,
        tripName: "Budapest",
        rationale: "",
      },
    });
    assert.ok(settled.changeSet);
    assert.equal(settled.changeSet.status, "pending");
    assert.equal(settled.text, "I put dinner on a card for Thursday 16:00.");
    assert.equal(db._proposals.length, 1);
  });

  it("reattaches an existing pending ChangeSet instead of dropping the card", async () => {
    const existingId = new ObjectId();
    const existingOp = addDinnerOp();
    const db = mockDb({
      proposals: [
        {
          _id: existingId,
          userId: USER_ID,
          tripId: TRIP_ID,
          status: "pending",
          source: "chat",
          operations: [existingOp],
        },
      ],
    });
    const settled = await settleChatProposal(db, {
      userId: USER_ID,
      result: {
        text: "I put dinner on a card for Thursday 16:00.",
        operations: [addDinnerOp()],
        createsTrip: false,
        targetTripId: TRIP_ID,
        tripName: "Budapest",
      },
    });
    assert.equal(settled.changeSet?._id, existingId.toString());
    assert.equal(db._proposals.length, 1);
    assert.equal(settled.text, "I put dinner on a card for Thursday 16:00.");
  });

  it("does not claim a new card when the values are already on the trip", async () => {
    const db = mockDb({
      trips: [
        {
          id: TRIP_ID,
          attractions: [
            {
              id: ITEM_ID,
              name: "Dinner",
              scheduledDate: "2026-09-17",
              scheduledTime: "16:00",
            },
          ],
        },
      ],
    });
    const settled = await settleChatProposal(db, {
      userId: USER_ID,
      result: {
        text: "I set this up for September 17th at 4:00PM.",
        operations: [addDinnerOp()],
        createsTrip: false,
        targetTripId: TRIP_ID,
      },
    });
    assert.equal(settled.changeSet, null);
    assert.match(settled.text, /already on your trip/i);
  });
});

describe("system prompt trust contract", () => {
  it("forbids claiming a write before Apply", () => {
    const prompt = buildSystemPrompt({ trips: [], now: new Date("2026-09-05T12:00:00.000Z") });
    assert.match(prompt, /Nothing is added, booked, scheduled/);
    assert.match(prompt, /NEVER say you already set up/);
    assert.match(prompt, /Only propose what they actually asked for/);
  });
});
