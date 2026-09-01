import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { TRIP_AXES_COLLECTION, buildTripAxisDocument } from "../../../models/aiTripAxis.helper.js";
import { AI_DELIBERATIONS_COLLECTION } from "../../../models/aiDeliberation.helper.js";
import { deliberate } from "./deliberate.js";
import { deriveCriteria } from "./criteria.js";
import { findDecisionFlippingUnknowns } from "./valueOfInfo.js";
import { buildScorecard } from "./scorecard.js";
import { UNKNOWN } from "./constants.js";

const TRIP_ID = "trip-deliberation-test";
const USER_ID = "user-delib-1";
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
      if (Object.prototype.hasOwnProperty.call(expected, "$regex")) {
        if (!expected.$regex.test(String(doc[key] || ""))) return false;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
        if (!expected.$in.includes(doc[key])) return false;
        continue;
      }
    }
    if (doc[key] !== expected) return false;
  }
  return true;
}

function projectFields(doc, projection) {
  if (!projection) return doc;
  const out = {};
  for (const [field, include] of Object.entries(projection)) {
    if (include) out[field] = doc[field];
  }
  return out;
}

function memoryCollection(docs, { uniqueKeys } = {}) {
  return {
    find(query) {
      let rows = docs.filter((d) => matchesQuery(d, query));
      let projection = null;
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
        limit(n) {
          rows = rows.slice(0, n);
          return api;
        },
        project(spec) {
          projection = spec;
          return api;
        },
        toArray: async () => rows.map((row) => projectFields(row, projection)),
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
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
      }
      return options.returnDocument === "after" ? doc : doc;
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
      for (const doc of newDocs) {
        docs.push({ ...doc });
      }
      return { insertedCount: newDocs.length };
    },
    updateOne: async (query, update, options = {}) => {
      let doc = docs.find((d) => matchesQuery(d, query));
      if (!doc && options.upsert) {
        doc = { ...(update.$setOnInsert || {}), ...query };
        docs.push(doc);
      }
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$push) {
        for (const [path, value] of Object.entries(update.$push)) {
          if (!Array.isArray(doc[path])) doc[path] = [];
          doc[path].push(value);
        }
      }
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

function mockDb() {
  const deliberations = [];
  const axes = [
    buildTripAxisDocument({ tripId: TRIP_ID, userId: USER_ID, axisId: "dayPlan", title: "Day plan" }),
  ];
  return {
    collection(name) {
      if (name === AI_DELIBERATIONS_COLLECTION) return memoryCollection(deliberations);
      if (name === TRIP_AXES_COLLECTION) return memoryCollection(axes, { uniqueKeys: ["tripId", "axisId"] });
      if (name === "places_cache") return memoryCollection([]);
      return memoryCollection([]);
    },
    _deliberations: deliberations,
    _axes: axes,
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

function danubeSlot() {
  return {
    slotId: "danube-sailing",
    axisId: "dayPlan",
    label: "Danube sailing",
    query: "Danube sailing Budapest",
    scheduledDate: "2026-09-15",
    field: "alcoholPreference",
    ideaIds: ["s1", "s2", "s3", "s4", "s5"],
  };
}

function coupleTrip(attractions) {
  return {
    id: TRIP_ID,
    destinations: [{ name: "Budapest", city: "Budapest" }],
    intent: { companions: ["spousePartner"], budgetLevel: "moderate" },
    attractions,
  };
}

describe("deriveCriteria", () => {
  it("infers couple-appropriate criteria from companions", () => {
    const criteria = deriveCriteria({
      slot: danubeSlot(),
      trip: coupleTrip([]),
      profile: null,
      axes: [],
      dayItems: [],
      now: NOW,
    });
    const kid = criteria.find((c) => c.id === "kid_friendly");
    const romance = criteria.find((c) => c.id === "romance_quiet");
    assert.equal(kid?.value, false);
    assert.equal(romance?.value, UNKNOWN);
    const alcohol = criteria.find((c) => c.id === "alcohol_preference");
    assert.equal(alcohol?.value, UNKNOWN);
  });
});

describe("deliberate — Danube sailing value-of-information", () => {
  it("asks about drinks when the cheapest sail is alcohol-free", async () => {
    const db = mockDb();
    const result = await deliberate(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip: coupleTrip(danubeSailingIdeas()),
      axes: [],
      profile: null,
      slots: [danubeSlot()],
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
      skipCache: true,
    });

    assert.equal(result.decisions.length, 1);
    assert.ok(result.decisions[0].shortlist?.length >= 3, "expected non-empty shortlist");
    assert.equal(result.decisions[0].chosen, null);
    assert.equal(result.questions.length, 1);
    const drinksQ = result.questions.find((q) => q.field === "alcoholPreference");
    assert.ok(drinksQ, "expected alcohol preference question");
    assert.ok(drinksQ.options.length >= 2 && drinksQ.options.length <= 4);
    assert.ok(drinksQ.options.some((o) => /drinks on board/i.test(o.label)));
    assert.ok(drinksQ.options.some((o) => /alcohol-free/i.test(o.label)));
    assert.match(drinksQ.header, /^.{1,12}$/);
  });

  it("chooses without asking when every sail serves alcohol", async () => {
    const db = mockDb();
    const result = await deliberate(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip: coupleTrip(danubeSailingIdeas({ allServeAlcohol: true })),
      axes: [],
      profile: null,
      slots: [danubeSlot()],
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
      skipCache: true,
    });

    assert.equal(result.decisions.length, 1);
    assert.ok(result.decisions[0].shortlist?.length >= 3, "expected non-empty shortlist");
    assert.ok(result.decisions[0].chosen, "expected a chosen candidate");
    assert.equal(
      result.questions.filter((q) => q.field === "alcoholPreference").length,
      0,
      "alcohol question should not appear when it cannot flip the outcome",
    );
    assert.equal(result.questions.length, 0);
  });
});

describe("deliberate — hard failures and logistics", () => {
  it("eliminates a candidate that fails a hard kid-friendly requirement", async () => {
    const db = mockDb();
    const slot = {
      slotId: "zoo-day",
      axisId: "dayPlan",
      label: "Afternoon activity",
      scheduledDate: "2026-09-16",
      ideaIds: ["a1", "a2", "a3"],
    };
    const trip = {
      destinations: [{ city: "Vienna" }],
      intent: { companions: ["familyWithKids"], budgetLevel: "moderate" },
      attractions: [
        { id: "a1", name: "Kids Science Park", status: "idea", price: 20, rating: 4.5, reviewCount: 100, attributes: { kidFriendly: true } },
        { id: "a2", name: "Late Night Jazz Bar", status: "idea", price: 25, rating: 4.6, reviewCount: 90, attributes: { kidFriendly: false } },
        { id: "a3", name: "Family River Walk", status: "idea", price: 15, rating: 4.4, reviewCount: 60, attributes: { kidFriendly: true } },
      ],
    };

    const result = await deliberate(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip,
      axes: [],
      profile: null,
      slots: [slot],
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
      skipCache: true,
    });

    const rejected = result.decisions[0]?.rejected || [];
    assert.ok(result.decisions[0]?.shortlist?.length >= 2, "expected non-empty shortlist after elimination");
    assert.ok(rejected.some((r) => /Jazz Bar/i.test(r.option)));
    assert.ok(rejected.some((r) => /kid/i.test(r.why)));
  });

  it("blocks when booking lead time is impossible", async () => {
    const db = mockDb();
    const slot = {
      slotId: "opera",
      axisId: "dayPlan",
      label: "Opera tickets",
      scheduledDate: "2026-08-05",
      ideaIds: ["o1", "o2", "o3"],
    };
    const trip = {
      destinations: [{ city: "Vienna" }],
      intent: { companions: ["spousePartner"], budgetLevel: "comfortable" },
      attractions: [
        { id: "o1", name: "State Opera Tour A", status: "idea", price: 90, rating: 4.9, reviewCount: 500, bookingRequired: true, bookingLeadDays: 14 },
        { id: "o2", name: "State Opera Tour B", status: "idea", price: 95, rating: 4.8, reviewCount: 400, bookingRequired: true, bookingLeadDays: 14 },
        { id: "o3", name: "State Opera Tour C", status: "idea", price: 100, rating: 4.7, reviewCount: 300, bookingRequired: true, bookingLeadDays: 14 },
      ],
    };

    const result = await deliberate(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip,
      axes: [],
      profile: null,
      slots: [slot],
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      skipCache: true,
    });

    assert.ok(result.blocked.length >= 1);
    assert.match(result.blocked[0].why, /hard requirement|booking/i);
  });
});

