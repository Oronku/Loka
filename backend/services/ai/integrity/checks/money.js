import { buildFinding } from "../types.js";
import { parsePrice } from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

/** @param {object[]} items @param {string} currencyField @returns {Record<string, number>} */
function sumByCurrency(items, amountField, currencyField = "currency") {
  /** @type {Record<string, number>} */
  const totals = {};
  for (const item of items) {
    const amount = parsePrice(item[amountField] ?? item.amount ?? item.price);
    if (amount == null) continue;
    const cur = String(item[currencyField] || item.currency || "USD").toUpperCase();
    totals[cur] = (totals[cur] || 0) + amount;
  }
  return totals;
}

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkMoney(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { trip } = ctx;
  const budget = trip.budget;
  const expenses = (trip.expenses || []).filter((e) => e?.category !== "settlement");

  const committedFlights = (trip.flights || [])
    .filter((f) => f.price != null || f.totalAmount != null)
    .map((f) => ({
      amount: parsePrice(f.totalAmount ?? f.price),
      currency: f.currency || budget?.currency || "USD",
    }))
    .filter((f) => f.amount != null);

  const committedHotels = (trip.hotels || [])
    .filter((h) => h.totalPrice != null || h.price != null)
    .map((h) => ({
      amount: parsePrice(h.totalPrice ?? h.price),
      currency: h.currency || budget?.currency || "USD",
    }))
    .filter((h) => h.amount != null);

  const committedAttractions = (trip.attractions || [])
    .filter((a) => a.status === "booked" && a.price != null)
    .map((a) => ({
      amount: parsePrice(a.price),
      currency: a.currency || budget?.currency || "USD",
    }))
    .filter((a) => a.amount != null);

  const committed = [
    ...committedFlights.map((x) => ({ ...x, source: "flight" })),
    ...committedHotels.map((x) => ({ ...x, source: "hotel" })),
    ...committedAttractions.map((x) => ({ ...x, source: "attraction" })),
    ...expenses.map((e) => ({
      amount: parsePrice(e.amount),
      currency: e.currency || budget?.currency || "USD",
      source: "expense",
    })),
  ].filter((x) => x.amount != null);

  const totalsByCurrency = sumByCurrency(committed, "amount");
  const currencies = Object.keys(totalsByCurrency);

  const hasBudget =
    budget &&
    typeof budget.totalBudget === "number" &&
    budget.totalBudget > 0;
  const budgetCurrency = (budget?.currency || "USD").toUpperCase();

  if (currencies.length > 1 || (currencies.length === 1 && currencies[0] !== budgetCurrency && hasBudget)) {
    findings.push(
      buildFinding({
        code: "currency_mismatch",
        axisIds: ["money"],
        kind: "unknown",
        severity: 2,
        title: "Costs use mixed currencies",
        detail: `Committed costs span ${currencies.join(", ")} — cannot total against ${budgetCurrency} without conversion.`,
        titleKey: "integrity.money.currencyMismatch.title",
        detailKey: "integrity.money.currencyMismatch.detail",
        detailParams: { currencies, budgetCurrency },
        evidence: currencies.map((c) => ({
          what: `committed.${c}`,
          value: totalsByCurrency[c],
          source: "trip",
        })),
        resolution: {
          kind: "verify_fact",
          hint: "Confirm FX rates or normalize currencies before comparing to budget.",
        },
      }),
    );
  }

  if (hasBudget && currencies.length <= 1) {
    const committedTotal = totalsByCurrency[budgetCurrency] || 0;
    if (committedTotal > budget.totalBudget) {
      findings.push(
        buildFinding({
          code: "committed_over_budget",
          axisIds: ["money"],
          kind: "broken",
          severity: 2,
          title: "Committed costs exceed budget",
          detail: `${committedTotal} ${budgetCurrency} committed against ${budget.totalBudget} ${budgetCurrency} budget.`,
          titleKey: "integrity.money.overBudget.title",
          detailKey: "integrity.money.overBudget.detail",
          detailParams: {
            committed: committedTotal,
            budget: budget.totalBudget,
            currency: budgetCurrency,
          },
          evidence: [
            { what: "committedTotal", value: committedTotal, source: "trip" },
            { what: "totalBudget", value: budget.totalBudget, source: "trip.budget" },
          ],
          resolution: {
            kind: "propose_change",
            hint: "Trim committed spend or raise the budget.",
          },
        }),
      );
    }
  }

  if (Array.isArray(budget?.categories)) {
    for (const cat of budget.categories) {
      if (typeof cat.budgeted !== "number" || typeof cat.spent !== "number") continue;
      if (cat.spent > cat.budgeted) {
        findings.push(
          buildFinding({
            code: "category_over_budget",
            axisIds: ["money"],
            kind: "at_risk",
            severity: 2,
            title: `${cat.name || "Category"} over budget`,
            detail: `${cat.spent} spent of ${cat.budgeted} budgeted.`,
            titleKey: "integrity.money.categoryOver.title",
            detailKey: "integrity.money.categoryOver.detail",
            detailParams: {
              category: cat.name || "Category",
              spent: cat.spent,
              budgeted: cat.budgeted,
            },
            evidence: [
              { what: "category", value: cat.name, source: "trip.budget" },
              { what: "spent", value: cat.spent, source: "trip.budget" },
              { what: "budgeted", value: cat.budgeted, source: "trip.budget" },
            ],
            resolution: {
              kind: "propose_change",
              hint: "Rebalance category spend or increase allocation.",
            },
          }),
        );
      }
    }
  }

  const hasExpensivePlans =
    committedFlights.length > 0 ||
    committedHotels.length > 0 ||
    (trip.attractions || []).some((a) => a.status === "booked" && parsePrice(a.price));

  if (!hasBudget && hasExpensivePlans) {
    findings.push(
      buildFinding({
        code: "no_budget_with_spend",
        axisIds: ["money"],
        kind: "at_risk",
        severity: 1,
        title: "Spend piling up with no budget",
        detail: "Flights, hotels, or bookings exist but no total budget is set.",
        titleKey: "integrity.money.noBudget.title",
        detailKey: "integrity.money.noBudget.detail",
        evidence: [{ what: "hasCommittedCosts", value: true, source: "trip" }],
        resolution: {
          kind: "propose_change",
          hint: "Set a trip budget to track whether plans still close.",
        },
      }),
    );
  }

  return findings;
}
