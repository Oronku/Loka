import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newOperation } from "./changeset.js";
import {
  openingHoursCover,
  runWriteGate,
  tripPreferencesKnown,
} from "./writeGate.js";
import { buildTripAxisDocument } from "../../models/aiTripAxis.helper.js";

const TRIP_ID = "trip-write-gate";
const USER_ID = "user-write-gate";
const DATE = "2026-09-03";
const TIME = "10:00";

const THURSDAY_HOURS = {
  periods: [{ open: { day: 4, time: "0900" }, close: { day: 4, time: "1800" } }],
};

function attractionOp(name, overrides = {}) {
  return newOperation({
    op: "add",
    entity: "attraction",
    after: {
      id: `attr-${name}`,
      type: "attraction",
      name,
      scheduledDate: DATE,
      scheduledTime: TIME,
      timeConfidence: "guess",
      status: "planned",
      ...overrides,
    },
    label: `${name} (${DATE} ${TIME})`,
    provenance: {
      origin: "model_guess",
      verified: false,
      sourceUrl: null,
      note: "My best guess for now",
    },
  });
}

function baseTrip(overrides = {}) {
  return {
    id: TRIP_ID,
    name: "Rome week",
    destination: "Rome",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    attractions: [],
    intent: {},
    ...overrides,
  };
}

function checklistOp(text) {
  return newOperation({
    op: "add",
    entity: "checklist",
    after: { text, completed: false },
    label: text,
  });
}

function verifiedAttractionOp(name, overrides = {}) {
  return {
    ...attractionOp(name, { openingHours: THURSDAY_HOURS, ...overrides }),
    provenance: {
      origin: "places_cache",
      verified: true,
      sourceUrl: null,
      note: "Hours confirmed on site",
    },
  };
}

function broadItineraryOps(count = 4) {
  const names = ["Colosseum", "Forum", "Trastevere walk", "Vatican", "Pantheon", "Borghese"];
  return names.slice(0, count).map((name) => verifiedAttractionOp(name));
}

function axisDecision(field, decision = "Answered") {
  return {
    id: `dec-${field}`,
    field,
    decision,
    why: "User answered",
    source: "user_answer",
    confidence: 0.95,
    at: new Date(),
  };
}

function dayPlanAxis(overrides = {}) {
  return {
    ...buildTripAxisDocument({
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "dayPlan",
      kind: "readiness",
      title: "Day plan",
    }),
    ...overrides,
  };
}

function matchesQuery(doc, query) {
  for (const [key, expected] of Object.entries(query || {})) {
    if (key === "axisId" && expected?.$in) {
      if (!expected.$in.includes(doc.axisId)) return false;
      continue;
    }
    if (key === "gaps.id") {
      if (!(doc.gaps || []).some((g) => g.id === expected)) return false;
      continue;
    }
    if (doc[key] !== expected) return false;
  }
  return true;
}

