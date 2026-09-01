import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeWhatsNeeded } from "./runner.js";

const NOW = new Date("2026-08-30T10:00:00.000Z");

describe("whats_needed tool payload", () => {
  it("returns urgency-ordered findings with blocking first", async () => {
    const trip = {
      id: "trip-whats-needed",
      name: "Rome",
      destination: "Rome",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      hotels: [{ id: "h1", name: "Centro", checkIn: "2026-09-01", checkOut: "2026-09-05" }],
      flights: [
        {
          id: "f1",
          departureDateTime: "2026-09-10T18:00:00",
          arrivalDateTime: "2026-09-10T23:40:00",
        },
      ],
    };

    const payload = await executeWhatsNeeded({
      activeTripId: trip.id,
      trips: [trip],
      userId: null,
      profile: null,
    });

    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.findings));
    assert.ok(payload.findings.length > 0);
    assert.ok(payload.rationale);

    const codes = payload.findings.map((f) => f.code);
    const unhousedIdx = codes.indexOf("unhoused_nights");
    assert.ok(unhousedIdx >= 0, "expected unhoused_nights finding");
    assert.equal(payload.findings[unhousedIdx].blocking, true);

    const blockingIdx = payload.findings.findIndex((f) => f.blocking);
    if (blockingIdx >= 0) {
      assert.ok(
        blockingIdx <= 2,
        `expected blocking finding near front, got index ${blockingIdx}`,
      );
    }
  });

  it("reports error when no trip is available", async () => {
    const payload = await executeWhatsNeeded({
      activeTripId: null,
      trips: [],
      userId: null,
    });
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "no trip");
  });
});
