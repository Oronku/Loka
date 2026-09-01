import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { randomUUID } from "crypto";
import { buildFinding } from "../integrity/types.js";
import { computeUrgency, sortFindings } from "../integrity/urgency.js";
import { TRIP_AXES_COLLECTION, buildTripAxisDocument } from "../../../models/aiTripAxis.helper.js";
import { AI_DELIBERATIONS_COLLECTION } from "../../../models/aiDeliberation.helper.js";
import { QUESTION_SETS_COLLECTION } from "../../../models/aiQuestionSet.helper.js";
import { resolveFindings } from "./resolveFindings.js";
import { buildStayValueOfInfoDeliberation } from "./resolvers/stay.js";
import { codeResolverMap } from "./registry.js";

const TRIP_ID = "trip-resolution-test";
const USER_ID = "user-res-1";
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
        toArray: async () => rows.map((row) => {
          if (!projection) return row;
          const out = {};
          for (const [field, include] of Object.entries(projection)) {
            if (include) out[field] = row[field];
          }
          return out;
        }),
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
      if (update.$set) Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

function mockDb() {
  const deliberations = [];
  const axes = [
    buildTripAxisDocument({ tripId: TRIP_ID, userId: USER_ID, axisId: "stay", title: "Stay" }),
    buildTripAxisDocument({ tripId: TRIP_ID, userId: USER_ID, axisId: "dayPlan", title: "Day plan" }),
    buildTripAxisDocument({ tripId: TRIP_ID, userId: USER_ID, axisId: "money", title: "Money" }),
    buildTripAxisDocument({ tripId: TRIP_ID, userId: USER_ID, axisId: "entryRequirements", title: "Entry" }),
  ];
  return {
    collection(name) {
      if (name === AI_DELIBERATIONS_COLLECTION) return memoryCollection(deliberations);
      if (name === TRIP_AXES_COLLECTION) return memoryCollection(axes, { uniqueKeys: ["tripId", "axisId"] });
      if (name === QUESTION_SETS_COLLECTION) return memoryCollection([]);
      if (name === "places_cache") return memoryCollection([]);
      return memoryCollection([]);
    },
  };
}

function budapestTrip(overrides = {}) {
  return {
    id: TRIP_ID,
    destinations: [{ name: "Budapest", city: "Budapest" }],
    startDate: "2026-09-14",
    endDate: "2026-09-18",
    intent: {
      companions: ["spousePartner"],
      budgetLevel: "moderate",
      priorities: ["culture", "food"],
    },
    budget: { totalBudget: 2000, currency: "USD" },
    hotels: [],
    attractions: [],
    ...overrides,
  };
}

function findingWithUrgency(partial) {
  const base = buildFinding(partial);
  return { ...base, urgency: computeUrgency(base, NOW) };
}

describe("resolveFindings — unhoused_nights", () => {
  it("produces candidate stays for exact uncovered dates and a reasoned choice", async () => {
    const db = mockDb();
    let searchCalls = 0;
    const finding = findingWithUrgency({
      code: "unhoused_nights",
      axisIds: ["stay"],
      kind: "broken",
      severity: 3,
      blocking: true,
      title: "Nights without a place to stay",
      detail: "No hotel covers 2026-09-15, 2026-09-16.",
      titleKey: "t",
      detailKey: "d",
      evidence: [
        { what: "uncoveredNight", value: "2026-09-15", source: "trip.hotels" },
        { what: "uncoveredNight", value: "2026-09-16", source: "trip.hotels" },
      ],
      resolution: { kind: "propose_change", hint: "Add hotel" },
    });

    const result = await resolveFindings(db, {
      trip: budapestTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      axes: [],
      findings: [finding],
      search: async () => {
        searchCalls += 1;
        return {
          ok: true,
          text: "- Hotel Central Budapest (€65)\n- Danube View Inn (€60)\n- Pest Side Hotel (€70)",
          citations: [{ url: "https://example.com/hotels" }],
        };
      },
      places: async () => null,
      now: () => NOW,
      searchBudget: 3,
    });

    assert.equal(result.resolutions.length, 1);
    const res = result.resolutions[0];
    assert.equal(res.finding.code, "unhoused_nights");
    assert.equal(res.kind, "proposed");
    assert.ok(res.decision?.chosen || res.operations?.length, "expected a chosen stay or operation");
    assert.ok(res.reasoning || res.decision?.reasoning);
    assert.ok(searchCalls >= 1, "should search for hotel candidates");
    if (res.operations?.length) {
      assert.equal(res.operations[0].entity, "hotel");
      assert.equal(res.operations[0].after.checkIn, "2026-09-15");
    }
  });
});

