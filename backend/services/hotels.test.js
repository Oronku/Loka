import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../config/memoryStore.js";
import {
  validateHotelInput,
  normalizeHotel,
  buildHotelEvents,
  removeHotel,
  syncHotelExpense,
} from "./hotels.js";
import { buildTimeline } from "./timeline/buildTimeline.js";
import { formatNaive, stripZone } from "./timeline/shared/wallClock.js";
import { DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS } from "./timeline/shared/constants.js";

describe("validateHotelInput", () => {
  it("accepts an idea with empty dates", () => {
    const result = validateHotelInput({
      name: "Maybe Hilton",
      isIdea: true,
      checkIn: "",
      checkOut: "",
    });
    assert.equal(result.ok, true);
  });

  it("rejects a non-idea missing checkOut", () => {
    const result = validateHotelInput({
      name: "Hilton",
      checkIn: "2026-06-07",
      isIdea: false,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /checkOut/i);
  });

  it("rejects checkOut strictly before checkIn", () => {
    const result = validateHotelInput({
      name: "Hilton",
      checkIn: "2026-06-10",
      checkOut: "2026-06-07",
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /checkOut/i);
  });
});

describe("normalizeHotel", () => {
  it("assigns an id when absent and preserves existing.id when editing", () => {
    const created = normalizeHotel({
      name: "A",
      checkIn: "2026-06-07",
      checkOut: "2026-06-10",
    });
    assert.ok(created.id);
    assert.match(created.id, /^hotel-\d+-[a-z0-9]+$/);

    const edited = normalizeHotel(
      {
        name: "B",
        checkIn: "2026-06-07",
        checkOut: "2026-06-10",
      },
      { existing: { id: "hotel-keep-me" } }
    );
    assert.equal(edited.id, "hotel-keep-me");
  });

  it("generates different ids for two hotels created in the same millisecond", () => {
    const now = Date.now();
    const original = Date.now;
    Date.now = () => now;
    try {
      const a = normalizeHotel({
        name: "A",
        checkIn: "2026-06-07",
        checkOut: "2026-06-08",
      });
      const b = normalizeHotel({
        name: "B",
        checkIn: "2026-06-07",
        checkOut: "2026-06-08",
      });
      assert.notEqual(a.id, b.id);
    } finally {
      Date.now = original;
    }
  });

  it("fills default arrival/checkOut times and preserves explicit values", () => {
    const defaults = normalizeHotel({
      name: "A",
      checkIn: "2026-06-07",
      checkOut: "2026-06-10",
    });
    assert.equal(defaults.arrivalTime, "15:00");
    assert.equal(defaults.checkOutTime, "11:00");

    const explicit = normalizeHotel({
      name: "A",
      checkIn: "2026-06-07",
      checkOut: "2026-06-10",
      arrivalTime: "16:30",
      checkOutTime: "10:00",
    });
    assert.equal(explicit.arrivalTime, "16:30");
    assert.equal(explicit.checkOutTime, "10:00");
  });

  it("preserves unknown passthrough fields such as coordinates", () => {
    const hotel = normalizeHotel({
      name: "A",
      checkIn: "2026-06-07",
      checkOut: "2026-06-10",
      coordinates: { lat: 48.8, lng: 2.3 },
      rating: 4.5,
    });
    assert.deepEqual(hotel.coordinates, { lat: 48.8, lng: 2.3 });
    assert.equal(hotel.rating, 4.5);
  });

  it("ignores a Google place id on create and stores a generated hotel-… id", () => {
    const hotel = normalizeHotel({
      id: "ChIJ_google_place_id",
      name: "Search Result Hotel",
      checkIn: "2026-06-07",
      checkOut: "2026-06-10",
    });
    assert.match(hotel.id, /^hotel-\d+-[a-z0-9]+$/);
    assert.notEqual(hotel.id, "ChIJ_google_place_id");
  });
});

describe("buildHotelEvents", () => {
  it("returns [] for an idea, and two distinct-id events with null subtitle for a real hotel", () => {
    assert.deepEqual(
      buildHotelEvents(
        { id: "h1", name: "Idea", isIdea: true, checkIn: "", checkOut: "" },
        0
      ),
      []
    );

    const events = buildHotelEvents(
      {
        id: "h1",
        name: "Hilton",
        checkIn: "2026-06-07",
        checkOut: "2026-06-10",
        arrivalTime: "15:00",
        checkOutTime: "11:00",
      },
      0
    );
    assert.equal(events.length, 2);
    assert.equal(events[0].id, "h1-checkin");
    assert.equal(events[1].id, "h1-checkout");
    assert.notEqual(events[0].id, events[1].id);
    assert.equal(events[0].subtitle, null);
    assert.equal(events[1].subtitle, null);
  });

  it("carries the bare hotel name, since title is prefixed and subtitle is null", () => {
    // The transfer generators build their `hotelTitle` from this; deriving it
    // from `title` instead would leak "Check in: " into ride-suggestion cards.
    const events = buildHotelEvents(
      {
        id: "h1",
        name: "Hilton",
        checkIn: "2026-06-07",
        checkOut: "2026-06-10",
      },
      0
    );
    assert.equal(events[0].hotelName, "Hilton");
    assert.equal(events[1].hotelName, "Hilton");
    assert.equal(events[0].title, "Check in: Hilton");
  });

  it("sets displayLocation to address when present, else null (never lat/lng or name)", () => {
    const withAddress = buildHotelEvents(
      {
        id: "h1",
        name: "Hilton",
        checkIn: "2026-06-07",
        checkOut: "2026-06-10",
        coordinates: { lat: 32.0853, lng: 34.7818 },
        address: "123 Beach Ave, Tel Aviv",
      },
      0
    );
    assert.equal(withAddress[0].displayLocation, "123 Beach Ave, Tel Aviv");
    assert.equal(withAddress[1].displayLocation, "123 Beach Ave, Tel Aviv");
    // location stays geocodable for routing
    assert.equal(withAddress[0].location, "32.0853,34.7818");

    const coordsOnly = buildHotelEvents(
      {
        id: "h2",
        name: "Hilton",
        checkIn: "2026-06-07",
        checkOut: "2026-06-10",
        coordinates: { lat: 32.0853, lng: 34.7818 },
      },
      0
    );
    assert.equal(coordsOnly[0].displayLocation, null);
    assert.ok("displayLocation" in coordsOnly[0]);
    assert.notEqual(coordsOnly[0].displayLocation, coordsOnly[0].location);
  });
});

describe("syncHotelExpense", () => {
  it("returns null when cost is missing or not positive", () => {
    const trip = { expenses: [] };
    const hotel = { id: "hotel-1", name: "Hilton", checkIn: "2026-06-07" };
    assert.equal(syncHotelExpense(trip, hotel, { userId: "u1" }), null);
    assert.equal(
      syncHotelExpense(trip, { ...hotel, cost: 0 }, { userId: "u1" }),
      null
    );
    assert.equal(
      syncHotelExpense(trip, { ...hotel, cost: -10 }, { userId: "u1" }),
      null
    );
  });

  it("writes category hotel, currency, and resolved split amounts", () => {
    const trip = { expenses: [] };
    const hotel = {
      id: "hotel-1",
      name: "Hilton",
      cost: 200,
      checkIn: "2026-06-07",
      currency: "eur",
    };
    const expense = syncHotelExpense(trip, hotel, { userId: "u1" });
    assert.equal(expense.category, "hotel");
    assert.equal(expense.currency, "EUR");
    assert.equal(expense.title, "Hilton");
    assert.equal(expense.amount, 200);
    assert.equal(expense.linkedHotelId, "hotel-1");
    assert.equal(expense.paidBy, "u1");
    assert.equal(expense.splitMethod, "equal");
    assert.deepEqual(expense.splits, [{ userId: "u1", amount: 200 }]);
  });

  it("preserves a valid existing category and falls back invalid ones to hotel", () => {
    const hotel = {
      id: "hotel-1",
      name: "Hilton",
      cost: 150,
      checkIn: "2026-06-07",
    };
    const keep = syncHotelExpense(
      {
        expenses: [
          { linkedHotelId: "hotel-1", category: "activity", currency: "ILS" },
        ],
      },
      hotel,
      { userId: "u1" }
    );
    assert.equal(keep.category, "activity");
    assert.equal(keep.currency, "ILS");

    const remap = syncHotelExpense(
      {
        expenses: [
          { linkedHotelId: "hotel-1", category: "Accommodation" },
        ],
      },
      hotel,
      { userId: "u1" }
    );
    assert.equal(remap.category, "hotel");
    assert.equal(remap.currency, "USD");
  });
});

describe("removeHotel", () => {
  it("deletes a legacy id-less hotel by index", async () => {
    memoryStore.trips.clear();
    const trip = memoryStore.trips.create({
      name: "Legacy ideas",
      hotels: [
        { id: "hotel-keep", name: "Keep me", isIdea: true, checkIn: "", checkOut: "" },
        { name: "Legacy idea", isIdea: true, checkIn: "", checkOut: "" },
      ],
      expenses: [],
    });

    const updated = await removeHotel(trip, trip.hotels[1].id, { index: 1 });
    assert.equal(updated.hotels.length, 1);
    assert.equal(updated.hotels[0].name, "Keep me");
    assert.equal(updated.hotels[0].id, "hotel-keep");
    memoryStore.trips.clear();
  });
});

describe("buildTimeline hotel ordering", () => {
  it("clamps same-day check-in after late flight arrival (+30m buffer)", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "AF1",
          departureDateTime: "2026-06-07T18:00",
          arrivalDateTime: "2026-06-07T22:40",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-06-07",
          checkOut: "2026-06-10",
        },
      ],
    });

    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.ok(checkIn);
    assert.equal(checkIn.start, "2026-06-07T23:10");
    assert.equal(checkIn.plannedStart, "2026-06-07T15:00");
    assert.equal(checkIn.adjusted, true);
    assert.equal(checkIn.adjustmentReason, "after-flight-arrival");
  });

  it("leaves a comfortably-later check-in untouched", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "AF1",
          departureDateTime: "2026-06-07T08:00",
          arrivalDateTime: "2026-06-07T10:00",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-06-07",
          checkOut: "2026-06-10",
          arrivalTime: "15:00",
        },
      ],
    });

    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.equal(checkIn.start, "2026-06-07T15:00");
    assert.equal(checkIn.adjusted, false);
    assert.equal(checkIn.adjustmentReason, null);
  });

  it("clamps checkout before airport-arrival deadline for an early flight", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "AF2",
          departureDateTime: "2026-06-10T08:00",
          arrivalDateTime: "2026-06-10T10:00",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-06-07",
          checkOut: "2026-06-10",
          checkOutTime: "11:00",
        },
      ],
    });

    const checkOut = events.find((e) => e.type === "hotel-checkout");
    assert.ok(checkOut);
    // 08:00 departure minus default 2h airport buffer → 06:00
    const expected = formatNaive(
      new Date(
        new Date("2026-06-10T08:00").getTime() -
          DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS * 1000
      )
    );
    assert.equal(checkOut.start, expected);
    assert.equal(checkOut.adjusted, true);
    assert.equal(checkOut.adjustmentReason, "before-flight-departure");
    assert.equal(checkOut.plannedStart, "2026-06-10T11:00");
  });

  it("never sorts a hotel-checkin before a same-day flight arrival", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "AF1",
          departureDateTime: "2026-06-07T18:00",
          arrivalDateTime: "2026-06-07T22:40",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-06-07",
          checkOut: "2026-06-10",
        },
      ],
    });

    const flight = events.find((e) => e.type === "flight");
    const checkIn = events.find((e) => e.type === "hotel-checkin");
    const flightIdx = events.indexOf(flight);
    const checkInIdx = events.indexOf(checkIn);
    assert.ok(flightIdx < checkInIdx);
    assert.ok(checkIn.sortKey > new Date(flight.arrival).getTime());
  });

  it("clamps against the flight's wall clock, not the server-local instant (+04 arrival)", () => {
    // Live bug: arrival 19:30+04 was converted via server +03 to 19:00 display.
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "FZ1",
          departureDateTime: "2026-08-13T16:15:00+03:00",
          arrivalDateTime: "2026-08-13T19:30:00+04:00",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-08-13",
          checkOut: "2026-08-15",
          arrivalTime: "15:00",
        },
      ],
    });

    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.equal(checkIn.start, "2026-08-13T20:00");
    assert.equal(checkIn.plannedStart, "2026-08-13T15:00");
    assert.equal(checkIn.adjusted, true);
    assert.equal(checkIn.adjustmentReason, "after-flight-arrival");
  });

  it("gives a clamped check-in a sortKey after the flight event", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "FZ1",
          departureDateTime: "2026-08-13T16:15:00+03:00",
          arrivalDateTime: "2026-08-13T19:30:00+04:00",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-08-13",
          checkOut: "2026-08-15",
          arrivalTime: "15:00",
        },
      ],
    });

    const flight = events.find((e) => e.type === "flight");
    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.ok(checkIn.sortKey > flight.sortKey);
  });

  it("ignores a Z-suffixed arrival zone the same way", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "FZ1",
          departureDateTime: "2026-08-13T16:15:00+03:00",
          arrivalDateTime: "2026-08-13T19:30:00Z",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-08-13",
          checkOut: "2026-08-15",
          arrivalTime: "15:00",
        },
      ],
    });

    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.equal(checkIn.start, "2026-08-13T20:00");
  });

  it("normalizes a space-separated arrival before clamping", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "FZ1",
          departureDateTime: "2026-08-13T16:15:00+03:00",
          arrivalDateTime: "2026-08-13 19:30:00+04:00",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-08-13",
          checkOut: "2026-08-15",
          arrivalTime: "15:00",
        },
      ],
    });

    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.equal(checkIn.start, "2026-08-13T20:00");
  });

  it("clamps checkout against an offset departure wall clock", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "f1",
          flightNumber: "FZ2",
          departureDateTime: "2026-08-15T08:00:00+04:00",
          arrivalDateTime: "2026-08-15T10:00:00+04:00",
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hilton",
          checkIn: "2026-08-13",
          checkOut: "2026-08-15",
          checkOutTime: "12:00",
        },
      ],
    });

    const checkOut = events.find((e) => e.type === "hotel-checkout");
    assert.equal(checkOut.start, "2026-08-15T06:00");
    assert.equal(checkOut.adjusted, true);
    assert.equal(checkOut.adjustmentReason, "before-flight-departure");
  });
});

describe("stripZone", () => {
  it("strips offset, Z, and space separators without eating date hyphens", () => {
    assert.equal(stripZone("2026-08-13T19:30:00+04:00"), "2026-08-13T19:30:00");
    assert.equal(stripZone("2026-08-13T19:30:00Z"), "2026-08-13T19:30:00");
    assert.equal(stripZone("2026-08-02 10:10+03:00"), "2026-08-02T10:10");
    assert.equal(stripZone("2026-08-13T19:30:00"), "2026-08-13T19:30:00");
    // Date hyphens must survive — only a trailing time-zone offset is removed.
    assert.equal(stripZone("2026-08-13T15:00"), "2026-08-13T15:00");
    assert.equal(stripZone(null), null);
    assert.equal(stripZone(""), null);
  });
});
