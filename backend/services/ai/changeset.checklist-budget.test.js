import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  applyEmbeddedOperations,
  mergeBudgetPatch,
  newOperation,
  preflightFailedOpsForTest,
} from "./changeset.js";

const TRIP_ID = "trip-checklist-budget";

function findTrip(trips, query) {
  return trips.find((row) => {
    if (query.id && row.id !== query.id) return false;
    if (query.$or && !query.$or.some((clause) => row.id === clause.id || row._id === clause._id)) {
      return false;
    }
    for (const [key, expected] of Object.entries(query)) {
      if (key === "id" || key === "$or") continue;
      if (key.endsWith(".id")) {
        const field = key.slice(0, -3);
        if (!(row[field] || []).some((item) => item.id === expected)) return false;
      }
    }
    return true;
  });
}

function tripsCollection(trips) {
  return {
    updateOne: async (query, update, options = {}) => {
      const trip = findTrip(trips, query);
      if (!trip) return { matchedCount: 0, modifiedCount: 0 };

      if (update.$push) {
        const [field, payload] = Object.entries(update.$push)[0];
        trip[field] = [...(trip[field] || []), payload];
      }

      if (update.$pull) {
        const [field, clause] = Object.entries(update.$pull)[0];
        trip[field] = (trip[field] || []).filter((item) => item.id !== clause.id);
      }

      if (update.$set) {
        if (options.arrayFilters?.length) {
          const filterId = options.arrayFilters[0]["el.id"];
          for (const [path, value] of Object.entries(update.$set)) {
            if (path === "updatedAt") {
              trip.updatedAt = value;
              continue;
            }
            const match = path.match(/^(\w+)\.\$\[el\]\.(.+)$/);
            if (!match) continue;
            const [, field, key] = match;
            const item = (trip[field] || []).find((row) => row.id === filterId);
            if (item) item[key] = value;
          }
        } else if (update.$set.budget) {
          trip.budget = update.$set.budget;
          trip.updatedAt = update.$set.updatedAt;
        }
      }

      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

function mockDb(trips) {
  return {
    collection(name) {
      if (name === "trips") return tripsCollection(trips);
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

describe("mergeBudgetPatch", () => {
  it("deep-merges categories by name without dropping unmentioned categories", () => {
    const current = {
      totalBudget: 2000,
      currency: "EUR",
      categories: [
        { name: "Food", budgeted: 400, spent: 50 },
        { name: "Lodging", budgeted: 900, spent: 0 },
      ],
    };
    const merged = mergeBudgetPatch(current, {
      categories: [{ name: "Food", budgeted: 600 }],
    });
    assert.equal(merged.totalBudget, 2000);
    assert.equal(merged.categories.length, 2);
    assert.equal(merged.categories.find((c) => c.name === "Food").budgeted, 600);
    assert.equal(merged.categories.find((c) => c.name === "Lodging").budgeted, 900);
    assert.equal(merged.categories.find((c) => c.name === "Food").spent, 50);
  });
});

describe("applyEmbeddedOperations — checklist and budget", () => {
  /** @type {object[]} */
  let trips;

  beforeEach(() => {
    trips = [
      {
        id: TRIP_ID,
        checklist: [{ id: "item-1", text: "Passport", completed: false }],
        budget: {
          totalBudget: 1000,
          currency: "USD",
          categories: [{ name: "Food", budgeted: 200, spent: 0 }],
        },
      },
    ];
  });

  it("adds a checklist item", async () => {
    const db = mockDb(trips);
    const failed = await applyEmbeddedOperations(db, trips[0], [
      newOperation({
        op: "add",
        entity: "checklist",
        after: { id: "new-1", text: "Adapter", completed: false },
        label: 'Add "Adapter" to packing',
      }),
    ]);
    assert.deepEqual(failed, []);
    assert.equal(trips[0].checklist.length, 2);
    assert.equal(trips[0].checklist[1].text, "Adapter");
  });

  it("updates a checklist item", async () => {
    const db = mockDb(trips);
    const failed = await applyEmbeddedOperations(db, trips[0], [
      newOperation({
        op: "update",
        entity: "checklist",
        itemId: "item-1",
        after: { completed: true },
        label: "Mark Passport packed",
      }),
    ]);
    assert.deepEqual(failed, []);
    assert.equal(trips[0].checklist[0].completed, true);
  });

  it("removes a checklist item", async () => {
    const db = mockDb(trips);
    const failed = await applyEmbeddedOperations(db, trips[0], [
      newOperation({
        op: "remove",
        entity: "checklist",
        itemId: "item-1",
        before: trips[0].checklist[0],
        label: 'Remove "Passport" from packing',
      }),
    ]);
    assert.deepEqual(failed, []);
    assert.equal(trips[0].checklist.length, 0);
  });

  it("merge-patches budget without dropping categories", async () => {
    trips[0].budget.categories.push({ name: "Lodging", budgeted: 500, spent: 0 });
    const db = mockDb(trips);
    const failed = await applyEmbeddedOperations(db, trips[0], [
      newOperation({
        op: "update",
        entity: "budget",
        before: trips[0].budget,
        after: {
          totalBudget: 1500,
          categories: [{ name: "Food", budgeted: 350 }],
        },
        label: "Set budget to $1,500",
      }),
    ]);
    assert.deepEqual(failed, []);
    assert.equal(trips[0].budget.totalBudget, 1500);
    assert.equal(trips[0].budget.categories.length, 2);
    assert.equal(trips[0].budget.categories.find((c) => c.name === "Food").budgeted, 350);
    assert.equal(trips[0].budget.categories.find((c) => c.name === "Lodging").budgeted, 500);
  });

  it("preflight fails remove when checklist item is missing", () => {
    const failed = preflightFailedOpsForTest(trips[0], [
      newOperation({
        op: "remove",
        entity: "checklist",
        itemId: "missing-id",
        label: "Remove missing",
      }),
    ]);
    assert.equal(failed.length, 1);
  });
});