describe("resolveFindings — urgency ordering", () => {
  it("handles booking_window_closing before lower-urgency finding and states deadline", async () => {
    const db = mockDb();
    const bookingFinding = findingWithUrgency({
      code: "booking_window_closing",
      axisIds: ["dayPlan"],
      kind: "at_risk",
      severity: 2,
      blocking: false,
      deadline: "2026-08-10",
      title: "Booking window closing soon",
      detail: "Opera needs booking — deadline 2026-08-10.",
      titleKey: "t",
      detailKey: "d",
      entities: [{ entity: "attraction", itemId: "opera-1" }],
      evidence: [
        { what: "deadline", value: "2026-08-10", source: "computed" },
        { what: "bookingLeadDays", value: 14, source: "attraction" },
      ],
      resolution: { kind: "propose_change", hint: "Book before window closes" },
    });

    const packingFinding = findingWithUrgency({
      code: "missing_essential",
      axisIds: ["packing"],
      kind: "at_risk",
      severity: 1,
      title: "Missing adapter",
      detail: "No power adapter on checklist.",
      titleKey: "t",
      detailKey: "d",
      evidence: [{ what: "item", value: "power adapter", source: "checklist" }],
      resolution: { kind: "propose_change", hint: "Add to checklist" },
    });

    const ordered = sortFindings([packingFinding, bookingFinding], NOW);
    assert.equal(ordered[0].code, "booking_window_closing");

    const trip = budapestTrip({
      attractions: [{
        id: "opera-1",
        name: "State Opera",
        scheduledDate: "2026-09-20",
        bookingRequired: true,
        bookingLeadDays: 14,
        status: "planned",
      }],
    });

    const result = await resolveFindings(db, {
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      findings: ordered,
      search: async () => ({ ok: false, text: "", citations: [] }),
      places: async () => null,
      now: () => NOW,
    });

    assert.equal(result.resolutions[0].finding.code, "booking_window_closing");
    assert.match(result.resolutions[0].reasoning || "", /2026-08-10/);
    assert.ok(result.resolutions[0].alternatives?.length >= 3, "expected ranked booking alternatives");
  });
});

describe("resolveFindings — impossible_transit", () => {
  it("yields ranked alternative fixes, not a single guess", async () => {
    const db = mockDb();
    const finding = findingWithUrgency({
      code: "impossible_transit",
      axisIds: ["dayPlan", "transport"],
      kind: "broken",
      severity: 3,
      blocking: true,
      title: "Not enough time",
      detail: "8 km in 15 min",
      titleKey: "t",
      detailKey: "d",
      entities: [
        { entity: "attraction", itemId: "a-parliament" },
        { entity: "attraction", itemId: "a-baths" },
      ],
      evidence: [
        { what: "requiredMinutes", value: 35, source: "computed" },
        { what: "gapMinutes", value: 15, source: "computed" },
      ],
      resolution: { kind: "propose_change", hint: "Fix transit" },
    });

    const trip = budapestTrip({
      attractions: [
        { id: "a-parliament", name: "Parliament", scheduledDate: "2026-09-15", scheduledTime: "10:00", lat: 47.5, lng: 19.04 },
        { id: "a-baths", name: "Széchenyi Baths", scheduledDate: "2026-09-15", scheduledTime: "10:20", lat: 47.52, lng: 19.08 },
      ],
    });

    const result = await resolveFindings(db, {
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      findings: [finding],
      now: () => NOW,
    });

    const res = result.resolutions[0];
    assert.equal(res.kind, "proposed");
    assert.ok(res.alternatives?.length >= 3, "expected move / drop / transport alternatives");
    const names = (res.alternatives || []).map((c) => c.name).join(" ");
    assert.match(names, /Move|Drop|taxi|transport/i);
    assert.ok(
      res.decision?.chosen || res.decision?.shortlist?.length || res.alternatives?.length >= 3,
      "expected ranked alternatives",
    );
  });
});

