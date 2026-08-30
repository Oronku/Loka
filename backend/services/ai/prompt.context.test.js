import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTripContext } from "./prompt.js";

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
    userId: "user-1",
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

describe("buildTripContext size", () => {
  it("keeps active trip context under ~6000 characters", () => {
    const trip = buildRealisticSevenDayTrip();
    const otherTrip = {
      id: "trip-other",
      name: "Weekend",
      destination: "Haifa",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      flights: [],
      hotels: [],
      rides: [],
      attractions: [],
    };

    const context = buildTripContext([trip, otherTrip], { activeTripId: trip.id });
    const serialized = JSON.stringify(context);
    assert.ok(
      serialized.length < 6000,
      `expected <6000 chars, got ${serialized.length}`,
    );
  });
});
