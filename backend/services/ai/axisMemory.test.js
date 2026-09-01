import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { CATEGORY_ORDER } from "../trip/readiness.js";
import { TRIP_AXES_COLLECTION, buildTripAxisDocument } from "../../models/aiTripAxis.helper.js";
import {
  buildAxisBrief,
  getAxes,
  openGap,
  recordDecision,
  resolveGap,
  selectRelevantAxes,
  trimNoteToBudget,
  upsertAxisNote,
} from "./axisMemory.js";

const TRIP_ID = "trip-axis-test";
const USER_ID = "user-axis-1";

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
    if (key.includes(".")) {
      const [parent, child] = key.split(".");
      const arr = doc[parent];
      if (!Array.isArray(arr) || !arr.some((row) => row[child] === expected)) return false;
      continue;
    }
    if (doc[key] !== expected) return false;
  }
  return true;
}

function memoryCollection(docs) {
  return {
    find(query) {
      let rows = docs.filter((d) => matchesQuery(d, query));
      const api = {
        sort(sortSpec) {
          const [[field, dir]] = Object.entries(sortSpec || {});
          rows = [...rows].sort((a, b) => {
            const av = a[field];
            const bv = b[field];
            if (av === bv) return 0;
            return av > bv ? (dir === -1 ? -1 : 1) : dir === -1 ? 1 : -1;
          });
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
      docs.push(doc);
      return { insertedId: doc._id || `id-${docs.length}` };
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
      if (update.$set) {
        for (const [path, value] of Object.entries(update.$set)) {
          const gapMatch = path.match(/^gaps\.\$\.(.+)$/);
          if (gapMatch && query["gaps.id"]) {
            const gap = (doc.gaps || []).find((g) => g.id === query["gaps.id"]);
            if (gap) gap[gapMatch[1]] = value;
          } else {
            doc[path] = value;
          }
        }
      }
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

function mockDb(axes = []) {
  const collections = {
    [TRIP_AXES_COLLECTION]: memoryCollection(axes),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _axes: axes,
  };
}

describe("getAxes readiness seeding", () => {
  it("seeds nine readiness axes from CATEGORY_ORDER", async () => {
    const db = mockDb();
    const axes = await getAxes(db, TRIP_ID, USER_ID);
    assert.equal(axes.length, CATEGORY_ORDER.length);
    for (const axisId of CATEGORY_ORDER) {
      const axis = axes.find((a) => a.axisId === axisId);
      assert.ok(axis, `missing axis ${axisId}`);
      assert.equal(axis.kind, "readiness");
    }
  });
});

describe("upsertAxisNote", () => {
  /** @type {ReturnType<typeof mockDb>} */
  let db;

  beforeEach(() => {
    db = mockDb();
  });

  it("creates then updates a custom axis note", async () => {
    const created = await upsertAxisNote(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "custom:kids-nap",
      title: "Kids nap schedule",
      note: "Nap after lunch.",
      summary: "Afternoon nap",
      status: "working",
    });
    assert.ok(created);
    assert.equal(created.note, "Nap after lunch.");
    assert.equal(created.charLimit, 800);

    const updated = await upsertAxisNote(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "custom:kids-nap",
      note: "Nap after lunch, quiet hotel room.",
      summary: "Afternoon nap window",
    });
    assert.equal(updated.note, "Nap after lunch, quiet hotel room.");
    assert.equal(updated.summary, "Afternoon nap window");
  });

  it("trimNoteToBudget enforces readiness char limit without network", async () => {
    const longNote = "A".repeat(1500);
    const trimmed = await trimNoteToBudget(longNote, 1200);
    assert.ok(trimmed.length <= 1200, `expected <=1200 chars, got ${trimmed.length}`);
    assert.notEqual(trimmed, longNote);

    const viaUpsert = await upsertAxisNote(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "stay",
      note: longNote,
    });
    assert.ok(viaUpsert.note.length <= 1200);
  });
});

describe("recordDecision", () => {
  it("appends a decision with rejected options and source", async () => {
    const db = mockDb();
    await getAxes(db, TRIP_ID, USER_ID);

    const { axis, decision } = await recordDecision(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "stay",
      decision: "Boutique hotel near old town",
      why: "User prefers walkable area",
      rejected: [{ option: "Airport hotel", why: "Too far from sights" }],
      source: "user_answer",
      confidence: 0.95,
      field: "hotelChoice",
    });

    assert.equal(decision.source, "user_answer");
    assert.deepEqual(decision.rejected, [
      { option: "Airport hotel", why: "Too far from sights" },
    ]);
    assert.equal(axis.decisions.length, 1);
    assert.equal(axis.decisions[0].field, "hotelChoice");
  });
});

describe("gap open and resolve", () => {
  /** @type {ReturnType<typeof mockDb>} */
  let db;

  beforeEach(async () => {
    db = mockDb();
    await getAxes(db, TRIP_ID, USER_ID);
  });

  it("dedupes open gaps on the same field", async () => {
    const first = await openGap(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "stay",
      field: "hotelChoice",
      severity: 2,
      evidence: "No hotel booked",
    });
    const second = await openGap(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "stay",
      field: "hotelChoice",
      severity: 3,
    });
    assert.equal(first.id, second.id);

    const axis = await db.collection(TRIP_AXES_COLLECTION).findOne({ tripId: TRIP_ID, axisId: "stay" });
    const open = (axis.gaps || []).filter((g) => g.status === "open" && g.field === "hotelChoice");
    assert.equal(open.length, 1);
  });

  it("persists gap kind on openGap", async () => {
    const gap = await openGap(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "dayPlan",
      field: "verify:Louvre@2026-09-03",
      severity: 2,
      kind: "verification",
      evidence: "Could not confirm hours",
    });
    assert.equal(gap.kind, "verification");

    const axis = await db.collection(TRIP_AXES_COLLECTION).findOne({ tripId: TRIP_ID, axisId: "dayPlan" });
    const stored = (axis.gaps || []).find((g) => g.id === gap.id);
    assert.equal(stored.kind, "verification");
  });

  it("resolveGap flips status to resolved", async () => {
    const gap = await openGap(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "travel",
      field: "outboundFlight",
      severity: 3,
    });
    await resolveGap(db, {
      tripId: TRIP_ID,
      axisId: "travel",
      gapId: gap.id,
      resolvedByQuestionId: "qs-1",
    });
    const axis = await db.collection(TRIP_AXES_COLLECTION).findOne({ tripId: TRIP_ID, axisId: "travel" });
    const resolved = axis.gaps.find((g) => g.id === gap.id);
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.resolvedByQuestionId, "qs-1");
  });
});

