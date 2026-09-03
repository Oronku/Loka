import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeline } from "./buildTimeline.js";

describe("buildTimeline ride events", () => {
  it("schedules a ride that only has split date + time", () => {
    const { events, unscheduled } = buildTimeline({
      rides: [
        {
          id: "ride-split",
          pickup: "Airport",
          dropoff: "Hotel",
          date: "2026-08-05",
          time: "08:30",
        },
      ],
    });

    assert.equal(unscheduled.filter((e) => e.type === "ride").length, 0);
    const ride = events.find((e) => e.id === "ride-split");
    assert.ok(ride, "ride should land in events");
    assert.equal(ride.start, "2026-08-05T08:30");
    assert.equal(ride.end, "2026-08-05T08:30");
    assert.equal(ride.arrival, "2026-08-05T08:30");
    assert.equal(Number.isNaN(ride.sortKey), false);
    assert.equal(typeof ride.sortKey, "number");
  });

  it("prefers pickupDateTime over split date + time", () => {
    const { events, unscheduled } = buildTimeline({
      rides: [
        {
          id: "ride-combined",
          pickup: "A",
          dropoff: "B",
          pickupDateTime: "2026-08-05T14:00",
          date: "2026-08-05",
          time: "08:30",
        },
      ],
    });

    assert.equal(unscheduled.filter((e) => e.type === "ride").length, 0);
    const ride = events.find((e) => e.id === "ride-combined");
    assert.ok(ride);
    assert.equal(ride.start, "2026-08-05T14:00");
    assert.equal(ride.end, "2026-08-05T14:00");
    assert.equal(ride.arrival, "2026-08-05T14:00");
    assert.equal(ride.sortKey, new Date("2026-08-05T14:00").getTime());
  });

  it("uses resolved pickup for end/arrival when dropoff is missing", () => {
    const { events } = buildTimeline({
      rides: [
        {
          id: "ride-no-dropoff",
          pickup: "A",
          dropoff: "B",
          pickupDateTime: "2026-08-05T11:15",
        },
      ],
    });

    const ride = events.find((e) => e.id === "ride-no-dropoff");
    assert.ok(ride);
    assert.equal(ride.start, "2026-08-05T11:15");
    assert.equal(ride.end, "2026-08-05T11:15");
    assert.equal(ride.arrival, "2026-08-05T11:15");
  });

  it("keeps a ride with no date information in unscheduled", () => {
    const { events, unscheduled } = buildTimeline({
      rides: [
        {
          id: "ride-blank",
          type: "transfer",
          pickup: "Airport",
          dropoff: "Hotel",
        },
      ],
    });

    assert.equal(events.filter((e) => e.type === "ride").length, 0);
    const ride = unscheduled.find((e) => e.id === "ride-blank");
    assert.ok(ride);
    assert.equal(ride.start, null);
    assert.equal(ride.end, null);
    assert.equal(ride.arrival, null);
    assert.equal(ride.sortKey, null);
  });

  it("sorts a date+time ride between a same-day flight and hotel check-in", () => {
    const { events } = buildTimeline({
      flights: [
        {
          id: "flight-1",
          flightNumber: "LY100",
          departureDateTime: "2026-08-05T06:00",
          arrivalDateTime: "2026-08-05T09:00",
        },
      ],
      hotels: [
        {
          id: "hotel-1",
          name: "City Hotel",
          checkIn: "2026-08-05",
          checkOut: "2026-08-08",
          arrivalTime: "15:00",
        },
      ],
      rides: [
        {
          id: "ride-midday",
          pickup: "Airport",
          dropoff: "City Hotel",
          date: "2026-08-05",
          time: "10:00",
        },
      ],
    });

    const flightIdx = events.findIndex((e) => e.type === "flight");
    const rideIdx = events.findIndex((e) => e.id === "ride-midday");
    const hotelIdx = events.findIndex((e) => e.type === "hotel-checkin");

    assert.ok(flightIdx >= 0);
    assert.ok(rideIdx >= 0);
    assert.ok(hotelIdx >= 0);
    assert.ok(
      flightIdx < rideIdx && rideIdx < hotelIdx,
      `expected flight < ride < hotel-checkin, got [${events
        .map((e) => e.type)
        .join(", ")}]`,
    );
  });

  it("accepts a full ISO datetime stored in time (chat AI shape)", () => {
    const { events, unscheduled } = buildTimeline({
      rides: [
        {
          id: "ride-iso-time",
          pickup: "BUS",
          dropoff: "Hotel",
          date: "2026-08-05",
          time: "2026-08-05T08:30:00+04:00",
        },
      ],
    });

    assert.equal(unscheduled.filter((e) => e.type === "ride").length, 0);
    const ride = events.find((e) => e.id === "ride-iso-time");
    assert.ok(ride);
    assert.equal(ride.start, "2026-08-05T08:30:00+04:00");
    assert.equal(Number.isNaN(ride.sortKey), false);
  });
});
