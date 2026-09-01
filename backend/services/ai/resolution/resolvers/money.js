import {
  evidenceValue,
  questionFromFinding,
  syntheticCandidate,
  tripPriorities,
} from "../helpers.js";
import { localDeliberate } from "../localDeliberate.js";
import { criterion } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const moneyResolver = {
  codes: [
    "committed_over_budget",
    "category_over_budget",
    "no_budget_with_spend",
    "currency_mismatch",
  ],

  buildSlots(finding, ctx) {
    return [{
      slotId: `resolve-${finding.code}-${finding.id.slice(0, 8)}`,
      axisId: "money",
      label: finding.title,
      field: finding.code,
    }];
  },

  resolveDirect(finding, ctx) {
    if (finding.code === "currency_mismatch") {
      return {
        finding,
        kind: "verify",
        verifyTask: {
          what: "currency_conversion",
          hint: finding.resolution.hint,
        },
        questions: [questionFromFinding(finding, {
          header: "Currency?",
          field: "budgetCurrency",
          question: "Your costs use mixed currencies — which rate or budget currency should I use?",
          options: [
            { label: "Use my budget currency only", description: "" },
            { label: "I'll provide exchange rates", description: "" },
            { label: "Show costs separately by currency", description: "" },
          ],
        })],
        reasoning: "Never guess FX — need traveler confirmation",
      };
    }

    if (finding.code === "no_budget_with_spend") {
      return {
        finding,
        kind: "question",
        questions: [questionFromFinding(finding, {
          header: "Budget?",
          field: "totalBudget",
          question: "You have committed spend but no total budget — what should I plan against?",
          options: [
            { label: "Set a total budget now", description: "" },
            { label: "Track spend without a cap", description: "" },
            { label: "Rough range — I'll specify", description: "" },
          ],
        })],
        reasoning: finding.resolution.hint,
      };
    }

    if (finding.code === "committed_over_budget" || finding.code === "category_over_budget") {
      return interpretBudgetFix(finding, ctx);
    }

    return null;
  },

  interpret(finding, result, ctx) {
    const direct = moneyResolver.resolveDirect?.(finding, ctx);
    if (direct) return direct;

    return {
      finding,
      kind: "blocked",
      blockedWhy: "Could not resolve budget issue",
    };
  },
};

function interpretBudgetFix(finding, ctx, result = null) {
  const priorities = tripPriorities(ctx.trip);
  const committedTotal = evidenceValue(finding, "committedTotal");
  const totalBudget = evidenceValue(finding, "totalBudget");
  const gap = typeof committedTotal === "number" && typeof totalBudget === "number"
    ? committedTotal - totalBudget
    : evidenceValue(finding, "spent") && evidenceValue(finding, "budgeted")
      ? Number(evidenceValue(finding, "spent")) - Number(evidenceValue(finding, "budgeted"))
      : 200;

  /** @type {import('../../deliberation/constants.js').Candidate[]} */
  const candidates = buildCutCandidates(ctx.trip, gap, priorities);

  const slot = {
    slotId: `fix-budget-${finding.id.slice(0, 8)}`,
    axisId: "money",
    label: "Budget rebalance",
    field: finding.code,
  };

  const extraCriteria = [
    criterion("priority_preservation", "Protect stated priorities", priorities, "intent", "hard", 4),
    criterion("cut_amount", "Closes budget gap", gap, "trip_data", "soft", 3),
  ];

  const local = result || localDeliberate({
    slot,
    candidates,
    trip: ctx.trip,
    profile: ctx.profile,
    axes: ctx.axes,
    extraCriteria,
    useResolutionScoring: true,
    now: ctx.now,
  });

  const decision = local.decisions[0];
  const chosen = decision?.chosen;

  /** @type {object[]} */
  const operations = [];
  if (chosen?.attributes?.itemId) {
    if (chosen.attributes.action === "downgrade") {
      operations.push({
        op: "update",
        entity: chosen.attributes.entity || "attraction",
        itemId: chosen.attributes.itemId,
        after: { price: chosen.attributes.newPrice, status: "idea" },
        provenance: { origin: "model_guess", verified: false, sourceUrl: null, note: "Cheaper swap to fit budget" },
      });
    } else if (chosen.attributes.action === "remove") {
      operations.push({
        op: "remove",
        entity: chosen.attributes.entity || "attraction",
        itemId: chosen.attributes.itemId,
        provenance: { origin: "model_guess", verified: false, sourceUrl: null, note: "Cut to fit budget" },
      });
    }
  }

  const priorityHint = priorities.length
    ? ` — protecting ${priorities.join(", ")} where possible`
    : "";
  const reasoning = chosen
    ? `${chosen.name}${priorityHint}`
    : `Ranked budget cuts by least damage to priorities${priorityHint}`;

  return {
    finding,
    kind: "proposed",
    operations,
    decision,
    reasoning: decision?.reasoning && !/close call/i.test(decision.reasoning)
      ? decision.reasoning
      : reasoning,
    alternatives: decision?.shortlist || candidates,
  };
}

/**
 * @param {object} trip
 * @param {number} gap
 * @param {string[]} priorities
 */
function buildCutCandidates(trip, gap, priorities) {
  /** @type {import('../../deliberation/constants.js').Candidate[]} */
  const candidates = [];

  for (const a of (trip.attractions || []).filter((x) => x.status !== "booked" && x.price > 50)) {
    candidates.push(syntheticCandidate(`cut-${a.id}`, `Drop ${a.name} (save ~${a.price})`, {
      action: "remove",
      itemId: a.id,
      entity: "attraction",
      savings: a.price,
      priorityTags: tagPriorityOverlap(a, priorities),
    }));
  }

  for (const h of (trip.hotels || []).filter((x) => x.status === "idea" && x.price > 100)) {
    candidates.push(syntheticCandidate(`downgrade-${h.id}`, `Cheaper stay instead of ${h.name}`, {
      action: "downgrade",
      itemId: h.id,
      entity: "hotel",
      savings: Math.round((h.price || 0) * 0.3),
      newPrice: Math.round((h.price || 0) * 0.7),
      priorityTags: tagPriorityOverlap(h, priorities),
    }));
  }

  candidates.push(
    syntheticCandidate("cut-dining", "Reduce dining budget for 2 days", {
      action: "rebalance",
      savings: Math.min(gap, 80),
      priorityTags: ["food"],
    }),
    syntheticCandidate("cut-activities", "Swap premium activities for free options", {
      action: "rebalance",
      savings: Math.min(gap, 120),
      priorityTags: ["activities", "culture"],
    }),
    syntheticCandidate("raise-budget", "Raise total budget slightly", {
      action: "raise_budget",
      savings: 0,
      priorityTags: priorities.slice(0, 1),
    }),
  );

  return candidates.slice(0, 6);
}

function tagPriorityOverlap(item, priorities) {
  const name = String(item.name || "").toLowerCase();
  return priorities.filter((p) => name.includes(String(p).toLowerCase()) || String(p).toLowerCase().includes(name.slice(0, 4)));
}
