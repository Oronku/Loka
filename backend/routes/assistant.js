import express from "express";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import {
  getOrCreateAiChat,
  generateAiReply,
  syncEmbeddedChangeSetStatus,
} from "../services/ai/assistantService.js";
import { applyChangeSet, rejectChangeSet, PROPOSALS_COLLECTION } from "../services/ai/changeset.js";
import { getUserProfile, clearUserProfile, publicProfile } from "../services/ai/memory.js";

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

/**
 * Streaming chat turn. Saves the user message, streams assistant tokens as SSE
 * `token` events, then emits a final `done` event with the saved AI message
 * (including any proposed ChangeSet).
 *
 * Body: { text: string, tripId?: string }
 */
router.post("/stream", async (req, res) => {
  const db = getDb();
  const { text, tripId } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Message text is required" });
  }
  if (!db) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    const chat = await getOrCreateAiChat(db, req.user.id);
    const chatId = chat._id.toString();

    // Persist the user's message first.
    await db.collection("messages").insertOne({
      chatId,
      senderId: req.user.id,
      senderEmail: req.user.email,
      senderName: req.user.name,
      text: text.trim(),
      timestamp: new Date(),
      readBy: [{ userId: req.user.id, readAt: new Date() }],
    });

    sseInit(res);
    sseSend(res, "start", { chatId });

    const message = await generateAiReply(db, {
      chatId,
      user: req.user,
      userMessage: text.trim(),
      activeTripId: tripId || null,
      onToken: (delta) => sseSend(res, "token", { delta }),
    });

    sseSend(res, "done", { message });
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
 * Body: { text: string, tripId?: string }
 */
router.post("/message", async (req, res) => {
  const db = getDb();
  const { text, tripId } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text is required" });
  if (!db) return res.status(503).json({ error: "Database unavailable" });

  try {
    const chat = await getOrCreateAiChat(db, req.user.id);
    const chatId = chat._id.toString();

    await db.collection("messages").insertOne({
      chatId,
      senderId: req.user.id,
      senderEmail: req.user.email,
      senderName: req.user.name,
      text: text.trim(),
      timestamp: new Date(),
      readBy: [{ userId: req.user.id, readAt: new Date() }],
    });

    const message = await generateAiReply(db, {
      chatId,
      user: req.user,
      userMessage: text.trim(),
      activeTripId: tripId || null,
    });

    res.json({ message });
  } catch (error) {
    console.error("[assistant/message] error:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});

/** Apply a proposed ChangeSet: writes to the trip and returns the fresh trip. */
router.post("/proposals/:id/apply", async (req, res) => {
  const db = getDb();
  try {
    const result = await applyChangeSet(db, req.params.id, req.user);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
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

/** List the user's recent proposals (for an inbox / debugging). */
router.get("/proposals", async (req, res) => {
  const db = getDb();
  try {
    const proposals = await db
      .collection(PROPOSALS_COLLECTION)
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json({ proposals: proposals.map((p) => ({ ...p, _id: p._id.toString() })) });
  } catch (error) {
    console.error("[assistant/proposals] error:", error);
    res.status(500).json({ error: "Failed to load proposals" });
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

export default router;