describe("resolveFindings — committed_over_budget", () => {
  it("proposes cuts ranked against travelers' stated priorities", async () => {
    const db = mockDb();
    const finding = findingWithUrgency({
      code: "committed_over_budget",
      axisIds: ["money"],
      kind: "broken",
      severity: 2,
      title: "Over budget",
      detail: "2500 committed vs 2000 budget",
      titleKey: "t",
      detailKey: "d",
      evidence: [
        { what: "committedTotal", value: 2500, source: "trip" },
        { what: "totalBudget", value: 2000, source: "trip.budget" },
      ],
      resolution: { kind: "propose_change", hint: "Trim spend" },
    });

    const trip = budapestTrip({
      attractions: [
        { id: "culture-tour", name: "Culture walking tour", status: "idea", price: 150 },
        { id: "food-tour", name: "Food market tour", status: "idea", price: 120 },
        { id: "spa-day", name: "Spa day pass", status: "idea", price: 80 },
      ],
      hotels: [{ id: "h1", name: "Luxury Danube", status: "idea", price: 400 }],
    });

    const result = await resolveFindings(db, {
      trip,
      tripId: TRIP_ID,
      userId: USER_ID,
      findings: [finding],
      now: () => NOW,
    });

    const res = result.resolutions[0];
    assert.equal(res.kind, "proposed");
    assert.ok(res.alternatives?.length >= 3);
    assert.match(res.reasoning || "", /priorit|budget|cut|fit/i);
    const altNames = (res.alternatives || []).map((c) => c.name).join(" ");
    assert.ok(altNames.includes("Drop") || altNames.includes("Cheaper") || altNames.includes("Reduce"));
  });
});

describe("resolveFindings — visa_requirement_unknown", () => {
  it("returns a question and never an asserted requirement", async () => {
    const db = mockDb();
    const finding = findingWithUrgency({
      code: "visa_requirement_unknown",
      axisIds: ["entryRequirements"],
      kind: "unknown",
      severity: 2,
      title: "Visa rules unclear",
      detail: "Cannot verify visa for Hungary.",
      titleKey: "t",
      detailKey: "d",
      evidence: [{ what: "destination", value: "Hungary", source: "trip" }],
      resolution: { kind: "verify_fact", hint: "Confirm visa with official source" },
    });

    const result = await resolveFindings(db, {
      trip: budapestTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      findings: [finding],
      now: () => NOW,
    });

    const res = result.resolutions[0];
    assert.equal(res.kind, "verify");
    assert.ok(res.questions?.length >= 1);
    assert.ok(res.verifyTask);
    assert.equal(res.operations, undefined);
    const qText = res.questions.map((q) => q.question).join(" ");
    assert.match(qText, /nationality|visa|embassy|verify/i);
    assert.doesNotMatch(JSON.stringify(res), /must obtain|required visa|you need a visa/i);
  });
});

describe("stay axis value-of-information", () => {
  it("two viable hotels with breakfast unknown produces exactly one question and no choice", () => {
    const finding = buildFinding({
      code: "unhoused_nights",
      axisIds: ["stay"],
      kind: "broken",
      severity: 3,
      title: "Unhoused",
      detail: "Need hotel",
      titleKey: "t",
      detailKey: "d",
      evidence: [{ what: "uncoveredNight", value: "2026-09-15", source: "trip.hotels" }],
      resolution: { kind: "propose_change", hint: "Book stay" },
    });

    const result = buildStayValueOfInfoDeliberation(finding, {
      db: mockDb(),
      tripId: TRIP_ID,
      userId: USER_ID,
      trip: budapestTrip(),
      axes: [],
      profile: null,
      now: NOW,
      searchBudgetRemaining: 3,
    });

    assert.equal(result.decisions.length, 1);
    assert.equal(result.decisions[0].chosen, null, "must not pick without resolving unknown");
    assert.equal(result.questions.length, 1, "exactly one decision-flipping question");
    assert.equal(result.questions[0].field, "breakfastPreference");
    assert.match(result.questions[0].header, /^.{1,12}$/);
    assert.ok(result.questions[0].options.length >= 2);
    assert.equal(result.questions[0].axisId, "stay");
  });
});

