import cron from "node-cron";
import { getDb } from "../../../config/database.js";
import { runAgentsForUser } from "./runner.js";

let started = false;

/** ISO date (YYYY-MM-DD) for "today". */
function todayStr(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Find users who have at least one trip that hasn't ended yet, grouped with a
 * display name/email from one of their trips (avoids a users-collection join).
 */
async function loadActiveUsers(db, now) {
  const today = todayStr(now);
  const trips = await db
    .collection("trips")
    .find({ $or: [{ endDate: { $gte: today } }, { endDate: { $exists: false } }] })
    .project({ userId: 1, userEmail: 1, userName: 1 })
    .toArray();

  const byUser = new Map();
  for (const t of trips) {
    if (!t.userId || byUser.has(t.userId)) continue;
    byUser.set(t.userId, {
      id: t.userId,
      email: t.userEmail || "",
      name: t.userName || "there",
    });
  }
  return [...byUser.values()];
}

async function runAllUsers() {
  const db = getDb();
  if (!db) return;
  const now = new Date();
  const users = await loadActiveUsers(db, now);
  console.log(`[agents] tick — ${users.length} active user(s)`);
  for (const user of users) {
    try {
      await runAgentsForUser(db, user, { now });
    } catch (err) {
      console.error(`[agents] run failed for ${user.id}:`, err.message);
    }
  }
}

/**
 * Start the background-agent scheduler. Disabled by default — set
 * LOKA_AGENTS_ENABLED=true to turn it on. Cron expression is configurable via
 * LOKA_AGENTS_CRON (defaults to hourly). The manual /api/assistant/agents/run
 * endpoint works regardless of this flag.
 */
export function startAgentScheduler() {
  if (started) return;

  if (process.env.LOKA_AGENTS_ENABLED !== "true") {
    console.log("⏸️  Loka background agents disabled (set LOKA_AGENTS_ENABLED=true to enable)");
    return;
  }

  const expr = process.env.LOKA_AGENTS_CRON || "0 * * * *"; // top of every hour
  if (!cron.validate(expr)) {
    console.error(`[agents] invalid LOKA_AGENTS_CRON "${expr}" — scheduler not started`);
    return;
  }

  started = true;
  cron.schedule(expr, () => {
    runAllUsers().catch((err) => console.error("[agents] tick failed:", err.message));
  });
  console.log(`✓ Loka background agents scheduled (${expr})`);
}

export { runAllUsers };
