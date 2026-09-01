import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { TRIP_AXES_COLLECTION, buildTripAxisDocument } from "../../models/aiTripAxis.helper.js";
import { AI_DELIBERATIONS_COLLECTION } from "../../models/aiDeliberation.helper.js";
import { QUESTION_SETS_COLLECTION } from "../../models/aiQuestionSet.helper.js";
import { AGENT_RUNS_COLLECTION } from "./agents/locks.js";
import { runWriteGate } from "./writeGate.js";
import {
  buildDeliberationProvenance,
  buildSlotsFromDecision,
  executeThinkItThrough,
  isBroadItineraryWrite,
  isBroadPlanningMessage,
  operationsFromDecisions,
  registerDeliberationFollowUp,
} from "./thinkItThrough.js";

const TRIP_ID = "trip-think-test";
const USER_ID = "user-think-1";
const NOW = new Date("2026-08-01T12:00:00.000Z");

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
    }
    if (doc[key] !== expected) return false;
  }
  return true;
}

function memoryCollection(docs, { uniqueKeys } = {}) {
  return {
    find(query) {
      let rows = docs.filter((d) => matchesQuery(d, query));
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
    findOne: async (query) => docs.find((d) => matchesQuery(d, query)) || null,
    findOneAndUpdate: async (query, update, options = {}) => {
      let doc = docs.find((d) => matchesQuery(d, query));
      if (!doc && options.upsert) {
        doc = { ...(update.$setOnInsert || {}), ...query };
        docs.push(doc);
      }
      if (!doc) return null;
      if (update.$push) {
        for (const [path, value] of Object.entries(update.$push)) {
          if (!Array.isArray(doc[path])) doc[path] = [];
          doc[path].push(value);
        }
      }
      if (update.$set) Object.assign(doc, update.$set);
      return doc;
    },
    insertOne: async (doc) => {
      if (uniqueKeys) {
        const clash = docs.some((d) => uniqueKeys.every((k) => d[k] === doc[k]));
        if (clash) {
          const err = new Error("E11000 duplicate key");
          err.code = 11000;
          throw err;
        }
      }
      docs.push({ ...doc });
      return { insertedId: `id-${docs.length}` };
    },
    insertMany: async (newDocs) => {
      for (const doc of newDocs) docs.push({ ...doc });
      return { insertedCount: newDocs.length };
    },
    updateOne: async (query, update, options = {}) => {
      let doc = docs.find((d) => matchesQuery(d, query));
      if (!doc && options.upsert) {
        doc = { ...query };
        docs.push(doc);
      }
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set) Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

function mockDb() {
  const deliberations = [];
  const runs = [];
  const axes = [
    buildTripAxisDocument({ tripId: TRIP_ID, userId: USER_ID, axisId: "dayPlan", title: "Day plan" }),
  ];
  return {
    collection(name) {
      if (name === AI_DELIBERATIONS_COLLECTION) return memoryCollection(deliberations);
      if (name === TRIP_AXES_COLLECTION) return memoryCollection(axes, { uniqueKeys: ["tripId", "axisId"] });
      if (name === QUESTION_SETS_COLLECTION) return memoryCollection([]);
      if (name === AGENT_RUNS_COLLECTION) return memoryCollection(runs, { uniqueKeys: ["userId", "key"] });
      if (name === "places_cache") return memoryCollection([]);
      return memoryCollection([]);
    },
    _runs: runs,
    _deliberations: deliberations,
  };
}

function danubeSailingIdeas({ allServeAlcohol = false } = {}) {
  const base = [
    { id: "s1", name: "Danube Budget Sail", status: "idea", price: 35, rating: 4.4, reviewCount: 80 },
    { id: "s2", name: "Blue Danube Cruise", status: "idea", price: 42, rating: 4.6, reviewCount: 210 },
    { id: "s3", name: "Sunset Danube Tour", status: "idea", price: 48, rating: 4.7, reviewCount: 340 },
    { id: "s4", name: "Classic River Sail", status: "idea", price: 52, rating: 4.5, reviewCount: 150 },
    { id: "s5", name: "Premium Danube Voyage", status: "idea", price: 58, rating: 4.8, reviewCount: 420 },
  ];
  if (allServeAlcohol) {
    return base.map((row) => ({
      ...row,
      attributes: { servesAlcohol: true, alcoholFree: false },
    }));
  }
  return base.map((row, idx) => ({
    ...row,
    attributes:
      idx === 0
        ? { alcoholFree: true, servesAlcohol: false }
        : { servesAlcohol: true, alcoholFree: false },
  }));
}

function budapestTrip(overrides = {}) {
  return {
    id: TRIP_ID,
    name: "Budapest",
    destination: "Budapest",
    startDate: "2026-09-14",
    endDate: "2026-09-18",
    destinations: [{ name: "Budapest", city: "Budapest" }],
    intent: { companions: ["spousePartner"], budgetLevel: "moderate" },
    attractions: [],
    ...overrides,
  };
}

describe("think_it_through routing helpers", () => {
  it("detects broad planning user messages", () => {
    assert.equal(
      isBroadPlanningMessage("we have a lot of empty times in the trip. help me find what to do there."),
      true,
    );
    assert.equal(isBroadPlanningMessage("what time is the flight?"), false);
  });

  it("detects bulk itinerary write tools", () => {
    assert.equal(
      isBroadItineraryWrite([{ name: "add_activities", args: { activities: [{ name: "a" }, { name: "b" }] } }]),
      true,
    );
    assert.equal(isBroadItineraryWrite([{ name: "add_attraction", args: { name: "One place" } }]), false);
  });
});

describe("executeThinkItThrough — acceptance: empty afternoons", () => {
  it("ends in a decision-flipping question with no itinerary diff when preference is unknown", async () => {
    const db = mockDb();
    const trip = budapestTrip({
      attractions: danubeSailingIdeas(),
    });

    const result = await executeThinkItThrough(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip,
      args: {
        tripId: TRIP_ID,
        decision: {
          intent: "fill empty afternoons",
          query: "Danube sailing Budapest",
          dates: ["2026-09-15"],
          time: "14:00",
          field: "alcoholPreference",
        },
      },
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.deferred, false);
    assert.equal(result.operations.length, 0, "must not produce itinerary diff");
    assert.ok(result.questions.length >= 1, "must end in a question");
    assert.equal(result.decisions.length, 1);
    assert.equal(result.decisions[0].chosen, null);
    assert.ok(result.decisions[0].shortlist.length >= 3);
    assert.ok(result.decisions[0].rejected.length >= 0);
    assert.equal(result.decisions[0].confidence, "low");
    const drinksQ = result.questions.find((q) => q.field === "alcoholPreference");
    assert.ok(drinksQ, "expected alcohol preference question");
  });

  it("produces operations with deliberation provenance when preference is known", async () => {
    const db = mockDb();
    const trip = budapestTrip({
      attractions: danubeSailingIdeas({ allServeAlcohol: true }),
    });

    const result = await executeThinkItThrough(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip,
      args: {
        tripId: TRIP_ID,
        decision: {
          intent: "fill empty afternoons",
          query: "Danube sailing Budapest",
          dates: ["2026-09-15"],
          time: "14:00",
        },
      },
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
    });

    assert.equal(result.questions.length, 0);
    assert.ok(result.operations.length >= 1);
    assert.ok(result.decisions[0].chosen);
    assert.ok(result.decisions[0].shortlist.length >= 3);
    assert.ok(["high", "medium"].includes(result.decisions[0].confidence));

    const op = result.operations[0];
    assert.ok(op.provenance?.deliberation);
    assert.equal(op.provenance.deliberation.chosen.name, result.decisions[0].chosen.name);
    assert.ok(Array.isArray(op.provenance.deliberation.shortlist));
    assert.ok(Array.isArray(op.provenance.deliberation.rejected));
    assert.ok(typeof op.provenance.deliberation.reasoning === "string");
    assert.ok(["high", "medium", "low"].includes(op.provenance.deliberation.confidence));
  });
});

describe("executeThinkItThrough return shape", () => {
  it("returns chosen, shortlist, rejected, and confidence on decisions", async () => {
    const db = mockDb();
    const slot = {
      slotId: "zoo-day",
      axisId: "dayPlan",
      label: "Afternoon activity",
      scheduledDate: "2026-09-16",
      ideaIds: ["a1", "a2", "a3"],
    };
    const trip = {
      id: TRIP_ID,
      name: "Vienna",
      destination: "Vienna",
      startDate: "2026-09-14",
      endDate: "2026-09-18",
      destinations: [{ name: "Vienna", city: "Vienna" }],
      intent: { companions: ["familyWithKids"], budgetLevel: "moderate" },
      attractions: [
        { id: "a1", name: "Kids Science Park", status: "idea", price: 20, rating: 4.5, reviewCount: 100, attributes: { kidFriendly: true } },
        { id: "a2", name: "Late Night Jazz Bar", status: "idea", price: 25, rating: 4.6, reviewCount: 90, attributes: { kidFriendly: false } },
        { id: "a3", name: "Family River Walk", status: "idea", price: 15, rating: 4.4, reviewCount: 60, attributes: { kidFriendly: true } },
      ],
    };

    const result = await executeThinkItThrough(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip,
      args: {
        tripId: TRIP_ID,
        decision: { dates: [slot.scheduledDate], time: "14:00" },
      },
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
    });

    const decision = result.decisions[0];
    assert.ok(decision);
    assert.ok(decision.chosen);
    assert.ok(decision.shortlist.length >= 2);
    assert.ok(decision.rejected.some((r) => /Jazz Bar/i.test(r.option)));
    assert.ok(["high", "medium", "low"].includes(decision.confidence));
    assert.ok(typeof decision.reasoning === "string");
  });
});

describe("write gate after deliberation", () => {
  it("still downgrades an unverified specific venue", async () => {
    const db = mockDb();
    const trip = budapestTrip({
      intent: { pace: "relax", vibes: ["culture"], priorities: ["food"] },
    });
    const decision = {
      slotId: "empty-2026-09-15-1400",
      chosen: {
        id: "x1",
        name: "Mystery Walking Tour",
        placeId: "place-1",
      },
      shortlist: [{ id: "x1", name: "Mystery Walking Tour" }],
      rejected: [{ option: "Late Bar", why: "Too late" }],
      confidence: "medium",
      reasoning: "Best fit for the afternoon",
      slotMeta: {
        scheduledDate: "2026-09-15",
        scheduledTime: "14:00",
      },
    };
    const ops = operationsFromDecisions([decision], trip);
    assert.equal(ops.length, 1);
    assert.ok(ops[0].provenance?.deliberation);

    const gate = await runWriteGate(db, {
      operations: ops,
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      webSearchResults: [],
      fromSkeleton: false,
      userMessage: "fill empty afternoons",
    });

    assert.equal(gate.action, "downgrade");
    assert.match(gate.operations[0].after.name, /open slot|somewhere/i);
  });
});

describe("async deliberation follow-up dedupe", () => {
  beforeEach(() => {
    // no shared mutable state beyond mock db instances
  });

  it("registers exactly one pending follow-up and does not duplicate it", async () => {
    const db = mockDb();
    const trip = budapestTrip();
    const args = {
      tripId: TRIP_ID,
      decision: {
        intent: "fill the whole trip",
        dates: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"],
      },
      defer: true,
    };

    const first = await registerDeliberationFollowUp(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      args,
      now: NOW,
    });
    const second = await registerDeliberationFollowUp(db, {
      userId: USER_ID,
      tripId: TRIP_ID,
      args,
      now: NOW,
    });

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(db._runs.filter((r) => r.key === `tripDeliberation:pending:${TRIP_ID}`).length, 1);

    const deferred = await executeThinkItThrough(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip,
      args,
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
    });
    assert.equal(deferred.deferred, true);
    assert.equal(deferred.operations.length, 0);
    assert.equal(db._runs.filter((r) => r.key === `tripDeliberation:pending:${TRIP_ID}`).length, 1);
  });
});

describe("buildDeliberationProvenance stable fields", () => {
  it("exposes slotId, chosen, shortlist, rejected, confidence, reasoning", () => {
    const payload = buildDeliberationProvenance({
      slotId: "slot-1",
      chosen: { id: "c1", name: "Winner" },
      shortlist: [{ id: "c1", name: "Winner" }, { id: "c2", name: "Runner" }],
      rejected: [{ option: "Late Bar", why: "Closes too early" }],
      confidence: "high",
      reasoning: "Best fit for your pace",
    });
    assert.deepEqual(Object.keys(payload).sort(), [
      "chosen",
      "confidence",
      "reasoning",
      "rejected",
      "shortlist",
      "slotId",
    ]);
  });
});

describe("buildSlotsFromDecision", () => {
  it("builds slots for empty trip days", () => {
    const trip = budapestTrip({ attractions: [{ id: "i1", name: "Idea", status: "idea" }] });
    const slots = buildSlotsFromDecision(trip, { intent: "fill empty afternoons", time: "14:00", limit: 2 });
    assert.equal(slots.length, 2);
    assert.ok(slots[0].ideaIds.includes("i1"));
    assert.equal(slots[0].scheduledTime, "14:00");
  });
});
