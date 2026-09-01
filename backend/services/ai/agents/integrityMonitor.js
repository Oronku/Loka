/**
 * Integrity Monitor agent.
 *
 * Surfaces blocking or deadline-imminent integrity findings as feed notifications.
 * Conservative dedupe — same finding is not re-raised within the cooldown window.
 */

import { getAxes } from "../axisMemory.js";
import { assessTripIntegrity } from "../integrity/index.js";
import { daysUntilDeadline } from "../integrity/urgency.js";

const AGENT_SOURCE = "agent:integrityMonitor";
const FINDING_COOLDOWN_MS = 72 * 60 * 60 * 1000;
const TRIP_RUN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_RAISES_PER_RUN = 2;
const DEADLINE_HORIZON_DAYS = 14;

function tripLabel(trip) {
  return trip.name || trip.destination || "your trip";
}

/** @param {import("../integrity/types.js").Finding} finding @param {Date} now */
function isActionable(finding, now) {
  if (finding.blocking || finding.kind === "broken") return true;
  if (!finding.deadline) return false;
  const days = daysUntilDeadline(finding, now);
  return days != null && days >= 0 && days <= DEADLINE_HORIZON_DAYS;
}

function notificationText(finding) {
  let text = finding.title || finding.detail;
  if (finding.deadline) {
    text = `${text} — deadline **${finding.deadline}**.`;
  }
  return text;
}

export default {
  name: "integrityMonitor",
  label: "Integrity Monitor",

  /** @param {import("./runner.js").AgentContext} ctx */
  async run(ctx) {
    const { db, user, trips, now, tools } = ctx;
    const effects = [];

    for (const trip of trips) {
      const tripId = trip.id || trip._id?.toString();
      if (!tripId) continue;

      const tripRunKey = `integrityMonitor:trip:${tripId}`;
      if (await tools.hasRecentRun(tripRunKey, TRIP_RUN_COOLDOWN_MS)) continue;

      const axes = await getAxes(db, tripId, user.id, { trip });
      const assessment = assessTripIntegrity(trip, { axes, now, profile: null });
      const candidates = assessment.findings.filter((f) => isActionable(f, now));

      let raised = 0;
      for (const finding of candidates) {
        if (raised >= MAX_RAISES_PER_RUN) break;

        const dedupKey = `integrityMonitor:finding:${tripId}:${finding.code}`;
        if (await tools.hasRecentRun(dedupKey, FINDING_COOLDOWN_MS)) continue;

        await tools.emitMessage({
          text: `**${tripLabel(trip)}** — ${notificationText(finding)}`,
          tripId,
          type: "heads_up",
          source: AGENT_SOURCE,
          title: finding.blocking ? "Trip blocker" : "Time-sensitive",
        });
        await tools.recordRun(dedupKey, { tripId, code: finding.code, findingId: finding.id });
        effects.push({ tripId, code: finding.code, findingId: finding.id });
        raised += 1;
      }

      if (raised > 0) {
        await tools.recordRun(tripRunKey, { tripId, raised });
      }
    }

    return effects;
  },
};
