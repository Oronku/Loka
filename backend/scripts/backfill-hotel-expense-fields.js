/**
 * Repair auto-created hotel expenses on trip.expenses[]:
 * - category "Accommodation" → "hotel"
 * - missing currency → hotel.currency, a sibling expense currency, or USD
 *
 * Idempotent. Defaults to dry-run.
 *
 *   node scripts/backfill-hotel-expense-fields.js
 *   node scripts/backfill-hotel-expense-fields.js --dry-run
 *   node scripts/backfill-hotel-expense-fields.js --apply
 */
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";

const VALID_CATEGORIES = new Set([
  "food",
  "hotel",
  "flight",
  "ride",
  "activity",
  "shopping",
  "other",
  "settlement",
]);

function inferCurrency(expense, hotels, siblings) {
  if (typeof expense.currency === "string" && expense.currency.trim()) {
    return expense.currency.trim().toUpperCase();
  }
  const hotel = (hotels || []).find((h) => h && h.id && h.id === expense.linkedHotelId);
  if (typeof hotel?.currency === "string" && hotel.currency.trim()) {
    return hotel.currency.trim().toUpperCase();
  }
  const sibling = (siblings || []).find(
    (e) => e && typeof e.currency === "string" && e.currency.trim(),
  );
  if (sibling) return sibling.currency.trim().toUpperCase();
  return "USD";
}

function needsRepair(expense) {
  if (!expense) return false;
  const badCategory =
    expense.category === "Accommodation" || !VALID_CATEGORIES.has(expense.category);
  const missingCurrency =
    !expense.currency ||
    (typeof expense.currency === "string" && !expense.currency.trim());
  const isHotelLinked = Boolean(expense.linkedHotelId);
  return (
    expense.category === "Accommodation" ||
    (isHotelLinked && (badCategory || missingCurrency))
  );
}

function repairExpense(expense, hotels, siblings) {
  const next = { ...expense };
  if (next.category === "Accommodation" || !VALID_CATEGORIES.has(next.category)) {
    if (next.linkedHotelId || next.category === "Accommodation") {
      next.category = "hotel";
    }
  }
  next.currency = inferCurrency(next, hotels, siblings);
  return next;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const db = await connectToDatabase();
  const trips = await db
    .collection("trips")
    .find({ "expenses.0": { $exists: true } })
    .toArray();

  let tripsTouched = 0;
  let expensesRepaired = 0;

  for (const trip of trips) {
    const expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
    if (!expenses.some(needsRepair)) continue;

    tripsTouched += 1;
    const next = expenses.map((expense) => {
      if (!needsRepair(expense)) return expense;
      expensesRepaired += 1;
      return repairExpense(expense, trip.hotels, expenses);
    });

    if (dryRun) continue;
    const query = trip.id ? { id: trip.id } : { _id: trip._id };
    await db.collection("trips").updateOne(query, {
      $set: { expenses: next, updatedAt: new Date().toISOString() },
    });
  }

  console.log(
    `[backfill-hotel-expense-fields] trips=${tripsTouched} expensesRepaired=${expensesRepaired} dryRun=${dryRun}`,
  );
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
