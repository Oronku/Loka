import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import googleApi from "../googleApi.js";
import { buildTimeline } from "./buildTimeline.js";
import { recalculateTimeline } from "./engine/TimelineEngine.js";
import { calculateTravelLegs } from "./generators/travelLegGenerator.js";
import { POST_FLIGHT_BUFFER_SECONDS } from "./shared/constants.js";
import { toTime } from "./shared/wallClock.js";

const DRIVE_SECONDS = 2400;
const DRIVE_TEXT = "40 mins";
const DISTANCE_TEXT = "20 km";

function stubGoogleTravel() {
  mock.method(googleApi, "searchPlaceByText", async (query) => ({
    location: { lat: 32.011, lng: 34.887 },
    address: String(query),
  }));
  mock.method(googleApi, "getDistanceMatrix", async () => ({
    rows: [
      {
        elements: [
          {
            status: "OK",
            duration: { value: DRIVE_SECONDS, text: DRIVE_TEXT },
            distance: { value: 20000, text: DISTANCE_TEXT },
          },
        ],
      },
    ],
  }));
}

function stubGoogleFail() {
  mock.method(googleApi, "searchPlaceByText", async () => null);
  mock.method(googleApi, "getDistanceMatrix", async () => {
    throw new Error("Google API key not configured");
  });
}

afterEach(() => {
  mock.restoreAll();
});

describe("travel legs leaveBy", () => {
  it("sets leaveBy on a non-tight leg", async () => {
    stubGoogleTravel();
    const trip = {
      attractions: [
        {
          id: "museum",
          name: "Museum",
          location: "1 Spare Gap St, Paris",
          scheduledDate: "2026-06-07",
          scheduledTime: "10:00",
          durationMinutes: 60,
          status: "planned",
        },
        {
          id: "dinner",
          name: "Dinner",
          location: "2 Spare Gap Ave, Paris",
          scheduledDate: "2026-06-07",
          scheduledTime: "20:00",
          status: "planned",
        },
      ],
    };
    const { events } = buildTimeline(trip);
    const legs = await calculateTravelLegs(trip, events);

    assert.equal(legs.length, 1);
    assert.equal(legs[0].tight, false);
    assert.ok(legs[0].leaveBy);

    const dinner = events.find((e) => e.id === "dinner");
    const expected = new Date(
      toTime(dinner.start) - DRIVE_SECONDS * 1000
    ).toISOString();
    assert.equal(legs[0].leaveBy, expected);
  });
});

describe("travelIn stamps", () => {
  it("stamps travelIn on a hotel check-in from an arrival transfer", async () => {
    stubGoogleTravel();
    const land = "2026-06-07T20:10";
    const snapshot = await recalculateTimeline({
      flights: [
        {
          id: "inbound",
          flightNumber: "LY001",
          departureAirportCode: "JFK",
          arrivalAirportCode: "TLV",
          departureDateTime: "2026-06-07T10:00",
          arrivalDateTime: land,
        },
      ],
      hotels: [
        {
          id: "h1",
          name: "Hotel Indigo",
          address: "1 Rothschild Blvd, Tel Aviv",
          coordinates: { lat: 32.062, lng: 34.77 },
          checkIn: "2026-06-07",
          checkOut: "2026-06-10",
          arrivalTime: "15:00",
        },
      ],
    });

    const checkIn = snapshot.events.find((e) => e.type === "hotel-checkin");
    assert.ok(checkIn?.travelIn);
    assert.equal(checkIn.travelIn.source, "arrival-transfer");
    assert.equal(checkIn.travelIn.unresolved, false);
    assert.equal(checkIn.travelIn.bufferSeconds, POST_FLIGHT_BUFFER_SECONDS);
    assert.equal(checkIn.travelIn.bufferSeconds, 1800);
    assert.equal(checkIn.travelIn.durationSeconds, DRIVE_SECONDS);
    assert.equal(checkIn.travelIn.durationText, DRIVE_TEXT);
    assert.equal(checkIn.travelIn.distanceText, DISTANCE_TEXT);

    const expectedArriveBy = new Date(
      toTime(land) + (POST_FLIGHT_BUFFER_SECONDS + DRIVE_SECONDS) * 1000
    ).toISOString();
    assert.equal(checkIn.travelIn.arriveBy, expectedArriveBy);
    assert.notEqual(checkIn.start, checkIn.travelIn.arriveBy);
    assert.ok(snapshot.transfers.length >= 1);
    assert.equal(snapshot.transfers[0].estimatedArrival, expectedArriveBy);
  });

  it("stamps travelIn on an attraction from a plain leg", async () => {
    stubGoogleTravel();
    const snapshot = await recalculateTimeline({
      attractions: [
        {
          id: "museum",
          name: "Museum",
          location: "11 Leg Origin Rd, Paris",
          scheduledDate: "2026-06-08",
          scheduledTime: "10:00",
          durationMinutes: 90,
          status: "planned",
        },
        {
          id: "gallery",
          name: "Gallery",
          location: "22 Leg Dest Blvd, Paris",
          scheduledDate: "2026-06-08",
          scheduledTime: "14:00",
          status: "planned",
        },
      ],
    });

    const gallery = snapshot.events.find((e) => e.id === "gallery");
    assert.ok(gallery?.travelIn);
    assert.equal(gallery.travelIn.source, "leg");
    assert.equal(gallery.travelIn.unresolved, false);
    assert.equal(gallery.travelIn.bufferSeconds, 0);
    assert.equal(gallery.travelIn.durationSeconds, DRIVE_SECONDS);
    assert.ok(gallery.travelIn.leaveBy);
    assert.ok(gallery.travelIn.arriveBy);
  });

  it("stamps travelIn.unresolved when travel cannot be resolved", async () => {
    stubGoogleFail();
    const snapshot = await recalculateTimeline({
      flights: [
        {
          id: "inbound-fail",
          flightNumber: "AF9",
          departureAirportCode: "CDG",
          arrivalAirportCode: "FCO",
          departureDateTime: "2026-06-09T08:00",
          arrivalDateTime: "2026-06-09T10:30",
        },
      ],
      hotels: [
        {
          id: "h-fail",
          name: "Hotel Roma",
          address: "9 Unresolved Via, Rome",
          checkIn: "2026-06-09",
          checkOut: "2026-06-12",
          arrivalTime: "15:00",
        },
      ],
    });

    const checkIn = snapshot.events.find((e) => e.type === "hotel-checkin");
    assert.ok(checkIn?.travelIn);
    assert.equal(checkIn.travelIn.unresolved, true);
    assert.equal(checkIn.travelIn.durationSeconds, null);
    assert.equal(checkIn.travelIn.durationText, null);
    assert.equal(checkIn.travelIn.distanceText, null);
    assert.equal(checkIn.travelIn.arriveBy, null);
    assert.equal(checkIn.travelIn.source, "arrival-transfer");
  });
});
