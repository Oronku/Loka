/**
 * In-flight locks for background agents. Prevents a second auto-enrich
 * pass from starting on a trip that is already being enriched.
 */

export const AGENT_RUNS_COLLECTION = "ai_agent_runs";

const LOCK_USER = "__trip_lock__";
const LOCK_TTL_MS = 10 * 60 * 1000;
const inMemoryLocks = new Set();

function lockKey(tripId) {
  return `auto_enrich:inflight:${tripId}`;
}

/**
 * @returns {Promise<boolean>} true if this caller now owns the lock
 */
export async function acquireAutoEnrichLock(db, tripId, now = new Date()) {
  if (!tripId) return false;
  if (inMemoryLocks.has(tripId)) return false;

  const key = lockKey(tripId);
  const staleBefore = new Date(now.getTime() - LOCK_TTL_MS);

  if (db) {
    const existing = await db.collection(AGENT_RUNS_COLLECTION).findOne({
      userId: LOCK_USER,
      key,
    });
    if (existing?.locked && existing.lastAt && new Date(existing.lastAt) > staleBefore) {
      return false;
    }

    try {
      await db.collection(AGENT_RUNS_COLLECTION).insertOne({
        userId: LOCK_USER,
        key,
        locked: true,
        lastAt: now,
      });
    } catch {
      const stolen = await db.collection(AGENT_RUNS_COLLECTION).updateOne(
        {
          userId: LOCK_USER,
          key,
          $or: [
            { locked: { $ne: true } },
            { lastAt: { $lte: staleBefore } },
            { lastAt: null },
          ],
        },
        { $set: { locked: true, lastAt: now } },
      );
      if ((stolen.modifiedCount ?? 0) === 0) return false;
    }
  }

  inMemoryLocks.add(tripId);
  return true;
}

export async function releaseAutoEnrichLock(db, tripId) {
  inMemoryLocks.delete(tripId);
  if (!db || !tripId) return;
  await db.collection(AGENT_RUNS_COLLECTION).updateOne(
    { userId: LOCK_USER, key: lockKey(tripId) },
    { $set: { locked: false, lastAt: new Date() } },
  );
}

/** Test helper — do not use in production paths. */
export function resetAutoEnrichLocksForTests() {
  inMemoryLocks.clear();
}
