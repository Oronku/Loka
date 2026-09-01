/**
 * Trip Deliberation agent — finishes async think_it_through jobs registered
 * during chat when the scope was too large for one turn.
 */

import { getAxes } from "../axisMemory.js";
import { AGENT_RUNS_COLLECTION } from "./locks.js";
import {
  executeThinkItThrough,
  PENDING_DELIBERATION_KEY_PREFIX,
} from "../thinkItThrough.js";
import { enrichPlace } from "../places.js";
import { webSearch } from "../webSearch.js";

const AGENT_SOURCE = "agent:tripDeliberation";
const RUN_COOLDOWN_MS = 30 * 60 * 1000;

function tripLabel(trip) {
  return trip.name || trip.destination || "your trip";
}

export default {
  name: "tripDeliberation",
  label: "Trip Deliberation",

  /** @param {import("./runner.js").AgentContext} ctx */
  async run(ctx) {
    const { db, user, trips, now, tools } = ctx;
    const effects = [];

    for (const trip of trips) {
      const tripId = trip.id || trip._id?.toString();
      if (!tripId) continue;

      const key = `${PENDING_DELIBERATION_KEY_PREFIX}${tripId}`;
      const pending = await db.collection(AGENT_RUNS_COLLECTION).findOne({
        userId: user.id,
        key,
        status: "pending",
      });
      if (!pending?.args) continue;

      const runKey = `tripDeliberation:running:${tripId}`;
      if (await tools.hasRecentRun(runKey, RUN_COOLDOWN_MS)) continue;

      await db.collection(AGENT_RUNS_COLLECTION).updateOne(
        { userId: user.id, key },
        { $set: { status: "running", lastAt: now } },
      );
      await tools.recordRun(runKey, { tripId });

      const axes = await getAxes(db, tripId, user.id, { trip });
      const result = await executeThinkItThrough(db, {
        tripId,
        userId: user.id,
        trip,
        args: pending.args,
        axes,
        search: webSearch,
        places: enrichPlace,
        now: () => now,
        skipDefer: true,
      });

      if (result.deferred) {
        await db.collection(AGENT_RUNS_COLLECTION).updateOne(
          { userId: user.id, key },
          { $set: { status: "pending", lastAt: now } },
        );
        continue;
      }

      if (result.questions?.length) {
        await tools.emitMessage({
          text: `**${tripLabel(trip)}** — I worked through your open slots but need one quick preference before I suggest anything.`,
          tripId,
          type: "heads_up",
          source: AGENT_SOURCE,
          title: "Quick preference",
        });
        effects.push({ tripId, kind: "questions_pending" });
      } else if (result.operations?.length) {
        const proposal = await tools.emitProposal({
          tripId,
          tripName: tripLabel(trip),
          source: AGENT_SOURCE,
          operations: result.operations,
          text:
            result.decisions?.[0]?.reasoning ||
            "Worked through your open time — here's what fits best.",
        });
        if (proposal) {
          await tools.emitMessage({
            text: `**${tripLabel(trip)}** — I finished looking into your open time. Review the suggestion on your trip.`,
            tripId,
            type: "info",
            source: AGENT_SOURCE,
            title: "Deliberation ready",
          });
          effects.push({ tripId, kind: "proposal", proposalId: proposal._id });
        }
      } else {
        await tools.emitMessage({
          text: `**${tripLabel(trip)}** — I looked into the open slots but couldn't land on verified options yet.`,
          tripId,
          type: "info",
          source: AGENT_SOURCE,
          title: "Still researching",
        });
        effects.push({ tripId, kind: "blocked" });
      }

      await db.collection(AGENT_RUNS_COLLECTION).updateOne(
        { userId: user.id, key },
        { $set: { status: "done", lastAt: now, completedAt: now } },
      );
    }

    return effects;
  },
};