function mockAxesDb(initialAxes = []) {
  const docs = initialAxes.map((axis) => ({
    ...axis,
    gaps: [...(axis.gaps || [])],
    decisions: [...(axis.decisions || [])],
  }));
  const collection = {
    find(query) {
      const rows = docs.filter((d) => matchesQuery(d, query));
      const api = {
        project() {
          return api;
        },
        sort() {
          return api;
        },
        toArray: async () => rows,
      };
      return api;
    },
    findOne: async (query) => docs.find((d) => matchesQuery(d, query)) || null,
    insertMany: async (rows) => {
      docs.push(...rows);
      return { insertedCount: rows.length };
    },
    updateOne: async (query, update, opts = {}) => {
      let doc = docs.find((d) => matchesQuery(d, query));
      if (!doc && opts.upsert) {
        doc = { ...(update.$setOnInsert || {}), ...query };
        docs.push(doc);
      }
      if (!doc) return { modifiedCount: 0, matchedCount: 0 };
      if (update.$push) {
        for (const [key, value] of Object.entries(update.$push)) {
          if (!Array.isArray(doc[key])) doc[key] = [];
          doc[key].push(value);
        }
      }
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) {
        for (const [key, value] of Object.entries(update.$inc)) {
          doc[key] = (doc[key] || 0) + value;
        }
      }
      return { modifiedCount: 1, matchedCount: 1 };
    },
    findOneAndUpdate: async (query, update, opts = {}) => {
      let doc = docs.find((d) => matchesQuery(d, query));
      if (!doc && opts.upsert) {
        doc = { ...(update.$setOnInsert || {}), ...query };
        if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
        if (!Array.isArray(doc.decisions)) doc.decisions = [];
        if (!Array.isArray(doc.gaps)) doc.gaps = [];
        docs.push(doc);
      }
      if (!doc) return null;
      if (update.$push) {
        for (const [key, value] of Object.entries(update.$push)) {
          if (!Array.isArray(doc[key])) doc[key] = [];
          doc[key].push(value);
        }
      }
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) {
        for (const [key, value] of Object.entries(update.$inc)) {
          doc[key] = (doc[key] || 0) + value;
        }
      }
      return opts.returnDocument === "after" ? doc : doc;
    },
  };
  return {
    collection(name) {
      if (name === "ai_trip_axes") return collection;
      return {
        findOne: async () => null,
        insertMany: async () => ({ insertedCount: 0 }),
      };
    },
  };
}

describe("openingHoursCover", () => {
  it("returns true when periods cover the proposed slot", () => {
    assert.equal(openingHoursCover(THURSDAY_HOURS, DATE, TIME), true);
  });

  it("returns false when the slot is outside listed hours", () => {
    assert.equal(openingHoursCover(THURSDAY_HOURS, DATE, "20:00"), false);
  });
});

describe("tripPreferencesKnown", () => {
  it("requires pace, vibes, and no open preference gaps on dayPlan", () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["food"] },
    });
    const axis = dayPlanAxis({
      gaps: [{ id: "g1", field: "pace", severity: 2, status: "open", kind: "preference" }],
    });
    assert.equal(tripPreferencesKnown(trip, axis), false);
    assert.equal(tripPreferencesKnown(trip, dayPlanAxis()), true);
  });

  it("ignores open verification gaps when pace and vibes are known", () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["food"] },
    });
    const axis = dayPlanAxis({
      gaps: [
        {
          id: "g-verify",
          field: "verify:Louvre@2026-09-03",
          severity: 2,
          status: "open",
          kind: "verification",
        },
      ],
    });
    assert.equal(tripPreferencesKnown(trip, axis), true);
  });

  it("treats legacy verify: gaps without kind as verification, not preference blockers", () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["food"] },
    });
    const axis = dayPlanAxis({
      gaps: [
        {
          id: "g-legacy",
          field: "verify:Secret Tour@2026-09-03",
          severity: 2,
          status: "open",
        },
      ],
    });
    assert.equal(tripPreferencesKnown(trip, axis), true);
  });

  it("still blocks on legacy preference gaps without kind", () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["food"] },
    });
    const axis = dayPlanAxis({
      gaps: [{ id: "g1", field: "pace", severity: 2, status: "open" }],
    });
    assert.equal(tripPreferencesKnown(trip, axis), false);
  });

  it("accepts recorded axis decisions when trip.intent is empty", () => {
    const trip = baseTrip({ intent: {} });
    const axis = dayPlanAxis({
      decisions: [axisDecision("pace", "Relaxed"), axisDecision("vibes", "Food & wine")],
    });
    assert.equal(tripPreferencesKnown(trip, axis), true);
    assert.equal(tripPreferencesKnown(trip, dayPlanAxis()), false);
  });
});

