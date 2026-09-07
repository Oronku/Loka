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

  it("keeps dated planned attractions on the itinerary", () => {
    const { events } = buildTimeline({
      attractions: [
        {
          id: "cafe-1",
          name: "New York Café",
          status: "planned",
          scheduledDate: "2026-09-08",
        },
      ],
      hotels: [
        {
          id: "stay-1",
          name: "Hotel Lutetia",
          checkIn: "2026-09-07",
          checkOut: "2026-09-10",
          arrivalTime: "15:00",
        },
      ],
    });

    const titles = events.map((event) => event.title);
    assert.equal(titles.includes("New York Café"), true);
    assert.equal(titles.some((title) => title.includes("Hotel Lutetia")), true);
  });

  it("does not put undated ideas on the itinerary", () => {
    const { events } = buildTimeline({
      attractions: [
        { id: "idea-1", name: "Maybe later", status: "idea" },
      ],
    });
    assert.equal(events.length, 0);
  });
});
