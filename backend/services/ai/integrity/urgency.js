import { dateOnly, daysBetweenDateStrings } from "./utils.js";

/** @typedef {import('./types.js').Finding} Finding */

/**
 * Priority tier — lower number sorts first (more urgent).
 * @param {Finding} f
 * @returns {number}
 */
export function priorityTier(f) {
  if (f.blocking) return 0;
  if (f.kind === "broken") return 1;
  if (f.kind === "at_risk") return 2;
  return 3;
}

/**
 * Days until deadline; null when no deadline.
 * @param {Finding} f
 * @param {Date|string} now
 * @returns {number|null}
 */
export function daysUntilDeadline(f, now) {
  if (!f.deadline) return null;
  const today = dateOnly(now instanceof Date ? now.toISOString() : now);
  if (!today) return null;
  return daysBetweenDateStrings(f.deadline, today);
}

/**
 * Numeric urgency — higher means more urgent. Exported for tests and sorting.
 * @param {Finding} f
 * @param {Date|string} now
 * @returns {number}
 */
export function computeUrgency(f, now) {
  let score = 0;

  // Tier 1: blocking / broken dominate
  if (f.blocking) score += 1_000_000;
  if (f.kind === "broken") score += 500_000;
  else if (f.kind === "at_risk") score += 200_000;
  else score += 50_000;

  // Irreversibility: deadline-bearing findings outrank open-ended gaps
  if (f.deadline) {
    score += 100_000;
    const days = daysUntilDeadline(f, now);
    if (days != null) {
      // Closer deadlines score higher (2 days beats 21 days)
      score += Math.max(0, 50_000 - days * 2_000);
    }
  }

  score += f.severity * 1_000;
  return score;
}

/**
 * Comparator — most urgent first.
 * @param {Finding} a
 * @param {Finding} b
 * @param {Date|string} now
 * @returns {number}
 */
export function compareFindings(a, b, now) {
  const tierA = priorityTier(a);
  const tierB = priorityTier(b);
  if (tierA !== tierB) return tierA - tierB;

  const hasDeadlineA = Boolean(a.deadline);
  const hasDeadlineB = Boolean(b.deadline);
  if (hasDeadlineA !== hasDeadlineB) return hasDeadlineA ? -1 : 1;

  const daysA = daysUntilDeadline(a, now);
  const daysB = daysUntilDeadline(b, now);
  if (daysA != null && daysB != null && daysA !== daysB) return daysA - daysB;
  if (daysA != null && daysB == null) return -1;
  if (daysA == null && daysB != null) return 1;

  if (a.severity !== b.severity) return b.severity - a.severity;

  const urgA = computeUrgency(a, now);
  const urgB = computeUrgency(b, now);
  return urgB - urgA;
}

/**
 * @param {Finding[]} findings
 * @param {Date|string} now
 * @returns {Finding[]}
 */
export function sortFindings(findings, now) {
  return [...findings]
    .map((f) => ({ ...f, urgency: computeUrgency(f, now) }))
    .sort((a, b) => compareFindings(a, b, now));
}

/**
 * @param {Finding[]} findings
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 * @param {Date|string} [opts.now]
 * @returns {{ findings: Finding[], rationale: string }}
 */
export function whatTripNeedsNow(findings, { limit = 5, now = new Date() } = {}) {
  const ordered = sortFindings(findings, now);
  const top = ordered.slice(0, limit);

  let rationale = "No integrity issues detected.";
  if (top.length > 0) {
    const hasDeadline = top.some((f) => f.deadline);
    const hasBlocking = top.some((f) => f.blocking || f.kind === "broken");
    if (hasBlocking) {
      rationale =
        "Blocking contradictions and proven failures come first — the trip cannot stand as planned until these are resolved.";
    } else if (hasDeadline) {
      rationale =
        "Time-critical windows that will close soon outrank gaps you can fix anytime — irreversibility drives the order.";
    } else {
      rationale = "Highest-severity risks without imminent deadlines, ordered by severity.";
    }
  }

  return { findings: top, rationale };
}
