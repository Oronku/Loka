/** Shared remainder-safe split math for `trip.expenses[]`. */

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Equal split; last person gets the leftover cents so shares sum to `total`. */
export function distributeAmong(total, count) {
  if (count <= 0 || !Number.isFinite(total)) return [];
  if (count === 1) return [round2(total)];

  const base = round2(total / count);
  const values = Array.from({ length: count }, () => base);
  const sum = round2(values.reduce((a, b) => a + b, 0));
  values[count - 1] = round2(values[count - 1] + (total - sum));
  return values;
}

/** Weighted split (percentages); last person gets remainder. */
export function distributeByWeights(total, weights) {
  if (!Array.isArray(weights) || weights.length === 0 || !Number.isFinite(total)) {
    return [];
  }
  const weightSum = weights.reduce(
    (acc, w) => acc + (Number.isFinite(w) ? w : 0),
    0,
  );
  if (weightSum <= 0) return weights.map(() => 0);
  if (weights.length === 1) return [round2(total)];

  const values = weights.map((w) =>
    round2((total * (Number.isFinite(w) ? w : 0)) / weightSum),
  );
  const sum = round2(values.reduce((a, b) => a + b, 0));
  values[values.length - 1] = round2(values[values.length - 1] + (total - sum));
  return values;
}

export const SETTLEMENT_CATEGORY = "settlement";

export function isSettlementExpense(expense) {
  return expense?.category === SETTLEMENT_CATEGORY;
}

function sharesFromPersistedAmounts(splits, total) {
  if (!Array.isArray(splits) || splits.length === 0) return null;
  if (!splits.every((s) => s.amount != null && Number.isFinite(s.amount))) {
    return null;
  }
  const persisted = splits.map((s) => ({
    userId: s.userId,
    amount: round2(s.amount),
  }));
  const sum = round2(persisted.reduce((acc, s) => acc + s.amount, 0));
  if (Math.abs(sum - round2(total)) > 0.01) return null;
  return persisted;
}

export function resolveExpenseShares(expense) {
  const splits = expense?.splits ?? [];
  if (splits.length === 0) return [];

  const persisted = sharesFromPersistedAmounts(splits, expense.amount);
  if (persisted) return persisted;

  switch (expense.splitMethod) {
    case "equal": {
      const amounts = distributeAmong(expense.amount, splits.length);
      return splits.map((split, i) => ({
        userId: split.userId,
        amount: amounts[i] ?? 0,
      }));
    }
    case "custom-amount":
      return splits.map((split) => ({
        userId: split.userId,
        amount: round2(split.amount || 0),
      }));
    case "custom-percentage": {
      const amounts = distributeByWeights(
        expense.amount,
        splits.map((s) => s.percentage || 0),
      );
      return splits.map((split, i) => ({
        userId: split.userId,
        amount: amounts[i] ?? 0,
      }));
    }
    default:
      return [];
  }
}

export function persistResolvedSplits(expense) {
  const shares = resolveExpenseShares(expense);
  if (shares.length === 0) return expense;
  return {
    ...expense,
    splits: (expense.splits || []).map((split, i) => ({
      ...split,
      amount: shares[i]?.amount,
    })),
  };
}

export function expenseCurrency(expense) {
  const code = typeof expense?.currency === "string" ? expense.currency.trim() : "";
  return code ? code.toUpperCase() : "USD";
}
