import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORY_ORDER } from "../trip/readiness.js";
import { buildTripAxisDocument } from "../../models/aiTripAxis.helper.js";
import { assessTripIntegrity } from "./integrity/index.js";
import { buildAxisBrief } from "./axisMemory.js";
import {
  TRIP_ATTENTION_CHAR_BUDGET,
  allocateTripAttentionBlocks,
  buildSystemPrompt,
  buildTripAttentionContext,
} from "./prompt.js";

const TRIP_ID = "trip-combined-budget";
const USER_ID = "user-combined-budget";

function buildRealisticSevenDayTrip() {
  return {
    id: TRIP_ID,
    userId: USER_ID,
    name: "Italy week",
    destination: "Rome",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    hotels: [{ id: "h1", name: "Centro", checkIn: "2026-09-01", checkOut: "2026-09-05" }],
    flights: [
      { id: "f1", from: "TLV", to: "FCO", departureDateTime: "2026-09-01T06:00:00" },
    ],
    attractions: [],
    checklist: [],
  };
}

function buildFullAxes() {
  const longNote = "Detailed working note. ".repeat(120);
  return CATEGORY_ORDER.map((axisId, i) =>
    buildTripAxisDocument({
      tripId: TRIP_ID,
      userId: USER_ID,
      axisId,
      kind: "readiness",
      title: axisId,
      summary: `${axisId} brief summary`,
      note: `${axisId}: ${longNote}`,
      status: i % 2 === 0 ? "working" : "blocked",
    }),
  );
}

describe("combined trip attention budget", () => {
  it("keeps integrity + axis blocks within TRIP_ATTENTION_CHAR_BUDGET", () => {
    const trip = buildRealisticSevenDayTrip();
    const axes = buildFullAxes();
    const assessment = assessTripIntegrity(trip, {
      axes,
      now: new Date("2026-08-30T10:00:00.000Z"),
    });
    const axisBlockRaw = buildAxisBrief(axes, {
      fullIds: new Set(CATEGORY_ORDER),
      charBudget: TRIP_ATTENTION_CHAR_BUDGET,
    });
    const { integrityBlock, axisBlock } = buildTripAttentionContext({
      integrityAssessment: assessment,
      axisBlockRaw,
      charBudget: TRIP_ATTENTION_CHAR_BUDGET,
    });

    const combined = integrityBlock.length + axisBlock.length;
    assert.ok(
      combined <= TRIP_ATTENTION_CHAR_BUDGET,
      `expected combined <= ${TRIP_ATTENTION_CHAR_BUDGET}, got ${combined}`,
    );
    assert.ok(integrityBlock.includes("WHAT THIS TRIP NEEDS NOW"));
    assert.ok(integrityBlock.includes("unhoused_nights"));
  });

  it("prioritizes integrity text over axis notes when both exceed the ceiling", () => {
    const integrityText = "=== WHAT THIS TRIP NEEDS NOW ===\n".padEnd(2000, "!");
    const axisText = "=== LOKA WORK AXES ===\n".padEnd(2000, "?");
    const { integrityBlock, axisBlock } = allocateTripAttentionBlocks({
      integrityText,
      axisBlock: axisText,
      charBudget: TRIP_ATTENTION_CHAR_BUDGET,
    });

    assert.ok(integrityBlock.length >= Math.ceil(TRIP_ATTENTION_CHAR_BUDGET * 0.65) - 50);
    assert.ok(integrityBlock.length > axisBlock.length);
    assert.ok(integrityBlock.length + axisBlock.length <= TRIP_ATTENTION_CHAR_BUDGET);
  });

  it("injects combined blocks into buildSystemPrompt without breaking context size guard", () => {
    const trip = buildRealisticSevenDayTrip();
    const axes = buildFullAxes();
    const assessment = assessTripIntegrity(trip, {
      axes,
      now: new Date("2026-08-30T10:00:00.000Z"),
    });
    const axisBlockRaw = buildAxisBrief(axes, {
      fullIds: new Set(["stay", "basics"]),
      charBudget: TRIP_ATTENTION_CHAR_BUDGET,
    });
    const { integrityBlock, axisBlock } = buildTripAttentionContext({
      integrityAssessment: assessment,
      axisBlockRaw,
    });

    const prompt = buildSystemPrompt({
      trips: [trip],
      activeTripId: trip.id,
      integrityBlock,
      axisBlock,
      now: new Date("2026-08-30T10:00:00.000Z"),
    });

    assert.ok(prompt.includes("=== TRIP VIABILITY (CRITICAL) ==="));
    assert.ok(prompt.includes("WHAT THIS TRIP NEEDS NOW"));
    assert.ok(integrityBlock.length + axisBlock.length <= TRIP_ATTENTION_CHAR_BUDGET);
  });
});
