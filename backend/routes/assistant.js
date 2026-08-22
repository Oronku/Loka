import express from "express";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import {
  attachEphemeralToTrip,
  createAiTripConversation,
  listAiTripConversations,
  getAiChatForUser,
  deleteAiTripConversation,
  generateAiReply,
  generateEphemeralAiReply,
  syncEmbeddedChangeSetStatus,
} from "../services/ai/assistantService.js";
import { applyChangeSet, rejectChangeSet, PROPOSALS_COLLECTION } from "../services/ai/changeset.js";
import { getUserProfile, clearUserProfile, publicProfile } from "../services/ai/memory.js";
import { runAgentsForUser } from "../services/ai/agents/runner.js";
import { listNotifications, markNotificationRead } from "../services/ai/notifications.js";

const router = express.Router();
router.use(verifyGoogleToken);

function sseInit(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function titleFromUserMessage(text) {
  const trimmed = text.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 48).trim()}…`;
}

async function insertUserMessage(db, chatId, user, text) {
  await db.collection("messages").insertOne({
    chatId,
    senderId: user.id,
    senderEmail: user.email,
    senderName: user.name,
    text: text.trim(),
    timestamp: new Date(),
    readBy: [{ userId: user.id, readAt: new Date() }],
  });
}

function maybeRenameNewChat(db, chat, userMessage) {
  if (chat.title !== "New chat") return;
  const title = titleFromUserMessage(userMessage);
  db.collection("chats")
    .updateOne({ _id: chat._id }, { $set: { title } })
    .catch((err) => console.error("[assistant] title update error:", err));
}

/**
 * Resolve chatId for a persisted turn: existing thread, new per-trip thread, or ephemeral.
 * @returns {{ chatId: string|null, chat: object|null, isNewTripChat: boolean }}
 */
async function resolvePersistedChat(db, userId, { chatIdIn, tripId }) {
  if (chatIdIn) {
    const chat = await getAiChatForUser(db, userId, chatIdIn);
    if (!chat) return { notFound: true };
    return { chatId: chat._id.toString(), chat, isNewTripChat: false };
  }
  if (tripId) {
    const chat = await createAiTripConversation(db, userId, tripId);
    return { chatId: chat._id.toString(), chat, isNewTripChat: true };
  }
  return { chatId: null, chat: null, isNewTripChat: false };
}

/**
 * Streaming chat turn. Saves the user message, streams assistant tokens as SSE
 * `token` events, then emits a final `done` event with the saved AI message
 * (including any proposed ChangeSet).
 *
 * Body: { text: string, tripId?: string, chatId?: string, history?: object[] }
 */
router.post("/stream", async (req, res) => {
  const db = getDb();
  const { text, tripId, chatId: chatIdIn, history } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Message text is required" });
  }
  if (!db) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    const trimmed = text.trim();

    if (!chatIdIn && !tripId) {
      sseInit(res);
      sseSend(res, "start", { chatId: null });

      const message = await generateEphemeralAiReply(db, {
        user: req.user,
        userMessage: trimmed,
        history: Array.isArray(history) ? history : [],
        onToken: (delta) => sseSend(res, "token", { delta }),
      });

      sseSend(res, "done", { message, chatId: null });
      res.end();
      return;
    }

    const resolved = await resolvePersistedChat(db, req.user.id, { chatIdIn, tripId });
    if (resolved.notFound) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const { chatId, chat, isNewTripChat } = resolved;

    await insertUserMessage(db, chatId, req.user, trimmed);
    if (isNewTripChat) {
      maybeRenameNewChat(db, chat, trimmed);
    }

    sseInit(res);
    sseSend(res, "start", { chatId });

    const message = await generateAiReply(db, {
      chatId,
      user: req.user,
      userMessage: trimmed,
      activeTripId: tripId || null,
      onToken: (delta) => sseSend(res, "token", { delta }),
    });

    sseSend(res, "done", { message, chatId });
    res.end();
  } catch (error) {
    console.error("[assistant/stream] error:", error);
    if (res.headersSent) {
      sseSend(res, "error", { message: "Something went wrong while thinking." });
      res.end();
    } else {
      res.status(500).json({ error: "Failed to process message" });
    }
  }
});

/**
 * Non-streaming fallback (same behavior, single JSON response). Useful for
 * clients that can't consume SSE.
 * Body: { text: string, tripId?: string, chatId?: string, history?: object[] }
 */
router.post("/message", async (req, res) => {
  const db = getDb();
  const { text, tripId, chatId: chatIdIn, history } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text is required" });
  if (!db) return res.status(503).json({ error: "Database unavailable" });

  try {
    const trimmed = text.trim();

    if (!chatIdIn && !tripId) {
      const message = await generateEphemeralAiReply(db, {
        user: req.user,
        userMessage: trimmed,
        history: Array.isArray(history) ? history : [],
      });
      return res.json({ message, chatId: null });
    }

    const resolved = await resolvePersistedChat(db, req.user.id, { chatIdIn, tripId });
    if (resolved.notFound) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const { chatId, chat, isNewTripChat } = resolved;

    await insertUserMessage(db, chatId, req.user, trimmed);
    if (isNewTripChat) {
      maybeRenameNewChat(db, chat, trimmed);
    }

    const message = await generateAiReply(db, {
      chatId,
      user: req.user,
      userMessage: trimmed,
      activeTripId: tripId || null,
    });

    res.json({ message, chatId });
  } catch (error) {
    console.error("[assistant/message] error:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});

/** List per-trip AI conversation threads for a trip. Query: ?tripId= */
router.get("/conversations", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  const { tripId } = req.query;
  if (!tripId) return res.status(400).json({ error: "tripId is required" });
  try {
    const conversations = await listAiTripConversations(db, req.user.id, tripId);
    res.json({ conversations });
  } catch (error) {
    console.error("[assistant/conversations] error:", error);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

/**
 * Promote an ephemeral (no-trip) conversation onto a trip as a persisted thread.
 * Body: { tripId: string, history?: Array<{ role, content, timestamp? }>, title?: string }
 */
router.post("/conversations/attach", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  const { tripId, history, title } = req.body || {};
  if (!tripId) return res.status(400).json({ error: "tripId is required" });

  try {
    const result = await attachEphemeralToTrip(db, req.user, {
      tripId,
      history: Array.isArray(history) ? history : [],
      title,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.status(201).json({
      chatId: result.chatId,
      title: result.title,
      tripId: result.tripId,
      conversation: result.conversation,
    });
  } catch (error) {
    console.error("[assistant/conversations/attach] error:", error);
    res.status(500).json({ error: "Failed to attach conversation" });
  }
});

/** Delete a per-trip AI conversation thread. */
router.delete("/conversations/:chatId", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  try {
    const ok = await deleteAiTripConversation(db, req.user.id, req.params.chatId);
    if (!ok) return res.status(404).json({ error: "Conversation not found" });
    res.json({ ok: true });
  } catch (error) {
    console.error("[assistant/conversations/delete] error:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

/** Apply a proposed ChangeSet: writes to the trip and returns the fresh trip. */
router.post("/proposals/:id/apply", async (req, res) => {
  const db = getDb();
  try {
    const result = await applyChangeSet(db, req.params.id, req.user);
    if (!result.ok) {
      const body = { error: result.error };
      if (result.code) body.code = result.code;
      if (result.failedOps) body.failedOps = result.failedOps;
      return res.status(result.status || 400).json(body);
    }
    await syncEmbeddedChangeSetStatus(db, req.params.id, "applied");
    res.json({ trip: result.trip, changeSet: result.changeSet });
  } catch (error) {
    console.error("[assistant/apply] error:", error);
    res.status(500).json({ error: "Failed to apply changes" });
  }
});

/** Reject a proposed ChangeSet. */
router.post("/proposals/:id/reject", async (req, res) => {
  const db = getDb();
  try {
    const result = await rejectChangeSet(db, req.params.id, req.user.id);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    await syncEmbeddedChangeSetStatus(db, req.params.id, "rejected");
    res.json({ changeSet: result.changeSet });
  } catch (error) {
    console.error("[assistant/reject] error:", error);
    res.status(500).json({ error: "Failed to reject changes" });
  }
});

/**
 * List the user's proposals. Optional filters:
 *   ?tripId=<id>      only proposals for that trip
 *   ?status=pending   only proposals with that status (default: pending)
 * Use ?status=all to include applied/rejected.
 */
router.get("/proposals", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  try {
    const { tripId, status = "pending" } = req.query;
    const query = { userId: req.user.id };
    if (tripId) query.tripId = tripId;
    if (status && status !== "all") query.status = status;

    const proposals = await db
      .collection(PROPOSALS_COLLECTION)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json({ proposals: proposals.map((p) => ({ ...p, _id: p._id.toString() })) });
  } catch (error) {
    console.error("[assistant/proposals] error:", error);
    res.status(500).json({ error: "Failed to load proposals" });
  }
});

/** Loka notifications/feed (agent briefings + heads-ups). */
router.get("/notifications", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const notifications = await listNotifications(db, req.user.id, { unreadOnly });
    res.json({ notifications });
  } catch (error) {
    console.error("[assistant/notifications] error:", error);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

/** Mark a notification as read. */
router.post("/notifications/:id/read", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  try {
    const ok = await markNotificationRead(db, req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ error: "Notification not found" });
    res.json({ ok: true });
  } catch (error) {
    console.error("[assistant/notifications/read] error:", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

/**
 * What Loka remembers about the user (durable travel preferences). Returns a
 * client-safe view with internal bookkeeping stripped out.
 */
router.get("/profile", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  try {
    const profile = await getUserProfile(db, req.user.id);
    res.json({ profile: publicProfile(profile) });
  } catch (error) {
    console.error("[assistant/profile] error:", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/** Forget everything Loka has learned about the user. */
router.delete("/profile", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  try {
    await clearUserProfile(db, req.user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("[assistant/profile delete] error:", error);
    res.status(500).json({ error: "Failed to clear profile" });
  }
});

/**
 * Run the background agents for the current user right now (on-demand). Handy
 * for testing without waiting for the scheduler. Any proposals/briefings land
 * in the user's Loka chat.
 */
router.post("/agents/run", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  try {
    const results = await runAgentsForUser(db, req.user);
    res.json({ ok: true, results });
  } catch (error) {
    console.error("[assistant/agents/run] error:", error);
    res.status(500).json({ error: "Failed to run agents" });
  }
});

export default router;