describe("runWriteGate", () => {
  it("suppresses broad batches without preferences and asks", async () => {
    const ops = [
      attractionOp("Colosseum"),
      attractionOp("Forum"),
      attractionOp("Trastevere walk"),
      attractionOp("Vatican"),
    ];
    const result = await runWriteGate(null, {
      operations: ops,
      trip: baseTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "ask");
    assert.ok(result.questions.length >= 1);
    assert.ok(result.questions.some((q) => q.field === "pace" || q.field === "vibes"));
  });

  it("allows broad batches when preferences are recorded", async () => {
    const ops = [
      attractionOp("Colosseum", { openingHours: THURSDAY_HOURS }),
      attractionOp("Forum", { openingHours: THURSDAY_HOURS }),
      attractionOp("Trastevere walk", { openingHours: THURSDAY_HOURS }),
      attractionOp("Vatican", { openingHours: THURSDAY_HOURS }),
    ].map((op) => ({
      ...op,
      provenance: {
        origin: "places_cache",
        verified: true,
        sourceUrl: null,
        note: "Hours confirmed on site",
      },
    }));

    const result = await runWriteGate(null, {
      operations: ops,
      trip: baseTrip({ intent: { pace: "relax", vibes: ["culture"] } }),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "allow");
    assert.equal(result.operations.length, 4);
  });

  it("downgrades unverified named venues to placeholders and opens a gap", async () => {
    const db = mockAxesDb([dayPlanAxis()]);
    const op = attractionOp("Secret Walking Tour");

    const result = await runWriteGate(db, {
      operations: [op],
      trip: baseTrip({ intent: { pace: "relax", vibes: ["culture"] } }),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
      webSearchResults: [],
    });

    assert.equal(result.action, "downgrade");
    assert.equal(result.operations.length, 1);
    assert.equal(result.operations[0].after.placeholder, true);
    assert.match(result.operations[0].after.name, /unverified|near/i);
    assert.ok(result.gaps.length >= 1);
    assert.match(result.gaps[0].field, /verify:Secret Walking Tour@2026-09-03/);
    assert.equal(result.gaps[0].kind, "verification");
  });

  it("allows a broad batch after an unverified venue opened a verification gap", async () => {
    const db = mockAxesDb([dayPlanAxis()]);
    const trip = baseTrip({ intent: { pace: "relax", vibes: ["culture"] } });

    const downgrade = await runWriteGate(db, {
      operations: [attractionOp("Secret Walking Tour")],
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
      webSearchResults: [],
    });
    assert.equal(downgrade.action, "downgrade");

    const axisAfter = await db.collection("ai_trip_axes").findOne({ tripId: TRIP_ID, axisId: "dayPlan" });
    const broad = await runWriteGate(db, {
      operations: broadItineraryOps(4),
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [axisAfter],
    });

    assert.equal(broad.action, "allow");
    assert.equal(broad.operations.length, 4);
  });

  it("keeps verified venues when cache hours cover the slot", async () => {
    const op = {
      ...attractionOp("Colosseum"),
      after: {
        ...attractionOp("Colosseum").after,
        openingHours: THURSDAY_HOURS,
      },
      provenance: {
        origin: "places_cache",
        verified: true,
        sourceUrl: null,
        note: "Hours confirmed on site",
      },
    };

    const result = await runWriteGate(null, {
      operations: [op],
      trip: baseTrip({ intent: { pace: "relax", vibes: ["culture"] } }),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "allow");
    assert.equal(result.operations[0].after.name, "Colosseum");
    assert.notEqual(result.operations[0].after.placeholder, true);
  });

  it("keeps venues backed by a web_search citation from this turn", async () => {
    const sourceUrl = "https://example.com/tours/walking";
    const op = {
      ...attractionOp("Walking Tour"),
      after: {
        ...attractionOp("Walking Tour").after,
        bookingUrl: sourceUrl,
      },
      provenance: {
        origin: "web_search",
        verified: true,
        sourceUrl,
        note: "Checked on the web today",
      },
    };

    const result = await runWriteGate(null, {
      operations: [op],
      trip: baseTrip({ intent: { pace: "relax", vibes: ["culture"] } }),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
      webSearchResults: [{ ok: true, citations: [{ url: sourceUrl, title: "Tours" }] }],
    });

    assert.equal(result.action, "allow");
    assert.equal(result.operations[0].after.name, "Walking Tour");
  });

  it("asks before scheduling saved ideas without consent", async () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["culture"] },
      attractions: [
        { id: "idea-1", name: "Cooking class", status: "idea" },
        { id: "idea-2", name: "Bike tour", status: "idea" },
      ],
    });
    const op = attractionOp("Cooking class");

    const result = await runWriteGate(null, {
      operations: [op],
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "ask");
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].multiSelect, true);
    assert.ok(result.questions[0].options.some((o) => o.label === "Cooking class"));
  });

  it("consents only ideas with explicit idea:id decisions, not prose mentions", async () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["culture"] },
      attractions: [
        { id: "idea-louvre", name: "Louvre", status: "idea" },
        { id: "idea-orsay", name: "Orsay", status: "idea" },
      ],
    });
    const axis = dayPlanAxis({
      decisions: [
        {
          id: "dec-saved",
          field: "savedIdeas",
          decision: "Louvre, skipped the Orsay",
          why: "Which saved ideas should I put on the calendar?",
          source: "user_answer",
          confidence: 0.95,
          at: new Date(),
        },
        axisDecision("idea:idea-louvre", "Louvre"),
      ],
    });

    const louvre = await runWriteGate(null, {
      operations: [verifiedAttractionOp("Louvre")],
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [axis],
    });
    assert.equal(louvre.action, "allow");

    const orsay = await runWriteGate(null, {
      operations: [verifiedAttractionOp("Orsay")],
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [axis],
    });
    assert.equal(orsay.action, "ask");
    assert.ok(orsay.questions[0].options.some((o) => o.id === "idea-orsay"));
  });

  it("allows only the two ideas the user explicitly consented to schedule", async () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["culture"] },
      attractions: [
        { id: "idea-1", name: "Cooking class", status: "idea" },
        { id: "idea-2", name: "Bike tour", status: "idea" },
        { id: "idea-3", name: "Wine tasting", status: "idea" },
        { id: "idea-4", name: "Gallery hop", status: "idea" },
      ],
    });
    const axis = dayPlanAxis({
      decisions: [
        axisDecision("idea:idea-1", "Cooking class"),
        axisDecision("idea:idea-2", "Bike tour"),
      ],
    });

    for (const name of ["Cooking class", "Bike tour"]) {
      const allowed = await runWriteGate(null, {
        operations: [verifiedAttractionOp(name)],
        trip,
        tripId: TRIP_ID,
        userId: USER_ID,
        axes: [axis],
      });
      assert.equal(allowed.action, "allow", `expected allow for ${name}`);
    }

    for (const name of ["Wine tasting", "Gallery hop"]) {
      const gated = await runWriteGate(null, {
        operations: [verifiedAttractionOp(name)],
        trip,
        tripId: TRIP_ID,
        userId: USER_ID,
        axes: [axis],
      });
      assert.equal(gated.action, "ask", `expected ask for ${name}`);
    }
  });

  it("never gates a narrow single-item request for missing preferences", async () => {
    const op = {
      ...attractionOp("Single cafe"),
      after: {
        ...attractionOp("Single cafe").after,
        openingHours: THURSDAY_HOURS,
      },
      provenance: {
        origin: "places_cache",
        verified: true,
        sourceUrl: null,
        note: "Hours confirmed on site",
      },
    };

    const result = await runWriteGate(null, {
      operations: [op],
      trip: baseTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "allow");
    assert.equal(result.operations.length, 1);
  });

  it("allows a previously gated broad batch after axis preference answers", async () => {
    const ops = broadItineraryOps(4);
    const axis = dayPlanAxis({
      decisions: [axisDecision("pace", "Relaxed"), axisDecision("vibes", "Culture")],
    });

    const result = await runWriteGate(null, {
      operations: ops,
      trip: baseTrip({ intent: {} }),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [axis],
    });

    assert.equal(result.action, "allow");
    assert.equal(result.operations.length, 4);
  });

  it("uses canonical pace option ids in preference questions", async () => {
    const result = await runWriteGate(null, {
      operations: broadItineraryOps(4),
      trip: baseTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "ask");
    const paceQuestion = result.questions.find((q) => q.field === "pace");
    assert.ok(paceQuestion);
    const paceIds = paceQuestion.options.map((o) => o.id);
    assert.ok(paceIds.includes("fullDayOfPlans"));
    assert.ok(!paceIds.includes("packed"));
  });

  it("does not preference-gate six checklist operations", async () => {
    const ops = [
      checklistOp("Passport"),
      checklistOp("Adapter"),
      checklistOp("Sunscreen"),
      checklistOp("Comfortable shoes"),
      checklistOp("Rain jacket"),
      checklistOp("Power bank"),
    ];

    const result = await runWriteGate(null, {
      operations: ops,
      trip: baseTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "allow");
    assert.equal(result.operations.length, 6);
    assert.equal(result.questions, undefined);
  });

  it("still preference-gates mixed batches that include itinerary work", async () => {
    const ops = [
      ...broadItineraryOps(4),
      checklistOp("Umbrella"),
      checklistOp("Snacks"),
    ];

    const result = await runWriteGate(null, {
      operations: ops,
      trip: baseTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
    });

    assert.equal(result.action, "ask");
    assert.ok(result.questions.some((q) => q.field === "pace" || q.field === "vibes"));
  });

  it("schedules an idea named in the user message without asking", async () => {
    const axis = dayPlanAxis();
    const db = mockAxesDb([axis]);
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["culture"] },
      attractions: [{ id: "idea-louvre", name: "Louvre", status: "idea" }],
    });
    const op = attractionOp("Louvre", { openingHours: THURSDAY_HOURS });

    const result = await runWriteGate(db, {
      operations: [op],
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [axis],
      userMessage: "Please put the Louvre on Tuesday",
    });

    assert.equal(result.action, "allow");
    assert.equal(result.operations.length, 1);
    const updatedAxis = await db.collection("ai_trip_axes").findOne({ tripId: TRIP_ID, axisId: "dayPlan" });
    assert.ok(
      (updatedAxis.decisions || []).some(
        (d) => d.field === "idea:idea-louvre" && d.source === "user_message",
      ),
    );
  });

  it("still asks consent for saved ideas not mentioned in the user message", async () => {
    const trip = baseTrip({
      intent: { pace: "relax", vibes: ["culture"] },
      attractions: [{ id: "idea-1", name: "Cooking class", status: "idea" }],
    });
    const op = attractionOp("Cooking class");

    const result = await runWriteGate(null, {
      operations: [op],
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [dayPlanAxis()],
      userMessage: "Add a few highlights to Tuesday",
    });

    assert.equal(result.action, "ask");
    assert.equal(result.questions.length, 1);
    assert.ok(result.questions[0].options.some((o) => o.label === "Cooking class"));
  });
});

describe("operation provenance shape", () => {
  it("is attached to operations and includes required fields", () => {
    const op = newOperation({
      op: "add",
      entity: "attraction",
      after: { name: "Test" },
      label: "Test",
      provenance: {
        origin: "web_search",
        verified: true,
        sourceUrl: "https://example.com",
        note: "Checked on the web today",
      },
    });

    assert.equal(op.provenance.origin, "web_search");
    assert.equal(op.provenance.verified, true);
    assert.equal(op.provenance.sourceUrl, "https://example.com");
    assert.equal(typeof op.provenance.note, "string");
  });
});
