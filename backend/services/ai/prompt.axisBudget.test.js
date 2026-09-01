import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORY_ORDER } from "../trip/readiness.js";
import { buildTripAxisDocument } from "../../models/aiTripAxis.helper.js";
import { buildAxisBrief, selectRelevantAxes } from "./axisMemory.js";
import { AXIS_BLOCK_CHAR_BUDGET, buildSystemPrompt } from "./prompt.js";

const TRIP_ID = "trip-prompt-axis";
const USER_ID = "user-prompt-axis";

function buildRealisticSevenDayTrip() {
  const attractions = [];
  for (let i = 0; i < 12; i += 1) {
    attractions.push({
      id: `a-${i}`,
      name: `Place ${i}`,
      scheduledDate: i < 7 ? `2026-09-0${i + 1}` : undefined,
      status: i < 7 ? "planned" : "idea",
    });
  }

  return {
    id: "trip-7d",
    userId: USER_ID,
    userName: "Noam",
    name: "Italy week",
    destination: "Rome",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    intent: {
      pace: "relax",
      vibes: ["food", "culture"],
      priorities: ["Find more places to visit"],
      companions: ["spousePartner"],
      budgetLevel: "moderate",
      source: "onboarding",
    },
    flights: [
      { id: "f1", from: "TLV", to: "FCO", departureDateTime: "2026-09-01T06:00:00" },
      { id: "f2", from: "FCO", to: "TLV", departureDateTime: "2026-09-07T20:00:00" },
    ],
    hotels: [{ id: "h1", name: "Centro", checkIn: "2026-09-01", checkOut: "2026-09-07" }],
    rides: [{ id: "r1", pickup: "FCO", dropoff: "Centro", pickupDateTime: "2026-09-01T10:00:00" }],
    attractions,
    checklist: [
      { id: "c1", text: "Passport", completed: true, categoryId: "docs" },
      { id: "c2", text: "Charger", completed: false, categoryId: "gear" },
    ],
    budget: {
      totalBudget: 5000,
      currency: "EUR",
      categories: [{ name: "Stay", budgeted: 2000, spent: 500 }],
    },
    expenses: [
      { id: "e1", amount: 500, currency: "EUR", category: "hotel" },
      { id: "e2", amount: 120, currency: "EUR", category: "food" },
    ],
    sharedWith: [{ userId: "u2", email: "friend@example.com", name: "Friend" }],
    pendingInvites: [],
  };
}

function buildFullAxes() {
  const longNote = "Detailed working note. ".repeat(120);
  return CATEGORY_ORDER.map((axisId, i) => {
    const axis = buildTripAxisDocument({
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId,
      kind: "readiness",
      title: axisId,
      summary: `${axisId} brief summary`,
      note: `${axisId}: ${longNote}`,
      status: i % 2 === 0 ? "working" : "blocked",
    });
    axis.gaps = [
      {
        id: `gap-${axisId}`,
        field: `${axisId}Field`,
        severity: 2,
        status: "open",
        blocks: ["planning"],
        evidence: "missing info",
        askedCount: 0,
        lastAskedAt: null,
        resolvedByQuestionId: null,
      },
    ];
    return axis;
  });
}

describe("axis block character budget", () => {
  it("keeps the axis brief within AXIS_BLOCK_CHAR_BUDGET when all nine axes carry full notes", () => {
    const axes = buildFullAxes();
    const readiness = { nextUp: CATEGORY_ORDER.slice(0, 3) };
    const { fullIds } = selectRelevantAxes(axes, { readiness, maxFull: 3 });
    const axisBlock = buildAxisBrief(axes, {
      fullIds,
      charBudget: AXIS_BLOCK_CHAR_BUDGET,
    });

    assert.ok(
      axisBlock.length <= AXIS_BLOCK_CHAR_BUDGET,
      `expected <=${AXIS_BLOCK_CHAR_BUDGET} chars, got ${axisBlock.length}`,
    );
  });

  it("still includes one brief line per axis and severity-2+ gaps when full notes are trimmed", () => {
    const axes = buildFullAxes();
    const fullIds = new Set(CATEGORY_ORDER);
    const axisBlock = buildAxisBrief(axes, {
      fullIds,
      charBudget: AXIS_BLOCK_CHAR_BUDGET,
    });

    for (const axisId of CATEGORY_ORDER) {
      assert.match(
        axisBlock,
        new RegExp(`- ${axisId} \\[(working|blocked|idle|settled)\\]`),
        `missing brief line for ${axisId}`,
      );
      assert.match(
        axisBlock,
        new RegExp(`${axisId}Field\\(sev2\\)`),
        `missing sev2 gap for ${axisId}`,
      );
    }
  });

  it("injects a capped axis block into buildSystemPrompt without breaking trip context size guard", () => {
    const trip = buildRealisticSevenDayTrip();
    const axes = buildFullAxes();
    const { fullIds } = selectRelevantAxes(axes, {
      userMessage: "help with stay and day plan",
      readiness: { nextUp: ["stay", "dayPlan"] },
    });
    const axisBlock = buildAxisBrief(axes, {
      fullIds,
      charBudget: AXIS_BLOCK_CHAR_BUDGET,
    });

    assert.ok(axisBlock.length <= AXIS_BLOCK_CHAR_BUDGET);

    const prompt = buildSystemPrompt({
      trips: [trip],
      activeTripId: trip.id,
      axisBlock,
      now: new Date("2026-08-30T10:00:00.000Z"),
    });
    assert.ok(prompt.includes("=== LOKA WORK AXES ==="));
    assert.ok(prompt.includes("- stay [blocked]"));

    const tripsSection = prompt.indexOf("=== CURRENT TRIPS ===");
    const tripJsonMarker = prompt.indexOf('"id":"trip-7d"', tripsSection);
    const axisMarker = prompt.indexOf("=== LOKA WORK AXES ===", tripsSection);
    assert.ok(tripsSection >= 0);
    assert.ok(tripJsonMarker > tripsSection);
    assert.ok(axisMarker > tripJsonMarker);
    assert.ok(axisBlock.length <= AXIS_BLOCK_CHAR_BUDGET);
  });
});