describe("selectRelevantAxes", () => {
  function buildAxes() {
    return CATEGORY_ORDER.map((axisId, i) =>
      buildTripAxisDocument({
        tripId: TRIP_ID,
        userId: USER_ID,
        axisId,
        kind: "readiness",
        title: axisId,
        summary: `${axisId} summary`,
        status: i === 0 ? "working" : i === 1 ? "blocked" : "idle",
      }),
    );
  }

  it("returns at most three full axes prioritizing working, blocked, and nextUp", () => {
    const axes = buildAxes();
    const readiness = { nextUp: ["dayPlan"] };
    const { fullIds } = selectRelevantAxes(axes, { readiness, maxFull: 3 });

    assert.ok(fullIds.size <= 3);
    assert.ok(fullIds.has("basics"));
    assert.ok(fullIds.has("intent"));
    assert.ok(fullIds.has("dayPlan"));
  });

  it("boosts axes mentioned in the user message", () => {
    const axes = buildAxes().map((a) => ({ ...a, status: "idle" }));
    const { fullIds } = selectRelevantAxes(axes, {
      userMessage: "Let's figure out transport options",
      maxFull: 3,
    });
    assert.ok(fullIds.has("transport"));
  });
});

describe("buildAxisBrief", () => {
  it("includes open severity-2+ gaps on brief lines", () => {
    const axis = buildTripAxisDocument({
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId: "stay",
      summary: "Need a hotel",
      status: "blocked",
    });
    axis.gaps = [
      {
        id: "g1",
        field: "hotelChoice",
        severity: 2,
        status: "open",
        blocks: [],
        evidence: "",
        askedCount: 0,
        lastAskedAt: null,
        resolvedByQuestionId: null,
      },
    ];
    const axes = [axis];
    const brief = buildAxisBrief(axes, { fullIds: new Set(), charBudget: 2400 });
    assert.match(brief, /stay \[blocked\]/);
    assert.match(brief, /gaps: hotelChoice\(sev2\)/);
  });
});
