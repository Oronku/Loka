import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { buildOperations } from "../ai/runner.js";
import googleApi from "../googleApi.js";
import { buildTimeline } from "./buildTimeline.js";
import { recalculateTimeline } from "./engine/TimelineEngine.js";
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

afterEach(() => {
  mock.restoreAll();
});

async function flightFromAddFlight(args) {
  const built = await buildOperations(
    [{ name: "add_flight", args: { tripId: "trip-1", ...args } }],
    { trips: [], activeTripId: "trip-1" },
  );
  const op = built.operations[0];
  assert.equal(op?.entity, "flight");
  return op.after;
}

const hotel = {
  id: "h1",
  name: "Hotel Indigo",
  address: "1 Rothschild Blvd, Tel Aviv",
  coordinates: { lat: 32.062, lng: 34.77 },
  checkIn: "2026-06-07",
  checkOut: "2026-06-10",
  arrivalTime: "15:00",
};

describe("Loka add_flight arrival clock", () => {
  it("maps arrivalTime into arrivalDateTime, ends the flight, and pairs an arrival transfer", async () => {
    stubGoogleTravel();
    const land = "2026-06-07T20:10";
    const flight = await flightFromAddFlight({
      airline: "El Al",
      flightNumber: "LY001",
      departure: "JFK",
      arrival: "TLV",
      date: "2026-06-07",
      time: "10:00",
      arrivalTime: "20:10",
    });

    assert.equal(flight.departureDateTime, "2026-06-07T10:00");
    assert.equal(flight.arrivalDateTime, land);
    assert.equal(flight.airline, "El Al");
    assert.equal(flight.flightNumber, "LY001");
    assert.equal(flight.departureAirportCode, "JFK");
    assert.equal(flight.arrivalAirportCode, "TLV");

    const snapshot = await recalculateTimeline({
      flights: [flight],
      hotels: [hotel],
    });

    const event = snapshot.events.find((e) => e.id === flight.id);
    assert.ok(event, "flight should land in events");
    assert.ok(event.end, "arrival clock should produce a non-null end");
    assert.equal(event.end, land);

    const checkIn = snapshot.events.find((e) => e.type === "hotel-checkin");
    assert.ok(checkIn?.travelIn);
    assert.equal(checkIn.travelIn.source, "arrival-transfer");
    assert.equal(checkIn.travelIn.unresolved, false);
    assert.ok(snapshot.transfers.length >= 1);

    const expectedArriveBy = new Date(
      toTime(land) + (POST_FLIGHT_BUFFER_SECONDS + DRIVE_SECONDS) * 1000,
    ).toISOString();
    assert.equal(checkIn.travelIn.arriveBy, expectedArriveBy);
    assert.equal(snapshot.transfers[0].estimatedArrival, expectedArriveBy);
  });

  it("leaves arrivalDateTime unset and end null when Loka omits arrivalTime", async () => {
    const flight = await flightFromAddFlight({
      airline: "El Al",
      flightNumber: "LY315",
      departure: "TLV",
      arrival: "CDG",
      date: "2026-06-07",
      time: "08:00",
    });

    assert.equal("arrivalDateTime" in flight, false);
    assert.equal(flight.departureDateTime, "2026-06-07T08:00");

    const { events, unscheduled } = buildTimeline({ flights: [flight] });
    assert.equal(unscheduled.filter((e) => e.type === "flight").length, 0);
    const event = events.find((e) => e.id === flight.id);
    assert.ok(event, "flight should land in events");
    assert.equal(event.end, null);
    assert.equal(Number.isNaN(event.sortKey), false);
    assert.equal(event.sortKey, new Date("2026-06-07T08:00").getTime());
  });

  it("uses arrivalDate for overnight landings", async () => {
    const flight = await flightFromAddFlight({
      flightNumber: "LY026",
      departure: "TLV",
      arrival: "JFK",
      date: "2026-06-07",
      time: "23:10",
      arrivalTime: "06:15",
      arrivalDate: "2026-06-08",
    });

    assert.equal(flight.departureDateTime, "2026-06-07T23:10");
    assert.equal(flight.arrivalDateTime, "2026-06-08T06:15");
  });
});