describe("resolveFindings — global search budget", () => {
  it("respects search budget across multiple findings", async () => {
    const db = mockDb();
    let searchCalls = 0;

    const findingA = findingWithUrgency({
      code: "unhoused_nights",
      axisIds: ["stay"],
      kind: "broken",
      severity: 3,
      blocking: true,
      title: "Unhoused A",
      detail: "Night 2026-09-15",
      titleKey: "t",
      detailKey: "d",
      evidence: [{ what: "uncoveredNight", value: "2026-09-15", source: "trip.hotels" }],
      resolution: { kind: "propose_change", hint: "Add hotel" },
    });

    const findingB = findingWithUrgency({
      code: "unhoused_nights",
      axisIds: ["stay"],
      kind: "broken",
      severity: 2,
      title: "Unhoused B",
      detail: "Night 2026-09-17",
      titleKey: "t",
      detailKey: "d",
      evidence: [{ what: "uncoveredNight", value: "2026-09-17", source: "trip.hotels" }],
      resolution: { kind: "propose_change", hint: "Add hotel" },
    });

    const ordered = sortFindings([findingB, findingA], NOW);

    const result = await resolveFindings(db, {
      trip: budapestTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      findings: ordered,
      search: async () => {
        searchCalls += 1;
        return {
          ok: true,
          text: "- Hotel Alpha (€90)\n- Hotel Beta (€85)\n- Hotel Gamma (€95)",
          citations: [],
        };
      },
      places: async () => null,
      now: () => NOW,
      searchBudget: 2,
    });

    assert.equal(result.searchesUsed, 2);
    assert.ok(searchCalls <= 2, `expected at most 2 search calls, got ${searchCalls}`);
  });
});

describe("resolveFindings — late_night_arrival", () => {
  it("produces ranked late-arrival fixes instead of falling through unhandled", async () => {
    const db = mockDb();
    const finding = findingWithUrgency({
      code: "late_night_arrival",
      axisIds: ["travel", "stay", "transport"],
      kind: "at_risk",
      severity: 2,
      title: "Late-night arrival",
      detail: "Inbound lands at 23:40 — check hotel reception and transfers.",
      titleKey: "t",
      detailKey: "d",
      evidence: [{ what: "arrivalDateTime", value: "2026-09-14T23:40:00", source: "flight" }],
      entities: [{ entity: "flight", itemId: "f-late" }],
      resolution: { kind: "verify_fact", hint: "Confirm hotel late check-in and airport transfer availability." },
    });

    const result = await resolveFindings(db, {
      trip: budapestTrip({
        flights: [{
          id: "f-late",
          departureDateTime: "2026-09-14T18:00:00",
          arrivalDateTime: "2026-09-14T23:40:00",
        }],
      }),
      tripId: TRIP_ID,
      userId: USER_ID,
      findings: [finding],
      now: () => NOW,
    });

    assert.equal(result.unhandled.length, 0);
    const res = result.resolutions[0];
    assert.equal(res.finding.code, "late_night_arrival");
    assert.equal(res.kind, "proposed");
    assert.ok(res.alternatives?.length >= 3, "expected transfer, check-in, and earlier-flight options");
    const names = (res.alternatives || []).map((c) => c.name).join(" ");
    assert.match(names, /transfer|check-in|flight/i);
  });
});

describe("resolveFindings — unregistered finding code", () => {
  it("degrades gracefully for codes outside integrity", async () => {
    const db = mockDb();
    const finding = findingWithUrgency({
      code: "synthetic_unregistered_code",
      axisIds: ["travel"],
      kind: "at_risk",
      severity: 1,
      title: "Unknown issue",
      detail: "Not in integrity registry",
      titleKey: "t",
      detailKey: "d",
      evidence: [],
      resolution: { kind: "propose_change", hint: "Fix it" },
    });

    const result = await resolveFindings(db, {
      trip: budapestTrip(),
      tripId: TRIP_ID,
      userId: USER_ID,
      findings: [finding],
      now: () => NOW,
    });

    assert.equal(result.unhandled.length, 1);
    assert.equal(result.resolutions[0].kind, "unhandled");
    assert.match(result.resolutions[0].blockedWhy || "", /No resolver/);
  });
});

describe("codeResolverMap", () => {
  it("maps all implemented finding codes", () => {
    const map = codeResolverMap();
    assert.ok(map.unhoused_nights);
    assert.ok(map.impossible_transit);
    assert.ok(map.visa_requirement_unknown);
    assert.ok(map.booking_window_closing);
    assert.ok(map.late_night_arrival);
    assert.equal(map.unhoused_nights, "unhoused_nights");
  });
});
