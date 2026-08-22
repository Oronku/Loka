import { randomUUID } from "crypto";

/** True when paidBy is a real payer (string id or non-empty share list). */
export function hasPaidBy(paidBy) {
  if (typeof paidBy === "string") return paidBy.length > 0;
  if (!Array.isArray(paidBy) || paidBy.length === 0) return false;
  return paidBy.some(
    (payer) => payer && typeof payer.userId === "string" && payer.userId.length > 0,
  );
}

/** Missing paidBy = payment not recorded yet. */
export function isDraftExpense(expense) {
  return !hasPaidBy(expense?.paidBy);
}

/** Client-created draft: no payer and no splits. */
export function isDraftExpenseInput(expense) {
  if (!expense) return false;
  const noSplits = !Array.isArray(expense.splits) || expense.splits.length === 0;
  return !hasPaidBy(expense.paidBy) && noSplits;
}

export function parseFinitePrice(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toDateOnly(value) {
  if (!value || typeof value !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function itemLinkMatches(expense, itemType, itemId) {
  if (!expense || !itemId) return false;
  if (expense.linkedItemType === itemType && expense.linkedItemId === itemId) {
    return true;
  }
  if (itemType === "attraction" && expense.attractionId === itemId) return true;
  if (itemType === "hotel" && expense.linkedHotelId === itemId) return true;
  return false;
}

export function findLinkedItemExpense(expenses, itemType, itemId) {
  if (!itemId) return undefined;
  return (expenses || []).find((expense) => itemLinkMatches(expense, itemType, itemId));
}

function inferItemExpenseCurrency(trip, item, existing) {
  const fromItem = typeof item?.currency === "string" && item.currency.trim();
  if (fromItem) return fromItem.trim().toUpperCase();
  if (existing?.currency) return String(existing.currency).trim().toUpperCase();
  const sibling = (trip.expenses || []).find((expense) => expense?.currency);
  if (sibling?.currency) return String(sibling.currency).trim().toUpperCase();
  return "USD";
}

function itemPrice(item, itemType) {
  if (itemType === "hotel") return parseFinitePrice(item?.cost);
  return parseFinitePrice(item?.price ?? item?.cost);
}

function itemExpenseTitle(item, itemType) {
  if (itemType === "flight") {
    const label = [item?.airline, item?.flightNumber].filter(Boolean).join(" ");
    return label || "Flight";
  }
  if (itemType === "ride") {
    if (item?.provider) return String(item.provider);
    if (item?.pickup && item?.dropoff) return `${item.pickup} → ${item.dropoff}`;
    return "Ride";
  }
  if (typeof item?.name === "string" && item.name.trim()) return item.name.trim();
  return "Expense";
}

function itemExpenseDate(item, itemType) {
  if (itemType === "hotel") return toDateOnly(item?.checkIn);
  if (itemType === "flight") return toDateOnly(item?.departureDateTime);
  if (itemType === "ride") {
    return toDateOnly(item?.pickupDateTime || item?.date);
  }
  return toDateOnly(item?.scheduledDate || item?.scheduledDateTime);
}

function canSafelyBumpRecordedExpense(expense) {
  const splits = expense?.splits || [];
  if (splits.length > 1) return false;
  if (Array.isArray(expense?.paidBy) && expense.paidBy.length > 1) return false;
  return true;
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Upsert a no-payer draft expense for a priced trip item.
 * Idempotent: one expense per item. Updates a draft's amount/title/currency.
 * Recorded ledgers (paidBy or splits) are left alone unless amount can be
 * bumped without rewriting shares.
 */
export function upsertDraftItemExpense(trip, params) {
  const itemType = params.itemType;
  const category = params.category;
  const item = params.item || {};
  const createdBy = params.createdBy;
  const expenses = Array.isArray(trip.expenses) ? [...trip.expenses] : [];
  const itemId = typeof item.id === "string" ? item.id : "";
  const amount = itemPrice(item, itemType);

  const empty = {
    expenses,
    created: false,
    updated: false,
    removed: false,
    skippedLedger: false,
  };

  if (!itemId) return empty;

  const existingIndex = expenses.findIndex((expense) =>
    itemLinkMatches(expense, itemType, itemId),
  );

  if (amount == null) {
    if (existingIndex >= 0 && isDraftExpense(expenses[existingIndex])) {
      expenses.splice(existingIndex, 1);
      return { ...empty, expenses, removed: true };
    }
    return empty;
  }

  const existing = existingIndex >= 0 ? expenses[existingIndex] : null;
  const title = itemExpenseTitle(item, itemType);
  const currency = inferItemExpenseCurrency(trip, item, existing);
  const date = itemExpenseDate(item, itemType) || existing?.date || todayDateOnly();

  if (!existing) {
    const draft = {
      id: `expense-${randomUUID()}`,
      title,
      amount,
      currency,
      category,
      date,
      splitMethod: "equal",
      splits: [],
      createdBy,
      createdAt: new Date().toISOString(),
      linkedItemType: itemType,
      linkedItemId: itemId,
    };
    expenses.push(draft);
    return { ...empty, expenses, created: true };
  }

  if (isDraftExpense(existing) && (!existing.splits || existing.splits.length === 0)) {
    expenses[existingIndex] = {
      ...existing,
      title,
      amount,
      currency,
      date,
      category: existing.category || category,
      linkedItemType: itemType,
      linkedItemId: itemId,
    };
    return { ...empty, expenses, updated: true };
  }

  if (!canSafelyBumpRecordedExpense(existing)) {
    return { ...empty, skippedLedger: true };
  }

  const nextSplits =
    Array.isArray(existing.splits) && existing.splits.length === 1
      ? [{ ...existing.splits[0], amount }]
      : existing.splits;
  const nextPaidBy =
    Array.isArray(existing.paidBy) && existing.paidBy.length === 1
      ? [{ ...existing.paidBy[0], amount }]
      : existing.paidBy;

  expenses[existingIndex] = {
    ...existing,
    title,
    amount,
    currency,
    date,
    splits: nextSplits,
    paidBy: nextPaidBy,
  };
  return { ...empty, expenses, updated: true };
}

/** Drop a still-draft expense when its linked item is deleted. */
export function removeLinkedDraftExpense(expenses, itemType, itemId) {
  const next = Array.isArray(expenses) ? [...expenses] : [];
  const index = next.findIndex(
    (expense) => itemLinkMatches(expense, itemType, itemId) && isDraftExpense(expense),
  );
  if (index >= 0) next.splice(index, 1);
  return next;
}
