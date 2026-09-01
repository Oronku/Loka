import { buildIntegrityContext } from "./context.js";
import { CHECK_REGISTRY } from "./registry.js";
import { sortFindings, whatTripNeedsNow } from "./urgency.js";

/** @typedef {import('./types.js').Finding} Finding */

/** Hard character budget for prompt injection projection. */
export const INTEGRITY_PROMPT_CHAR_BUDGET = 2400;

/**
 * @param {object} trip
 * @param {Object} [opts]
 * @param {object[]} [opts.axes]
 * @param {Date} [opts.now]
 * @param {object|null} [opts.profile]
 */
export function assessTripIntegrity(trip, { axes = [], now = new Date(), profile = null } = {}) {
  const ctx = buildIntegrityContext(trip, { axes, now, profile });
  /** @type {Finding[]} */
  const raw = [];
  for (const check of CHECK_REGISTRY) {
    raw.push(...check(ctx));
  }

  const findings = sortFindings(raw, ctx.now);
  const blocking = findings.filter((f) => f.blocking);

  /** @type {Record<string, Finding[]>} */
  const byAxis = {};
  for (const f of findings) {
    for (const axisId of f.axisIds) {
      if (!byAxis[axisId]) byAxis[axisId] = [];
      byAxis[axisId].push(f);
    }
  }

  let nextDeadline = null;
  for (const f of findings) {
    if (!f.deadline) continue;
    if (!nextDeadline || f.deadline < nextDeadline) nextDeadline = f.deadline;
  }

  return {
    findings,
    blocking,
    byAxis,
    summary: {
      brokenCount: findings.filter((f) => f.kind === "broken").length,
      atRiskCount: findings.filter((f) => f.kind === "at_risk").length,
      unknownCount: findings.filter((f) => f.kind === "unknown").length,
      nextDeadline,
    },
    generatedAt: ctx.now.toISOString(),
  };
}

export { whatTripNeedsNow };

/**
 * @param {ReturnType<typeof assessTripIntegrity>} assessment
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.budget]
 */
export function integrityForPrompt(assessment, { limit = 8, budget = INTEGRITY_PROMPT_CHAR_BUDGET } = {}) {
  if (!assessment?.findings?.length) {
    return { lines: [], text: "", truncated: false };
  }

  const { findings } = whatTripNeedsNow(assessment.findings, { limit });
  /** @type {string[]} */
  const lines = [];
  let truncated = false;

  for (const f of findings) {
    const axes = f.axisIds.join("+");
    const deadline = f.deadline ? ` deadline:${f.deadline}` : "";
    const line = `[${f.code}] ${axes} ${f.kind}${deadline} — ${f.detail}`;
    const next = lines.length ? `${lines.join("\n")}\n${line}` : line;
    if (next.length > budget) {
      truncated = true;
      break;
    }
    lines.push(line);
  }

  return {
    lines,
    text: lines.join("\n"),
    truncated,
    rationale: whatTripNeedsNow(assessment.findings, { limit }).rationale,
  };
}

export { computeUrgency, compareFindings, sortFindings } from "./urgency.js";
export { buildIntegrityContext } from "./context.js";
export { CHECK_REGISTRY } from "./registry.js";
