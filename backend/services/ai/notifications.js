import { ObjectId } from "mongodb";

export const NOTIFICATIONS_COLLECTION = "ai_notifications";

/**
 * A lightweight Loka notification/feed item — used for agent output that isn't a
 * trip diff (e.g. a daily briefing or a heads-up). Surfaced in-app (home feed),
 * never in the chat.
 *
 * @param {object} db
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} [opts.type]    "briefing" | "heads_up" | "info"
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string|null} [opts.tripId]
 * @param {string} [opts.source]  e.g. "agent:daily_briefing"
 * @param {object|null} [opts.data]
 * @param {{ entity: 'flight'|'hotel'|'ride'|'attraction'|'trip', itemId: string|null }|null} [opts.target]
 * @returns {Promise<object>} the saved notification (string _id)
 */
export async function createNotification(db, {
  userId,
  type = "info",
  title = "",
  body = "",
  tripId = null,
  source = "agent",
  data = null,
  target = null,
}) {
  if (!db || !userId) return null;
  const doc = {
    userId,
    type,
    title,
    body,
    tripId,
    source,
    data,
    target: target || null,
    read: false,
    createdAt: new Date(),
  };
  const result = await db.collection(NOTIFICATIONS_COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId.toString() };
}

export async function listNotifications(db, userId, { unreadOnly = false, limit = 50 } = {}) {
  if (!db || !userId) return [];
  const query = { userId };
  if (unreadOnly) query.read = false;
  const docs = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({ ...d, _id: d._id.toString() }));
}

export async function markNotificationRead(db, id, userId) {
  if (!db || !ObjectId.isValid(id)) return false;
  const res = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .updateOne({ _id: new ObjectId(id), userId }, { $set: { read: true, readAt: new Date() } });
  return res.matchedCount > 0;
}

/** Recently-created notification of a type for a trip (dedup helper for agents). */
export async function hasRecentNotification(db, userId, { tripId, type, withinMs }) {
  if (!db || !userId) return false;
  const since = new Date(Date.now() - withinMs);
  const doc = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .findOne({ userId, tripId, type, createdAt: { $gte: since } });
  return !!doc;
}