describe("deliberate — search budget and non-flipping unknowns", () => {
  it("respects the search budget cap", async () => {
    const db = mockDb();
    let searchCalls = 0;
    const slot = {
      slotId: "food-tour",
      axisId: "dayPlan",
      label: "Food tour",
      query: "Prague food tour",
      ideaIds: [],
    };
    const trip = {
      destinations: [{ city: "Prague" }],
      intent: { companions: ["justMe"], budgetLevel: "moderate" },
      attractions: [],
    };

    const result = await deliberate(db, {
      tripId: TRIP_ID,
      userId: USER_ID,
      trip,
      axes: [],
      profile: null,
      slots: [slot],
      search: async () => {
        searchCalls += 1;
        return {
          ok: true,
          text: `- Tour Alpha (€40)\n- Tour Beta (€45)\n- Tour Gamma (€50)`,
          citations: [{ url: "https://example.com/tours" }],
        };
      },
      places: async () => null,
      now: () => NOW,
      searchBudget: 1,
      skipCache: true,
    });

    assert.equal(searchCalls, 1);
    assert.equal(result.searchesUsed, 1);
    if (result.decisions.length) {
      assert.ok(
        result.decisions[0].shortlist?.length >= 3 || result.decisions[0].chosen,
        "search-derived candidates should reach deliberation",
      );
    }
  });

  it("ignores unknowns that do not change the ranking", () => {
    const slot = danubeSlot();
    const candidates = danubeSailingIdeas({ allServeAlcohol: true });
    assert.ok(candidates.length >= 3, "fixture must include multiple candidates");
    const criteria = deriveCriteria({
      slot,
      trip: coupleTrip(candidates),
      profile: null,
      axes: [],
      dayItems: [],
      now: NOW,
    });
    const { ranking } = buildScorecard(candidates.map((idea) => ({
      id: idea.id,
      name: idea.name,
      price: idea.price,
      rating: idea.rating,
      reviewCount: idea.reviewCount,
      attributes: idea.attributes,
      origin: "user_idea",
    })), criteria, slot, NOW);

    assert.ok(ranking.filter((r) => !r.eliminated).length >= 3, "ranking must have viable candidates");

    const flipping = findDecisionFlippingUnknowns(criteria, candidates.map((idea) => ({
      id: idea.id,
      name: idea.name,
      price: idea.price,
      rating: idea.rating,
      reviewCount: idea.reviewCount,
      attributes: idea.attributes,
      origin: "user_idea",
    })), ranking, slot, NOW);

    const alcoholFlip = flipping.find((f) => f.criterion.id === "alcohol_preference");
    assert.equal(alcoholFlip, undefined);
  });
});
