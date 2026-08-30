import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  buildOperations,
  dayPrefixedLabel,
  formatDayLabelPrefix,
} from "./runner.js";

const TRIP_ID = "trip-abc";
const USER_TRIP = {
  id: TRIP_ID,
  name: "Rome Trip",
  destination: "Rome",
  startDate: "2026-09-01",
  endDate: "2026-09-05",
  checklist: [{ id: "existing-1", text: "Passport", completed: false }],
  budget: {
    totalBudget: 2000,
    currency: "EUR",
    categories: [{ name: "Food", budgeted: 400, spent: 0 }],
  },
  attractions: [
    {
      id: "slot-1",
      name: "Lunch",
      scheduledDate: "2026-09-02",
      scheduledTime: "12:00",
    },
  ],
};

function call(name, args) {
  return { name, args };
}

describe("buildOperations — checklist tools", () => {
  it("add_checklist_items creates one add op per valid item", async () => {
    const { operations } = await buildOperations(
      [
        call("add_checklist_items", {
          tripId: TRIP_ID,
          items: [
            { text: "  Sunscreen  ", categoryId: "health" },
            { text: "Passport" },
            { text: "   " },
          ],
        }),
      ],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );

    assert.equal(operations.length, 1);
    assert.equal(operations[0].entity, "checklist");
    assert.equal(operations[0].op, "add");
    assert.equal(operations[0].after.text, "Sunscreen");
    assert.equal(operations[0].after.categoryId, "health");
    assert.match(operations[0].after.id, /^health:/);
    assert.match(operations[0].label, /^Add "Sunscreen" to packing$/);
  });

  it("add_checklist_items dedupes within the same call", async () => {
    const { operations } = await buildOperations(
      [
        call("add_checklist_items", {
          tripId: TRIP_ID,
          items: [{ text: "Adapter" }, { text: " adapter " }],
        }),
      ],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 1);
  });

  it("add_checklist_items ignores malformed items array", async () => {
    const { operations } = await buildOperations(
      [call("add_checklist_items", { tripId: TRIP_ID, items: "nope" })],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 0);
  });

  it("remove_checklist_item removes by id", async () => {
    const { operations } = await buildOperations(
      [call("remove_checklist_item", { tripId: TRIP_ID, itemId: "existing-1" })],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 1);
    assert.equal(operations[0].op, "remove");
    assert.equal(operations[0].entity, "checklist");
    assert.equal(operations[0].label, 'Remove "Passport" from packing');
  });

  it("remove_checklist_item skips missing itemId", async () => {
    const { operations } = await buildOperations(
      [call("remove_checklist_item", { tripId: TRIP_ID, itemId: "  " })],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 0);
  });
});

