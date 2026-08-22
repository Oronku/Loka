import assert from "node:assert/strict";
import {
  hasPaidBy,
  isDraftExpense,
  isDraftExpenseInput,
  parseFinitePrice,
  upsertDraftItemExpense,
} from "./draftItemExpense.js";

assert.equal(parseFinitePrice(4000), 4000);
assert.equal(parseFinitePrice("4000"), 4000);
assert.equal(parseFinitePrice(0), null);
assert.equal(parseFinitePrice(""), null);
assert.equal(hasPaidBy(undefined), false);
assert.equal(hasPaidBy(null), false);
assert.equal(hasPaidBy(""), false);
assert.equal(hasPaidBy([]), false);
assert.equal(hasPaidBy("user-1"), true);
assert.equal(isDraftExpense({ title: "x" }), true);
assert.equal(isDraftExpenseInput({ title: "x", splits: [] }), true);
assert.equal(isDraftExpenseInput({ title: "x", splits: [{ userId: "a" }] }), false);

const trip = { expenses: [], attractions: [] };
const parliament = {
  id: "attr-parliament",
  name: "Hungarian Parliament",
  price: 4000,
  currency: "HUF",
  scheduledDate: "2026-09-01",
};

const first = upsertDraftItemExpense(trip, {
  item: parliament,
  itemType: "attraction",
  category: "activity",
  createdBy: "owner-1",
});
assert.equal(first.created, true);
assert.equal(first.expenses.length, 1);
assert.equal(first.expenses[0].title, "Hungarian Parliament");
assert.equal(first.expenses[0].amount, 4000);
assert.equal(first.expenses[0].currency, "HUF");
assert.equal(first.expenses[0].category, "activity");
assert.equal(first.expenses[0].date, "2026-09-01");
assert.equal(first.expenses[0].linkedItemType, "attraction");
assert.equal(first.expenses[0].linkedItemId, "attr-parliament");
assert.equal(first.expenses[0].paidBy, undefined);
assert.deepEqual(first.expenses[0].splits, []);
assert.equal(isDraftExpense(first.expenses[0]), true);

const second = upsertDraftItemExpense({ expenses: first.expenses }, {
  item: { ...parliament, price: 4500, name: "Parliament" },
  itemType: "attraction",
  category: "activity",
  createdBy: "owner-1",
});
assert.equal(second.created, false);
assert.equal(second.updated, true);
assert.equal(second.expenses.length, 1);
assert.equal(second.expenses[0].id, first.expenses[0].id);
assert.equal(second.expenses[0].amount, 4500);
assert.equal(second.expenses[0].title, "Parliament");
assert.equal(second.expenses[0].paidBy, undefined);

const recorded = {
  ...first.expenses[0],
  paidBy: "maya",
  splits: [
    { userId: "maya", amount: 2000 },
    { userId: "noam", amount: 2000 },
  ],
};
const skipped = upsertDraftItemExpense({ expenses: [recorded] }, {
  item: { ...parliament, price: 5000 },
  itemType: "attraction",
  category: "activity",
  createdBy: "owner-1",
});
assert.equal(skipped.skippedLedger, true);
assert.equal(skipped.expenses.length, 1);
assert.equal(skipped.expenses[0].amount, 4000);
assert.equal(skipped.expenses[0].paidBy, "maya");

console.log("draftItemExpense.test.js passed");
