import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { ObjectId } from "mongodb";
import { TRIP_AXES_COLLECTION, buildTripAxisDocument } from "../../models/aiTripAxis.helper.js";
import {
  QUESTION_SETS_COLLECTION,
  buildQuestionSetDocument,
} from "../../models/aiQuestionSet.helper.js";
import { GAP_ASK_COOLDOWN_MS } from "./axisMemory.js";
import {
  createQuestionSet,
  sanitizeQuestionSet,
} from "./questions.js";

const TRIP_ID = "trip-questions-test";
const USER_ID = "user-questions-1";
const NOW = new Date("2026-08-30T12:00:00.000Z");

function matchesQuery(doc, query) {
  if (!query) return true;
  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      if (!expected.some((clause) => matchesQuery(doc, clause))) return false;
      continue;
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
        if (!expected.$in.includes(doc[key])) return false;
        continue;
      }
    }
    if (key === "_id") {
      const docId = doc._id instanceof ObjectId ? doc._id.toString() : String(doc._id);
      const queryId = expected instanceof ObjectId ? expected.toString() : String(expected);
      if (docId !== queryId) return false;
      continue;
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
        project() {
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
      const withId = { ...doc, _id: doc._id || new ObjectId() };
      docs.push(withId);
      return { insertedId: withId._id };
    },
    insertMany: async (toInsert) => {
      docs.push(...toInsert);
      return { insertedCount: toInsert.length };
    },
    updateOne: async (query, update) => {
      const doc = docs.find((d) => matchesQuery(d, query));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set) Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

function seedReadinessAxes() {
  return ["basics", "stay", "dayPlan", "travel"].map((axisId) =>
    buildTripAxisDocument({
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId,
      kind: "readiness",
      title: axisId,
    }),
  );
}

function mockDb({ axes = seedReadinessAxes(), questionSets = [] } = {}) {
  const collections = {
    [TRIP_AXES_COLLECTION]: memoryCollection(axes),
    [QUESTION_SETS_COLLECTION]: memoryCollection(questionSets),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _axes: axes,
    _questionSets: questionSets,
  };
}

function baseQuestion(overrides = {}) {
  return {
    id: "q1",
    question: "Where should we stay?",
    header: "Hotel",
    axisId: "stay",
    gapId: "gap-1",
    field: "hotelChoice",
    options: [
      { id: "o1", label: "Old town" },
      { id: "o2", label: "Near station" },
    ],
    ...overrides,
  };
}

describe("sanitizeQuestionSet shape limits", () => {
  it("keeps at most three questions and clamps options to 2-4", async () => {
    const db = mockDb();
    const raw = [
      baseQuestion({ id: "q1", header: "Hotel" }),
      baseQuestion({ id: "q2", header: "Area", axisId: "dayPlan", field: "dayShape" }),
      baseQuestion({ id: "q3", header: "Fly", axisId: "travel", field: "outboundFlight" }),
      baseQuestion({ id: "q4", header: "Extra", axisId: "basics", field: "dates" }),
    ];
    raw[0].options = [
      { id: "o1", label: "A" },
      { id: "o2", label: "B" },
      { id: "o3", label: "C" },
      { id: "o4", label: "D" },
      { id: "o5", label: "E" },
    ];

    const result = await sanitizeQuestionSet(db, raw, { tripId: TRIP_ID, userId: USER_ID });
    assert.equal(result.ok, true);
    assert.equal(result.questions.length, 3);
    assert.equal(result.questions[0].options.length, 4);
  });

  it("truncates header beyond 12 characters", async () => {
    const db = mockDb();
    const result = await sanitizeQuestionSet(
      db,
      [baseQuestion({ header: "VeryLongHeaderLabel" })],
      { tripId: TRIP_ID, userId: USER_ID },
    );
    assert.equal(result.ok, true);
    assert.equal(result.questions[0].header, "VeryLongHead");
    assert.equal(result.questions[0].header.length, 12);
  });
});

describe("sanitizeQuestionSet grounding and suppression", () => {
  it("strips Other / Something else style options", async () => {
    const db = mockDb();
    const result = await sanitizeQuestionSet(
      db,
      [
        baseQuestion({
          options: [
            { id: "o1", label: "Old town" },
            { id: "o2", label: "Something else" },
            { id: "o3", label: "Near station" },
          ],
        }),
      ],
      { tripId: TRIP_ID, userId: USER_ID },
    );
    assert.equal(result.ok, true);
    const labels = result.questions[0].options.map((o) => o.label);
    assert.deepEqual(labels, ["Old town", "Near station"]);
  });

  it("drops questions with an unresolvable axisId", async () => {
    const db = mockDb();
    const result = await sanitizeQuestionSet(
      db,
      [baseQuestion({ axisId: "nonexistent-axis" })],
      { tripId: TRIP_ID, userId: USER_ID },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "all questions filtered");
  });

  it("drops questions whose field already has a recorded decision", async () => {
    const axes = seedReadinessAxes();
    const stay = axes.find((a) => a.axisId === "stay");
    stay.decisions = [
      {
        id: "d1",
        decision: "Old town boutique",
        field: "hotelChoice",
        source: "user_answer",
        at: NOW,
      },
    ];
    const db = mockDb({ axes });
    const result = await sanitizeQuestionSet(
      db,
      [baseQuestion({ field: "hotelChoice" })],
      { tripId: TRIP_ID, userId: USER_ID },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "all questions filtered");
  });

  it("suppresses questions when the linked gap is on cooldown", async () => {
    const axes = seedReadinessAxes();
    const stay = axes.find((a) => a.axisId === "stay");
    const gapId = "gap-cooldown";
    stay.gaps = [
      {
        id: gapId,
        field: "hotelChoice",
        severity: 2,
        status: "open",
        blocks: [],
        evidence: "",
        askedCount: 1,
        lastAskedAt: new Date(NOW.getTime() - GAP_ASK_COOLDOWN_MS + 24 * 60 * 60 * 1000),
        resolvedByQuestionId: null,
      },
    ];
    const db = mockDb({ axes });
    const result = await sanitizeQuestionSet(
      db,
      [baseQuestion({ gapId, field: "hotelChoice" })],
      { tripId: TRIP_ID, userId: USER_ID },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "all questions filtered");
  });
});

describe("one pending question set per trip", () => {
  /** @type {ReturnType<typeof mockDb>} */
  let db;

  beforeEach(() => {
    db = mockDb({
      questionSets: [
        buildQuestionSetDocument({
          tripId: TRIP_ID,
          userId: USER_ID,
          questions: [baseQuestion()],
        }),
      ],
    });
  });

  it("refuses sanitize when a pending set already exists", async () => {
    const result = await sanitizeQuestionSet(
      db,
      [baseQuestion({ id: "q-new" })],
      { tripId: TRIP_ID, userId: USER_ID },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "pending set exists");
  });

  it("returns null from createQuestionSet when a pending set already exists", async () => {
    const created = await createQuestionSet(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      questions: [baseQuestion({ id: "q-new" })],
    });
    assert.equal(created, null);
    assert.equal(db._questionSets.length, 1);
  });
});