describe("buildOperations — budget and intent", () => {
  it("set_trip_budget requires at least one field", async () => {
    const { operations } = await buildOperations(
      [call("set_trip_budget", { tripId: TRIP_ID })],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 0);
  });

  it("set_trip_budget builds a budget update op with human label", async () => {
    const { operations } = await buildOperations(
      [
        call("set_trip_budget", {
          tripId: TRIP_ID,
          totalBudget: 2400,
          currency: "EUR",
          categories: [{ name: "Food", budgeted: 600 }],
        }),
      ],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 1);
    assert.equal(operations[0].entity, "budget");
    assert.equal(operations[0].op, "update");
    assert.match(operations[0].label, /Set budget to €2,400/);
    assert.match(operations[0].label, /Raise Food budget to €600/);
  });

  it("set_trip_intent merges intent with source loka", async () => {
    const { operations } = await buildOperations(
      [
        call("set_trip_intent", {
          tripId: TRIP_ID,
          pace: "relax",
          vibes: ["foodie"],
        }),
      ],
      { trips: [{ ...USER_TRIP, intent: { pace: "optimize", source: "user" } }], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 1);
    assert.equal(operations[0].entity, "trip");
    assert.equal(operations[0].after.intent.pace, "relax");
    assert.equal(operations[0].after.intent.source, "loka");
    assert.deepEqual(operations[0].after.intent.vibes, ["foodie"]);
  });
});

describe("buildOperations — placeholder events", () => {
  it("add_placeholder_event skips enrichPlace and sets placeholder flags", async () => {
    const { operations } = await buildOperations(
      [
        call("add_placeholder_event", {
          tripId: TRIP_ID,
          title: "Dinner somewhere in Trastevere",
          date: "2026-09-03",
          time: "20:00",
          kind: "meal",
        }),
      ],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 1);
    const item = operations[0].after;
    assert.equal(item.type, "event");
    assert.equal(item.attractionType, "event");
    assert.equal(item.placeholder, true);
    assert.equal(item.placeholderKind, "meal");
    assert.equal(item.placeId, undefined);
    assert.equal(item.status, "planned");
    assert.equal(item.timeConfidence, "guess");
    assert.equal(operations[0].label, dayPrefixedLabel("2026-09-03", item.name));
  });

  it("add_placeholder_event skips occupied slots", async () => {
    const { operations } = await buildOperations(
      [
        call("add_placeholder_event", {
          tripId: TRIP_ID,
          title: "Another lunch",
          date: "2026-09-02",
          time: "12:00",
        }),
      ],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 0);
  });
});

describe("buildOperations — plan_trip_skeleton", () => {
  it("emits ops in chronological day order with day-prefixed labels and groupKey", async () => {
    const { operations, rationale, grouping } = await buildOperations(
      [
        call("plan_trip_skeleton", {
          tripId: TRIP_ID,
          days: [
            {
              date: "2026-09-10",
              blocks: [{ kind: "activity", title: "Out of range day", time: "10:00" }],
            },
            {
              date: "2026-09-03",
              blocks: [{ kind: "activity", title: "Evening stroll", time: "18:00" }],
            },
            {
              date: "2026-09-02",
              blocks: [
                { kind: "restaurant", title: "Lunch near Colosseum", time: "13:00", placeholder: true },
                { kind: "restaurant", title: "Morning coffee", time: "09:00", placeholder: true },
              ],
            },
          ],
        }),
      ],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );

    assert.equal(grouping, "byDay");
    assert.equal(operations.length, 3);
    assert.match(operations[0].label, new RegExp(`^${formatDayLabelPrefix("2026-09-02")} — Morning coffee$`));
    assert.match(operations[1].label, new RegExp(`^${formatDayLabelPrefix("2026-09-02")} — Lunch near Colosseum$`));
    assert.match(operations[2].label, new RegExp(`^${formatDayLabelPrefix("2026-09-03")} — Evening stroll$`));
    assert.equal(operations[0].groupKey, "2026-09-02");
    assert.equal(operations[1].groupKey, "2026-09-02");
    assert.equal(operations[2].groupKey, "2026-09-03");
    assert.match(rationale, /Skipped 1 day\(s\) outside the trip dates \(2026-09-10\)/);
  });

  it("caps at 60 blocks", async () => {
    const dayBlocks = (start) =>
      Array.from({ length: 33 }, (_, i) => ({
        kind: "activity",
        title: `Block ${start + i}`,
        time: `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
        placeholder: true,
      }));
    const { operations, rationale } = await buildOperations(
      [
        call("plan_trip_skeleton", {
          tripId: TRIP_ID,
          days: [
            { date: "2026-09-02", blocks: dayBlocks(0) },
            { date: "2026-09-03", blocks: dayBlocks(33) },
          ],
        }),
      ],
      { trips: [USER_TRIP], activeTripId: TRIP_ID },
    );
    assert.equal(operations.length, 60);
    assert.match(rationale, /capped at 60/i);
  });
});

describe("buildOperations — unknown tool", () => {
  it("throws on unknown write tools", async () => {
    await assert.rejects(
      () =>
        buildOperations([call("not_a_real_tool", { tripId: TRIP_ID })], {
          trips: [USER_TRIP],
          activeTripId: TRIP_ID,
        }),
      /Unknown tool: not_a_real_tool/,
    );
  });
});
