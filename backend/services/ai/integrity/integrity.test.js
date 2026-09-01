import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessTripIntegrity,
  integrityForPrompt,
  INTEGRITY_PROMPT_CHAR_BUDGET,
  whatTripNeedsNow,
} from "./index.js";
import { buildFinding } from "./types.js";
import { compareFindings, computeUrgency } from "./urgency.js";

const NOW = new Date("2026-08-30T10:00:00.000Z");

function codes(findings) {
  return findings.map((f) => f.code);
}

describe("assessTripIntegrity", () => {
  it("reports specific unhoused nights for 6-night trip with 4-night hotel", () => {
    const trip = {
      id: "trip-unhoused",
      name: "Rome",
      destination: "Rome",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      hotels: [{ id: "h1", name: "Centro", checkIn: "2026-09-01", checkOut: "2026-09-05" }],
    };
    const { findings } = assessTripIntegrity(trip, { now: NOW });
    const f = findings.find((x) => x.code === "unhoused_nights");
    assert.ok(f, "expected unhoused_nights finding");
    assert.equal(f.kind, "broken");
    assert.equal(f.blocking, true);
    assert.deepEqual(
      f.evidence.map((e) => e.value),
      ["2026-09-05", "2026-09-06"],
    );
    assert.match(f.detail, /2026-09-05/);
    assert.match(f.detail, /2026-09-06/);
  });

  it("flags blocking reception closed when landing after hotel closes", () => {
    const trip = {
      id: "trip-late",
      name: "Paris",
      destination: "Paris",
      startDate: "2026-09-10",
      endDate: "2026-09-14",
      flights: [
        {
          id: "f1",
          departureDateTime: "2026-09-10T18:00:00",
          arrivalDateTime: "2026-09-10T23:40:00",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Left Bank Inn",
          checkIn: "2026-09-10",
          receptionCloseTime: "23:00",
        },
      ],
      rides: [{ id: "r1", pickupDateTime: "2026-09-10T23:50:00" }],
    };
    const { findings, blocking } = assessTripIntegrity(trip, { now: NOW });
    const f = findings.find((x) => x.code === "reception_closed_on_arrival");
    assert.ok(f, "expected reception_closed_on_arrival");
    assert.equal(f.blocking, true);
    assert.ok(blocking.some((b) => b.code === "reception_closed_on_arrival"));
  });

  it("flags impossible transit for same-day items 200km apart in 90 minutes", () => {
    const trip = {
      id: "trip-transit",
      name: "Italy",
      destination: "Italy",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      attractions: [
        {
          id: "a1",
          name: "Milan",
          scheduledDate: "2026-09-11",
          scheduledTime: "09:00",
          durationMinutes: 60,
          lat: 45.4642,
          lng: 9.19,
          status: "planned",
        },
        {
          id: "a2",
          name: "Florence",
          scheduledDate: "2026-09-11",
          scheduledTime: "10:30",
          durationMinutes: 60,
          lat: 43.7696,
          lng: 11.2558,
          status: "planned",
        },
      ],
    };
    const { findings } = assessTripIntegrity(trip, { now: NOW });
    assert.ok(findings.some((f) => f.code === "impossible_transit"));
  });

  it("does not flag impossible transit for a short walk with plenty of time", () => {
    const trip = {
      id: "trip-walk",
      name: "Paris",
      destination: "Paris",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      attractions: [
        {
          id: "a1",
          name: "Café",
          scheduledDate: "2026-09-11",
          scheduledTime: "09:00",
          durationMinutes: 30,
          lat: 48.8566,
          lng: 2.3522,
          status: "planned",
        },
        {
          id: "a2",
          name: "Musée nearby",
          scheduledDate: "2026-09-11",
          scheduledTime: "10:30",
          durationMinutes: 60,
          lat: 48.8606,
          lng: 2.3522,
          status: "planned",
        },
      ],
    };
    const { findings } = assessTripIntegrity(trip, { now: NOW });
    assert.equal(findings.some((f) => f.code === "impossible_transit"), false);
  });

  it("flags venue closed on Monday via openingHoursCover", () => {
    const trip = {
      id: "trip-monday",
      name: "London",
      destination: "London",
      startDate: "2026-09-07",
      endDate: "2026-09-10",
      attractions: [
        {
          id: "m1",
          name: "Closed Mondays Museum",
          scheduledDate: "2026-09-07",
          scheduledTime: "11:00",
          status: "planned",
          openingHours: {
            weekdayText: [
              "Monday: Closed",
              "Tuesday: 9:00 AM – 5:00 PM",
              "Wednesday: 9:00 AM – 5:00 PM",
              "Thursday: 9:00 AM – 5:00 PM",
              "Friday: 9:00 AM – 5:00 PM",
              "Saturday: 9:00 AM – 5:00 PM",
              "Sunday: 9:00 AM – 5:00 PM",
            ],
          },
        },
      ],
    };
    const { findings } = assessTripIntegrity(trip, { now: NOW });
    assert.ok(findings.some((f) => f.code === "venue_closed"));
  });

  it("flags committed costs over totalBudget", () => {
    const trip = {
      id: "trip-money",
      name: "Trip",
      destination: "Berlin",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      budget: { totalBudget: 2000, currency: "EUR" },
      flights: [{ id: "f1", price: 900, currency: "EUR" }],
      hotels: [{ id: "h1", price: 700, currency: "EUR", checkIn: "2026-10-01", checkOut: "2026-10-05" }],
      expenses: [{ id: "e1", amount: 500, currency: "EUR" }],
    };
    const { findings } = assessTripIntegrity(trip, { now: NOW });
    assert.ok(findings.some((f) => f.code === "committed_over_budget"));
  });

  it("flags currency mismatch instead of bogus combined total", () => {
    const trip = {
      id: "trip-fx",
      name: "Trip",
      destination: "London",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      budget: { totalBudget: 2000, currency: "USD" },
      flights: [{ id: "f1", price: 800, currency: "USD" }],
      hotels: [{ id: "h1", price: 600, currency: "GBP", checkIn: "2026-10-01", checkOut: "2026-10-05" }],
    };
    const { findings } = assessTripIntegrity(trip, { now: NOW });
    assert.ok(findings.some((f) => f.code === "currency_mismatch"));
    assert.equal(findings.some((f) => f.code === "committed_over_budget"), false);
  });

  it("emits entry requirements as unknown with questions, not asserted legal facts", () => {
    const trip = {
      id: "trip-entry",
      name: "Tokyo",
      destination: "Tokyo",
      destinations: [{ name: "Tokyo", country: "JP" }],
      startDate: "2026-09-15",
      endDate: "2026-09-20",
      flights: [{ id: "f1", departureDateTime: "2026-09-15T08:00:00" }],
    };
    const profile = { homeCountry: "US" };
    const { findings } = assessTripIntegrity(trip, { now: NOW, profile });
    const passport = findings.find((f) => f.code === "passport_validity_unknown");
    assert.ok(passport);
    assert.equal(passport.kind, "unknown");
    assert.equal(passport.resolution.kind, "ask_user");
    assert.match(passport.detail, /passport/i);
    assert.equal(
      passport.evidence.some((e) => e.source === "profile" && e.what === "passportOnFile"),
      true,
    );
  });

  it("returns zero findings for a fully coherent domestic trip", () => {
    const trip = {
      id: "trip-healthy",
      name: "California",
      destination: "San Diego",
      destinations: [{ name: "San Diego", country: "US" }],
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      flights: [
        { id: "f1", departureDateTime: "2026-09-10T09:00:00", arrivalDateTime: "2026-09-10T12:00:00", price: 300, currency: "USD" },
        { id: "f2", departureDateTime: "2026-09-13T16:00:00", arrivalDateTime: "2026-09-13T19:00:00", price: 300, currency: "USD" },
      ],
      hotels: [{ id: "h1", name: "Bay View", checkIn: "2026-09-10", checkOut: "2026-09-13", price: 400, currency: "USD" }],
      rides: [
        { id: "r1", pickupDateTime: "2026-09-10T12:30:00" },
        { id: "r2", pickupDateTime: "2026-09-13T10:00:00" },
      ],
      attractions: [
        {
          id: "a1",
          name: "Zoo",
          scheduledDate: "2026-09-11",
          scheduledTime: "10:00",
          durationMinutes: 120,
          lat: 32.7157,
          lng: -117.1611,
          status: "planned",
        },
      ],
      budget: { totalBudget: 3000, currency: "USD" },
      expenses: [{ id: "e1", amount: 100, currency: "USD" }],
    };
    const profile = { homeCountry: "US" };
    const { findings, summary } = assessTripIntegrity(trip, { now: NOW, profile });
    assert.equal(findings.length, 0, `expected zero findings, got: ${codes(findings).join(", ")}`);
    assert.equal(summary.brokenCount, 0);
    assert.equal(summary.atRiskCount, 0);
    assert.equal(summary.unknownCount, 0);
  });
});

