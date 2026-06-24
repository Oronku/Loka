import { randomUUID } from "crypto";
import { getOpenAI, UTILITY_MODEL } from "../openaiClient.js";
import { enrichPlace } from "../places.js";
import {
  createChangeSet,
  newOperation,
  summarizeChangeSet,
} from "../changeset.js";
import { postAssistantMessage } from "../assistantService.js";
import { AGENTS } from "./registry.js";

export const AGENT_RUNS_COLLECTION = "ai_agent_runs";

/** A trip is "active" for agents if it hasn't ended yet (string ISO compare). */
function isActiveTrip(trip, now) {
  if (!trip?.endDate) return true;
  const today = now.toISOString().slice(0, 10);
  return String(trip.endDate).slice(0, 10) >= today;
}

async function loadUserTrips(db, userId) {
  return db
    .collection("trips")
    .find({ $or: [{ userId }, { "sharedWith.userId": userId }] })
    .sort({ startDate: 1 })
    .limit(25)
    .toArray();
}

/**
 * Build the toolbox handed to every agent. Agents never write to trips directly;
 * they emit PROPOSALS (ChangeSets) or plain messages into the user's Loka chat.
 */
function makeTools(db, user, now) {
  return {
    newOperation,
    randomUUID,
    enrichPlace,

    /**
     * Propose a change to an existing trip. Creates a ChangeSet and posts it to
     * the user's Loka chat as a diff card. `text` is the friendly explanation.
     */
    async emitProposal({ tripId, tripName = "", source, operations = [], text = "", summary }) {
      if (!operations.length) return null;
      const changeSet = await createChangeSet(db, {
        tripId: tripId || null,
        tripName,
        createsTrip: false,
        chatId: null,
        userId: user.id,
        source: source || "agent",
        summary: summary || summarizeChangeSet(operations, { tripName }),
        operations,
      });
      await postAssistantMessage(db, { userId: user.id, text, changeSet });
      return changeSet;
    },

    /** Post a plain Loka message (no diff), e.g. a daily briefing. */
    async emitMessage({ text }) {
      if (!text || !text.trim()) return null;
      return postAssistantMessage(db, { userId: user.id, text });
    },

    /** Cheap utility-LLM text generation. Returns "" when AI isn't configured. */
    async summarize(systemPrompt, userPrompt, { maxTokens = 350, temperature = 0.4 } = {}) {
      const openai = getOpenAI();
      if (!openai) return "";
      try {
        const c = await openai.chat.completions.create({
          model: UTILITY_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        });
        return c.choices[0]?.message?.content?.trim() || "";
      } catch (err) {
        console.error("[agents] summarize failed:", err.message);
        return "";
      }
    },

    /** Has this agent already acted on `key` within `withinMs`? (idempotency) */
    async hasRecentRun(key, withinMs = 24 * 60 * 60 * 1000) {
      const doc = await db
        .collection(AGENT_RUNS_COLLECTION)
        .findOne({ userId: user.id, key });
      if (!doc?.lastAt) return false;
      return now.getTime() - new Date(doc.lastAt).getTime() < withinMs;
    },

    /** Record that this agent acted on `key` (for dedup). */
    async recordRun(key, meta = {}) {
      await db.collection(AGENT_RUNS_COLLECTION).updateOne(
        { userId: user.id, key },
        { $set: { userId: user.id, key, lastAt: now, ...meta } },
        { upsert: true },
      );
    },
  };
}

/**
 * Run all (or a subset of) background agents for a single user.
 *
 * @param {object} db
 * @param {{ id: string, email?: string, name?: string }} user
 * @param {object} [opts]
 * @param {object[]} [opts.trips]   pre-loaded trips (else loaded here)
 * @param {object[]} [opts.agents]  agent modules to run (defaults to registry)
 * @param {Date} [opts.now]
 * @returns {Promise<{ agent: string, effects: number, error?: string }[]>}
 */
export async function runAgentsForUser(db, user, { trips, agents = AGENTS, now = new Date() } = {}) {
  if (!db || !user?.id) return [];

  const allTrips = trips || (await loadUserTrips(db, user.id));
  const activeTrips = allTrips.filter((t) => isActiveTrip(t, now));

  const ctx = { db, user, trips: activeTrips, allTrips, now, tools: makeTools(db, user, now) };

  const results = [];
  for (const agent of agents) {
    try {
      const effects = (await agent.run(ctx)) || [];
      results.push({ agent: agent.name, effects: Array.isArray(effects) ? effects.length : 0 });
    } catch (err) {
      console.error(`[agents] ${agent.name} failed for ${user.id}:`, err.message);
      results.push({ agent: agent.name, effects: 0, error: err.message });
    }
  }
  return results;
}

export { loadUserTrips };
