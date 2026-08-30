import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertReadinessI18n,
  computeTripReadiness,
  readinessForPrompt,
  enumerateTripDays,
  READINESS_I18N_KEYS,
} from "./readiness.js";

const NOW = new Date("2026-08-30T10:00:00.000Z");

describe("computeTripReadiness", () => {
  it("handles an empty trip without throwing", () => {
    const r = computeTripReadiness({}, { now: NOW });
    assert.equal(r.tripId, "unknown");
    assert.equal(r.categories.length, 9);
    assert.equal(r.overallStatus, "blocked");
    assert.equal(r.categories[0].id, "basics");
    assert.equal(r.categories[0].status, "blocked");
    assert.ok(typeof r.headline === "string" && r.headline.length > 0);
    assert.ok(typeof r.headlineKey === "string");
    assert.ok(r.headlineParams && typeof r.headlineParams === "object");
    assert.ok(Array.isArray(r.categories[0].facts));
    assert.ok(Array.isArray(r.categories[0].factItems));
    assert.ok(typeof r.categories[0].summaryKey === "string");
    assert.ok(r.categories[0].summaryParams && typeof r.categories[0].summaryParams === "object");
    assert.ok(typeof r.generatedAt === "string");
    assertReadinessI18n(r);
  });

  it("scores a dates-only trip as basics done but mostly todo", () => {
    const r = computeTripReadiness(
      {
        id: "trip-dates",
        name: "Paris",
        destination: "Paris",
        startDate: "2026-09-10",
        endDate: "2026-09-15",
      },
      { now: NOW },
    );
    assert.equal(r.tripId, "trip-dates");
    assert.equal(r.daysUntilStart, 11);
    assert.equal(r.phase, "planning");
    const basics = r.categories.find((c) => c.id === "basics");
    assert.equal(basics?.status, "done");
    const intent = r.categories.find((c) => c.id === "intent");
    assert.equal(intent?.status, "todo");
    assert.ok(r.overallScore >= 0 && r.overallScore <= 1);
  });

  it("blocks inverted dates", () => {
    const r = computeTripReadiness(
      {
        id: "trip-bad-dates",
        name: "Broken",
        destination: "Paris",
        startDate: "2026-09-15",
        endDate: "2026-09-10",
      },
      { now: NOW },
    );
    const basics = r.categories.find((c) => c.id === "basics");
    assert.equal(basics?.status, "blocked");
    assert.ok(basics?.blockers.some((b) => b.includes("before")));
    assert.equal(r.overallStatus, "blocked");
  });

  it("marks a well-planned trip as largely done", () => {
    const trip = {
      id: "trip-full",
      name: "Tokyo",
      destination: "Tokyo",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      intent: {
        pace: "optimize",
        vibes: ["food"],
        source: "user",
        updatedAt: NOW.toISOString(),
      },
      flights: [
        { id: "f1", departureDateTime: "2026-09-01T08:00:00", from: "JFK", to: "HND" },
        { id: "f2", departureDateTime: "2026-09-03T18:00:00", from: "HND", to: "JFK" },
      ],
      hotels: [{ id: "h1", name: "Hotel", checkIn: "2026-09-01", checkOut: "2026-09-03" }],
      rides: [{ id: "r1", pickup: "HND", dropoff: "Hotel", pickupDateTime: "2026-09-01T12:00:00" }],
      attractions: [
        {
          id: "a1",
          name: "Senso-ji",
          scheduledDate: "2026-09-01",
          scheduledTime: "10:00",
          status: "planned",
        },
        {
          id: "a2",
          name: "Shibuya",
          scheduledDate: "2026-09-02",
          scheduledTime: "14:00",
          status: "planned",
        },
        {
          id: "a3",
          name: "TeamLab",
          scheduledDate: "2026-09-03",
          scheduledTime: "11:00",
          status: "planned",
        },
      ],
      checklist: [
        { id: "c1", text: "Passport", completed: true },
        { id: "c2", text: "Adapter", completed: true },
      ],
      budget: { totalBudget: 3000, currency: "USD", categories: [{ name: "Stay", budgeted: 1000, spent: 400 }] },
      expenses: [{ id: "e1", amount: 400, currency: "USD", category: "hotel" }],
      sharedWith: [{ userId: "u2", email: "friend@example.com", name: "Friend" }],
    };
    const r = computeTripReadiness(trip, { now: NOW });
    assert.equal(r.phase, "imminent");
    assert.ok(r.overallScore >= 0.7);
    assert.equal(r.categories.find((c) => c.id === "basics")?.status, "done");
    assert.equal(r.categories.find((c) => c.id === "intent")?.status, "done");
    assert.equal(r.categories.find((c) => c.id === "travel")?.status, "done");
    assert.equal(r.categories.find((c) => c.id === "stay")?.status, "done");
    assert.equal(r.categories.find((c) => c.id === "packing")?.status, "done");
  });

  it("treats past trips with money focus", () => {
    const r = computeTripReadiness(
      {
        id: "trip-past",
        name: "Rome",
        destination: "Rome",
        startDate: "2026-07-01",
        endDate: "2026-07-05",
        expenses: [{ id: "e1", amount: 50, currency: "EUR" }],
      },
      { now: NOW },
    );
    assert.equal(r.phase, "past");
    assert.ok(r.daysUntilStart != null && r.daysUntilStart < 0);
    assert.equal(r.categories.find((c) => c.id === "dayPlan")?.status, "not_applicable");
    assert.equal(r.categories.find((c) => c.id === "money")?.status, "todo");
  });

  it("marks single-day trips with stay not applicable and travel todo without flights", () => {
    const r = computeTripReadiness(
      {
        id: "trip-day",
        name: "Day trip",
        destination: "Tel Aviv",
        startDate: "2026-09-20",
        endDate: "2026-09-20",
      },
      { now: NOW },
    );
    assert.equal(r.categories.find((c) => c.id === "stay")?.status, "not_applicable");
    assert.equal(r.categories.find((c) => c.id === "travel")?.status, "todo");
    assert.equal(enumerateTripDays("2026-09-20", "2026-09-20").length, 1);
  });

  it("marks solo trips people as not applicable", () => {
    const r = computeTripReadiness(
      {
        id: "trip-solo",
        name: "Solo",
        destination: "Lisbon",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        intent: {
          companions: ["justMe"],
          source: "onboarding",
          updatedAt: NOW.toISOString(),
        },
      },
      { now: NOW },
    );
    assert.equal(r.categories.find((c) => c.id === "people")?.status, "not_applicable");
  });

  it("flags pending invites on shared trips", () => {
    const r = computeTripReadiness(
      {
        id: "trip-shared",
        name: "Barcelona",
        destination: "Barcelona",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        sharedWith: [{ userId: "u2", email: "friend@example.com", name: "Friend" }],
        pendingInvites: [
          {
            email: "pending@example.com",
            status: "pending",
            invitedAt: NOW.toISOString(),
            invitedBy: "u1",
          },
        ],
      },
      { now: NOW, viewerId: "u1" },
    );
    const people = r.categories.find((c) => c.id === "people");
    assert.equal(people?.status, "in_progress");
    assert.ok(people?.facts.some((f) => f.includes("pending invite")));
  });

  it("flags packing when trip is 3 days out with empty checklist", () => {
    const r = computeTripReadiness(
      {
        id: "trip-pack",
        name: "Berlin",
        destination: "Berlin",
        startDate: "2026-09-02",
        endDate: "2026-09-05",
        checklist: [],
      },
      { now: NOW },
    );
    assert.equal(r.daysUntilStart, 3);
    assert.equal(r.phase, "imminent");
    const packing = r.categories.find((c) => c.id === "packing");
    assert.equal(packing?.status, "todo");
    assert.equal(packing?.score, 0);
    assert.ok(r.nextUp.includes("packing") || r.headlineKey.includes("packing"));
  });

  it("emits only registered i18n keys with structured params across fixtures", () => {
    const fixtures = [
      {},
      {
        id: "trip-dates",
        name: "Paris",
        destination: "Paris",
        startDate: "2026-09-10",
        endDate: "2026-09-15",
      },
      {
        id: "trip-bad-dates",
        name: "Broken",
        destination: "Paris",
        startDate: "2026-09-15",
        endDate: "2026-09-10",
      },
      {
        id: "trip-full",
        name: "Tokyo",
        destination: "Tokyo",
        startDate: "2026-09-01",
        endDate: "2026-09-03",
        intent: { pace: "optimize", vibes: ["food"], source: "user", updatedAt: NOW.toISOString() },
        flights: [
          { id: "f1", departureDateTime: "2026-09-01T08:00:00", from: "JFK", to: "HND" },
          { id: "f2", departureDateTime: "2026-09-03T18:00:00", from: "HND", to: "JFK" },
        ],
        hotels: [{ id: "h1", name: "Hotel", checkIn: "2026-09-01", checkOut: "2026-09-03" }],
        rides: [{ id: "r1", pickup: "HND", dropoff: "Hotel", pickupDateTime: "2026-09-01T12:00:00" }],
        attractions: [
          { id: "a1", name: "Senso-ji", scheduledDate: "2026-09-01", scheduledTime: "10:00", status: "planned" },
        ],
        checklist: [{ id: "c1", text: "Passport", completed: true }],
        budget: { totalBudget: 3000, currency: "USD" },
        expenses: [{ id: "e1", amount: 400, currency: "USD", category: "hotel" }],
      },
    ];
    for (const trip of fixtures) {
      assertReadinessI18n(computeTripReadiness(trip, { now: NOW }));
    }
    assert.ok(READINESS_I18N_KEYS.size >= 60);
  });

  it("routes intent nextAction to the intent editor", () => {
    const r = computeTripReadiness(
      {
        id: "trip-intent",
        name: "Lisbon",
        destination: "Lisbon",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
      },
      { now: NOW },
    );
    const intent = r.categories.find((c) => c.id === "intent");
    assert.equal(intent?.nextAction?.target.kind, "route");
    assert.equal(intent?.nextAction?.target.value, "/trip/trip-intent/intent");
    assert.equal(intent?.nextAction?.labelKey, "intent.shareIntent");
  });

  it("uses only valid panel ids for panel nextAction targets", () => {
    const validPanels = new Set(["money", "checklist", "ideas", "people", "readiness"]);
    const r = computeTripReadiness(
      {
        id: "trip-panels",
        name: "Panels",
        destination: "Paris",
        startDate: "2026-09-10",
        endDate: "2026-09-15",
      },
      { now: NOW },
    );
    for (const cat of r.categories) {
      if (cat.nextAction?.target.kind === "panel") {
        assert.ok(validPanels.has(cat.nextAction.target.value), cat.id);
      }
    }
    const packing = r.categories.find((c) => c.id === "packing");
    assert.equal(packing?.nextAction?.target.kind, "panel");
    assert.equal(packing?.nextAction?.target.value, "checklist");
  });
});

describe("readinessForPrompt", () => {
  it("returns a compact shape for the LLM", () => {
    const full = computeTripReadiness(
      { id: "t1", name: "X", destination: "Y", startDate: "2026-10-01", endDate: "2026-10-03" },
      { now: NOW },
    );
    const compact = readinessForPrompt(full);
    assert.equal(compact.overallScore, full.overallScore);
    assert.deepEqual(compact.nextUp, full.nextUp);
    assert.equal(compact.categories.length, 9);
    assert.ok(!("headline" in compact));
    assert.ok(compact.categories.every((c) => c.id && c.status && c.summary));
    assert.ok(compact.categories.every((c) => !("nextAction" in c)));
  });
});