describe("urgency ordering", () => {
  it("ranks a closing booking window above a permanently fixable gap", () => {
    const closingSoon = buildFinding({
      code: "booking_window_closing",
      axisIds: ["dayPlan"],
      kind: "at_risk",
      severity: 1,
      deadline: "2026-09-01",
      title: "Booking closes soon",
      detail: "Opera tickets need booking 14 days ahead.",
      titleKey: "integrity.booking.closing.title",
      detailKey: "integrity.booking.closing.detail",
      resolution: { kind: "propose_change", hint: "Book now." },
    });

    const fixableGap = buildFinding({
      code: "dayPlan.emptyDate",
      axisIds: ["dayPlan"],
      kind: "at_risk",
      severity: 3,
      deadline: null,
      title: "Empty afternoon",
      detail: "Thursday afternoon has nothing planned — easy to fill anytime.",
      titleKey: "integrity.dayPlan.empty.title",
      detailKey: "integrity.dayPlan.empty.detail",
      resolution: { kind: "propose_change", hint: "Add an activity." },
    });

    assert.ok(compareFindings(closingSoon, fixableGap, NOW) < 0);
    assert.ok(computeUrgency(closingSoon, NOW) > computeUrgency(fixableGap, NOW));

    const { findings, rationale } = whatTripNeedsNow([fixableGap, closingSoon], {
      limit: 2,
      now: NOW,
    });
    assert.equal(findings[0].code, "booking_window_closing");
    assert.match(rationale, /deadline|window|irrevers/i);
  });
});

describe("integrityForPrompt", () => {
  it("exports prompt char budget and respects it", () => {
    assert.equal(INTEGRITY_PROMPT_CHAR_BUDGET, 2400);
    const assessment = assessTripIntegrity(
      {
        id: "t",
        name: "X",
        destination: "Y",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        hotels: [{ id: "h1", checkIn: "2026-09-01", checkOut: "2026-09-05" }],
      },
      { now: NOW },
    );
    const compact = integrityForPrompt(assessment, { budget: 500 });
    assert.ok(compact.text.length <= 500);
    assert.ok(compact.lines.length >= 1);
  });
});
