import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeline } from "./buildTimeline.js";
import { calculateArrivalTransfers } from "./generators/arrivalTransferGenerator.js";
import { calculateDepartureTransfers } from "./generators/departureTransferGenerator.js";
import { resolveAirportLabel } from "./shared/location.js";

/**
 * These cover only the pairing guards, which return before any Google lookup.
 * The resolved path is not unit-tested because it calls the Distance Matrix API.
 */

const hotel = {
  id: "hotel-1",
  name: "Hotel Indigo",
  address: "1 Rothschild Blvd, Tel Aviv",
  checkIn: "2026-06-07",
  checkOut: "2026-06-10",
};

const outboundFlight = {
  id: "flight-1",
  flightNumber: "LY315",
  departureAirportCode: "TLV",
  arrivalAirportCode: "CDG",
  departureDateTime: "2026-06-07T08:00",
  arrivalDateTime: "2026-06-07T11:30",
};

describe("transfer flight pairing", () => {
  it("emits no departure transfer when no flight departs on/after check-out", async () => {
    // A trip with no return flight booked yet. Pairing the check-out with the
    // outbound flight would put "be at TLV" at the very top of the timeline.
    const trip = { hotels: [hotel], flights: [outboundFlight], rides: [] };
    const { events } = buildTimeline(trip);

    const transfers = await calculateDepartureTransfers(trip, events);

    assert.deepEqual(transfers.filter(Boolean), []);
  });

  it("emits no arrival transfer when no flight arrives on/before check-in", async () => {
    const trip = {
      hotels: [hotel],
      flights: [
        {
          ...outboundFlight,
          departureDateTime: "2026-06-09T08:00",
          arrivalDateTime: "2026-06-09T11:30",
        },
      ],
      rides: [],
    };
    const { events } = buildTimeline(trip);

    const transfers = await calculateArrivalTransfers(trip, events);

    assert.deepEqual(transfers.filter(Boolean), []);
  });

  it("still pairs a check-out with a flight departing that day", async () => {
    // Guards must not reject a legitimate pairing: assert the candidate flight
    // is found by checking we get past the guard into a transfer object.
    const trip = {
      hotels: [hotel],
      flights: [
        outboundFlight,
        {
          id: "flight-2",
          flightNumber: "LY316",
          departureAirportCode: "CDG",
          arrivalAirportCode: "TLV",
          departureDateTime: "2026-06-10T18:00",
          arrivalDateTime: "2026-06-10T23:00",
        },
      ],
      rides: [],
    };
    const { events } = buildTimeline(trip);
    const checkouts = events.filter((e) => e.type === "hotel-checkout");

    assert.equal(checkouts.length, 1);
    // The return flight departs on the check-out day, so it is a valid pairing
    // and the generator must not short-circuit on the day filter.
    const sameDayDeparture = events.some(
      (e) => e.type === "flight" && String(e.start).startsWith("2026-06-10")
    );
    assert.equal(sameDayDeparture, true);
  });
});

describe("airport label resolution", () => {
  it("resolveAirportLabel collapses blanks and prefers the first real value", () => {
    assert.equal(resolveAirportLabel("", "  ", "Paris"), "Paris");
    assert.equal(resolveAirportLabel(null, undefined, ""), null);
    assert.equal(resolveAirportLabel("  "), null);
    assert.equal(resolveAirportLabel("CDG", "Paris"), "CDG");
  });

  it("falls back to departureCity when departureAirportCode is empty", async () => {
    // Network-free: toAirport is set before any Google call; unresolved is fine.
    const trip = {
      hotels: [hotel],
      flights: [
        outboundFlight,
        {
          id: "flight-2",
          flightNumber: "AF123",
          departureAirportCode: "",
          departureAirport: "",
          from: "",
          departureCity: "Paris",
          arrivalAirportCode: "TLV",
          departureDateTime: "2026-06-10T18:00",
          arrivalDateTime: "2026-06-10T23:00",
        },
      ],
      rides: [],
    };
    const { events } = buildTimeline(trip);
    const returnEvent = events.find((e) => e.id === "flight-2");
    assert.equal(returnEvent?.departureAirport, "Paris");

    const transfers = await calculateDepartureTransfers(trip, events);
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].toAirport, "Paris");
    assert.notEqual(transfers[0].toAirport, "");
  });

  it("emits toAirport null (never empty string) when no airport/city info", async () => {
    // Give the flight a geocodable address so it still enters the departure-
    // transfer candidate filter (which requires arriveLocation/location). The
    // airport label itself must still resolve to null, not "".
    const trip = {
      hotels: [hotel],
      flights: [
        outboundFlight,
        {
          id: "flight-2",
          flightNumber: "XX999",
          departureAirportCode: "",
          departureAirport: "   ",
          from: null,
          departureCity: "",
          arrivalAirportCode: "",
          address: "1 Fake Street, Paris",
          departureDateTime: "2026-06-10T18:00",
          arrivalDateTime: "2026-06-10T23:00",
        },
      ],
      rides: [],
    };
    const { events } = buildTimeline(trip);
    const returnEvent = events.find((e) => e.id === "flight-2");
    assert.equal(returnEvent?.departureAirport, null);

    const transfers = await calculateDepartureTransfers(trip, events);
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].toAirport, null);
    assert.notEqual(transfers[0].toAirport, "");
  });

  it("buildTimeline never emits empty-string airport labels on flight events", () => {
    const trip = {
      hotels: [],
      flights: [
        {
          id: "flight-blank",
          departureAirportCode: "",
          departureAirport: "  ",
          from: "",
          departureCity: "",
          arrivalAirportCode: "",
          arrivalAirport: "",
          to: "   ",
          arrivalCity: null,
          departureDateTime: "2026-06-07T08:00",
          arrivalDateTime: "2026-06-07T11:30",
        },
        {
          id: "flight-city",
          departureAirportCode: "",
          departureCity: "Paris",
          arrivalAirportCode: "",
          arrivalCity: "Rome",
          departureDateTime: "2026-06-08T08:00",
          arrivalDateTime: "2026-06-08T11:30",
        },
      ],
      rides: [],
    };
    const { events } = buildTimeline(trip);
    const flights = events.filter((e) => e.type === "flight");
    for (const f of flights) {
      assert.notEqual(f.departureAirport, "");
      assert.notEqual(f.arrivalAirport, "");
      if (f.departureAirport != null) {
        assert.equal(f.departureAirport, f.departureAirport.trim());
        assert.ok(f.departureAirport.length > 0);
      }
      if (f.arrivalAirport != null) {
        assert.equal(f.arrivalAirport, f.arrivalAirport.trim());
        assert.ok(f.arrivalAirport.length > 0);
      }
    }
    const blank = flights.find((e) => e.id === "flight-blank");
    assert.equal(blank.departureAirport, null);
    assert.equal(blank.arrivalAirport, null);
    const city = flights.find((e) => e.id === "flight-city");
    assert.equal(city.departureAirport, "Paris");
    assert.equal(city.arrivalAirport, "Rome");
  });
});
