import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { ObjectId } from "mongodb";
import { TRIP_AXES_COLLECTION, buildTripAxisDocument } from "../../models/aiTripAxis.helper.js";
import {
  QUESTION_SETS_COLLECTION,
  buildQuestionSetDocument,
} from "../../models/aiQuestionSet.helper.js";
import { answerQuestionSet } from "./questions.js";

const TRIP_ID = "trip-answer-test";
const USER_ID = "user-answer-1";
const SOMETHING_ELSE_OPTION_ID = "__something_else__";

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
    updateOne: async (query, update, options = {}) => {
      let doc = docs.find((d) => matchesQuery(d, query));
      if (!doc && options.upsert) {
        doc = { ...(update.$setOnInsert || {}), ...query };
        if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
        docs.push(doc);
      }
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };

      if (update.$push) {
        for (const [field, value] of Object.entries(update.$push)) {
          doc[field] = [...(doc[field] || []), value];
        }
      }
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) {
        for (const [field, delta] of Object.entries(update.$inc)) {
          doc[field] = (doc[field] || 0) + delta;
        }
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    findOneAndUpdate: async (query, update, options = {}) => {
      let doc = docs.find((d) => matchesQuery(d, query));
      if (!doc && options.upsert) {
        doc = { ...(update.$setOnInsert || {}), ...query };
        if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
        docs.push(doc);
      }
      if (!doc) return null;

      if (update.$push) {
        for (const [field, value] of Object.entries(update.$push)) {
          doc[field] = [...(doc[field] || []), value];
        }
      }
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) {
        for (const [field, delta] of Object.entries(update.$inc)) {
          doc[field] = (doc[field] || 0) + delta;
        }
      }
      return options.returnDocument === "after" ? doc : doc;
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

function pendingQuestionSet(overrides = {}) {
  return buildQuestionSetDocument({
    tripId: TRIP_ID,
    userId: USER_ID,
    status: "pending",
    questions: [
      {
        id: "q1",
        question: "Where should we stay?",
        header: "Hotel",
        axisId: "stay",
        gapId: null,
        field: "hotelChoice",
        multiSelect: false,
        options: [
          { id: "o1", label: "Old town" },
          { id: "o2", label: "Near station" },
        ],
      },
    ],
    ...overrides,
  });
}

describe("answerQuestionSet", () => {
  /** @type {ReturnType<typeof mockDb>} */
  let db;
  /** @type {string} */
  let questionSetId;

  beforeEach(async () => {
    const qs = pendingQuestionSet();
    qs._id = new ObjectId();
    db = mockDb({ questionSets: [qs] });
    questionSetId = qs._id.toString();
  });

  it("records customText for the something-else sentinel instead of the placeholder label", async () => {
    const customText = "A quiet riad in the medina";
    const result = await answerQuestionSet(db, questionSetId, USER_ID, [
      {
        questionId: "q1",
        optionIds: [SOMETHING_ELSE_OPTION_ID],
        labels: ["Something else"],
        customText,
      },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.syntheticMessage, `Hotel: ${customText}`);
    assert.equal(result.questionSet.status, "answered");
    assert.equal(result.questionSet.answers.length, 1);
    assert.equal(result.questionSet.answers[0].customText, customText);
    assert.deepEqual(result.questionSet.answers[0].labels, []);

    const stay = db._axes.find((a) => a.axisId === "stay");
    assert.equal(stay.decisions.length, 1);
    assert.equal(stay.decisions[0].decision, customText);
    assert.equal(stay.decisions[0].source, "user_answer");
  });

  it("derives decision text from real option labels when no customText is sent", async () => {
    const result = await answerQuestionSet(db, questionSetId, USER_ID, [
      {
        questionId: "q1",
        optionIds: ["o1"],
        labels: ["Old town"],
      },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.syntheticMessage, "Hotel: Old town");
    assert.equal(result.questionSet.answers[0].customText, null);

    const stay = db._axes.find((a) => a.axisId === "stay");
    assert.equal(stay.decisions[0].decision, "Old town");
  });

  it("records per-idea consent decisions when answering savedIdeas", async () => {
    const qs = pendingQuestionSet({
      questions: [
        {
          id: "q-ideas",
          question: "Which saved ideas should I put on the calendar?",
          header: "Ideas",
          axisId: "dayPlan",
          gapId: "schedule-saved-ideas",
          field: "savedIdeas",
          multiSelect: true,
          options: [
            { id: "idea-1", label: "Cooking class" },
            { id: "idea-2", label: "Bike tour" },
            { id: "idea-3", label: "Wine tasting" },
            { id: "idea-4", label: "Gallery hop" },
          ],
        },
      ],
    });
    qs._id = new ObjectId();
    db = mockDb({ questionSets: [qs] });
    questionSetId = qs._id.toString();

    const result = await answerQuestionSet(db, questionSetId, USER_ID, [
      {
        questionId: "q-ideas",
        optionIds: ["idea-1", "idea-2"],
        labels: ["Cooking class", "Bike tour"],
      },
    ]);

    assert.equal(result.ok, true);
    const dayPlan = db._axes.find((a) => a.axisId === "dayPlan");
    const ideaFields = (dayPlan.decisions || [])
      .filter((d) => d.field?.startsWith("idea:"))
      .map((d) => d.field);
    assert.deepEqual(ideaFields.sort(), ["idea:idea-1", "idea:idea-2"]);
    assert.ok((dayPlan.decisions || []).some((d) => d.field === "savedIdeas"));
    assert.equal(
      (dayPlan.decisions || []).filter((d) => d.field?.startsWith("idea:")).length,
      2,
    );
  });
});
