import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeline } from "./buildTimeline.js";

describe("buildTimeline attraction day", () => {
  it("places the event on scheduledDate even if scheduledDateTime is an older day", () => {
    const { events } = buildTimeline({
      attractions: [
        {
          id: "louvre-1",
          name: "Louvre",
          status: "planned",
          scheduledDate: "2026-09-12",
          scheduledTime: "10:00",
          scheduledDateTime: "2026-09-10T10:00",
        },
      ],
    });

    assert.equal(events.length, 1);
    assert.equal(String(events[0].start).slice(0, 10), "2026-09-12");
  });
});
