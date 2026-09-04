import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeline } from "./buildTimeline.js";

describe("buildTimeline flight events", () => {
  it("schedules a Loka-shaped flight that only has date + time", () => {
    const { events, unscheduled } = buildTimeline({
      flights: [
        {
          id: "loka-flight",
          airline: "El Al",
          flightNumber: "LY315",
          departure: "TLV",
          arrival: "CDG",
          date: "2026-06-07",
          time: "08:00",
        },
      ],
    });

    assert.equal(unscheduled.filter((e) => e.type === "flight").length, 0);
    const flight = events.find((e) => e.id === "loka-flight");
    assert.ok(flight, "flight should land in events");
    assert.equal(flight.start, "2026-06-07T08:00");
    assert.equal(flight.end, null);
    assert.equal(flight.departureAirport, "TLV");
    assert.equal(flight.arrivalAirport, "CDG");
    assert.equal(Number.isNaN(flight.sortKey), false);
    assert.equal(flight.sortKey, new Date("2026-06-07T08:00").getTime());
  });

  it("sorts a date-only flight datetime as local midnight vs same-day hotel 15:00", () => {
    const { events, unscheduled } = buildTimeline({
      flights: [
        {
          id: "f-date-only",
          flightNumber: "XX1",
          departureDateTime: "2026-06-07",
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

    assert.equal(unscheduled.filter((e) => e.type === "flight").length, 0);
    const flight = events.find((e) => e.id === "f-date-only");
    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.ok(flight);
    assert.ok(checkIn);
    assert.equal(flight.start, "2026-06-07T00:00");
    assert.equal(flight.sortKey, new Date("2026-06-07T00:00").getTime());

    const utcMidnight = new Date("2026-06-07").getTime();
    const localMidnight = new Date("2026-06-07T00:00").getTime();
    if (utcMidnight !== localMidnight) {
      assert.notEqual(flight.sortKey, utcMidnight);
    }
    assert.ok(events.indexOf(flight) < events.indexOf(checkIn));
    assert.ok(flight.sortKey < checkIn.sortKey);
  });

  it("sorts a zoned flight datetime by absolute instant", () => {
    const departure = "2026-08-13T16:15:00+03:00";
    const arrival = "2026-08-13T19:30:00+04:00";
    const { events } = buildTimeline({
      flights: [
        {
          id: "f-zoned",
          flightNumber: "FZ1",
          departureDateTime: departure,
          arrivalDateTime: arrival,
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

    const flight = events.find((e) => e.id === "f-zoned");
    const checkIn = events.find((e) => e.type === "hotel-checkin");
    assert.ok(flight);
    assert.ok(checkIn);
    assert.equal(flight.start, departure);
    assert.equal(flight.sortKey, new Date(departure).getTime());
    assert.ok(checkIn.sortKey > flight.sortKey);
    assert.equal(checkIn.start, "2026-08-13T20:00");
  });
});
