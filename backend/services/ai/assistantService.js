import { ObjectId } from "mongodb";
import { runAssistant } from "./runner.js";
import { createChangeSet, PROPOSALS_COLLECTION } from "./changeset.js";
import { getUserProfile, maybeUpdateProfile } from "./memory.js";

const AI_WELCOME = `Hey! I'm Loka 👋

Tell me where you want to go (or what to change about a trip) and I'll handle the rest — flights, hotels, places to eat, the lot. I'll show you exactly what I'm changing before anything sticks.

What's the plan?`;

/**
 * Get (or lazily create) the user's private AI assistant chat.
 * Shared by the chats route and the streaming assistant route.
 */
export async function getOrCreateAiChat(db, userId) {
  let chat = await db.collection("chats").findOne({
    contextType: "ai_assistant",
    "participants.userId": userId,
  });

  if (!chat) {
    chat = {
      contextType: "ai_assistant",
      contextId: userId,
      participants: [
        { userId, role: "owner", joinedAt: new Date() },
        {
          userId: "loka-bot",
          name: "Loka",
          role: "system",
          joinedAt: new Date(),
          avatar: "/videos/idle-animation.apng",
        },
      ],
      permissions: { canInvite: [], canRemove: [], canMessage: ["owner", "system"] },
      status: "active",
      unreadCount: { [userId]: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      lastMessage: AI_WELCOME,
    };
    const result = await db.collection("chats").insertOne(chat);
    chat._id = result.insertedId;

    await db.collection("messages").insertOne({
      chatId: chat._id.toString(),
      senderId: "loka-bot",
      senderName: "Loka",
      text: AI_WELCOME,
      timestamp: new Date(),
      readBy: [],
    });
  }
  return chat;
}

/** Compact form of a changeset embedded on the AI message for the client. */
function embedChangeSet(cs) {
  if (!cs) return null;
  return {
    _id: cs._id,
    status: cs.status,
    summary: cs.summary,
    tripId: cs.tripId,
    tripName: cs.tripName,
    createsTrip: !!cs.createsTrip,
    source: cs.source,
    operations: cs.operations,
  };
}

/**
 * Persist a Loka message into the user's AI chat, optionally carrying a proposed
 * ChangeSet (rendered as a diff card by the client). Shared by the live chat
 * reply path and the background agents. Returns the saved message.
 *
 * @param {object} db
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.text
 * @param {object|null} [opts.changeSet]  full changeset doc (from createChangeSet)
 * @param {string|null} [opts.chatId]     reuse a known chat id, else resolve it
 * @returns {Promise<object>} the saved message (with string _id)
 */
export async function postAssistantMessage(db, { userId, text, changeSet = null, chatId = null }) {
  if (!chatId) {
    const chat = await getOrCreateAiChat(db, userId);
    chatId = chat._id.toString();
  }

  const aiMessage = {
    chatId,
    senderId: "loka-bot",
    senderName: "Loka",
    text: text || "",
    changeSet: embedChangeSet(changeSet),
    timestamp: new Date(),
    readBy: [],
  };
  const ins = await db.collection("messages").insertOne(aiMessage);
  const messageId = ins.insertedId;

  if (changeSet) {
    await db
      .collection(PROPOSALS_COLLECTION)
      .updateOne({ _id: new ObjectId(changeSet._id) }, { $set: { messageId } });
  }

  await db.collection("chats").updateOne(
    { _id: new ObjectId(chatId) },
    {
      $set: {
        lastMessage: (text || "").slice(0, 120),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      },
      $inc: { [`unreadCount.${userId}`]: 1 },
    },
  );

  return { ...aiMessage, _id: messageId.toString() };
}

async function loadAiContext(db, userId) {
  const trips = await db
    .collection("trips")
    .find({ $or: [{ userId }, { "sharedWith.userId": userId }] })
    .sort({ startDate: -1 })
    .limit(15)
    .toArray();
  return { trips };
}

async function loadHistory(db, chatId, limit = 20) {
  const msgs = await db
    .collection("messages")
    .find({ chatId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  return msgs
    .reverse()
    .map((m) => ({ role: m.senderId === "loka-bot" ? "assistant" : "user", content: m.text }));
}

/**
 * Generate the assistant's reply for a chat turn, persist it (plus any proposed
 * ChangeSet), and return the saved message. Optionally streams tokens.
 *
 * @param {object} db
 * @param {object} opts
 * @param {string} opts.chatId   string chat id
 * @param {{ id, email, name }} opts.user
 * @param {string} opts.userMessage
 * @param {string|null} [opts.activeTripId]
 * @param {(delta: string) => void} [opts.onToken]
 * @returns {Promise<object>} the saved AI message (with embedded changeSet)
 */
export async function generateAiReply(db, { chatId, user, userMessage, activeTripId = null, onToken }) {
  const userId = user.id;
  const [{ trips }, profile, history] = await Promise.all([
    loadAiContext(db, userId),
    getUserProfile(db, userId),
    loadHistory(db, chatId),
  ]);

  if (!history.length || history[history.length - 1].content !== userMessage) {
    history.push({ role: "user", content: userMessage });
  }

  const result = await runAssistant({ history, trips, profile, activeTripId, onToken });

  let changeSet = null;
  if (result.operations.length > 0) {
    changeSet = await createChangeSet(db, {
      tripId: result.createsTrip ? null : result.targetTripId,
      tripName: result.tripName,
      createsTrip: result.createsTrip,
      chatId,
      userId,
      source: "chat",
      operations: result.operations,
    });
  }

  const saved = await postAssistantMessage(db, {
    userId,
    text: result.text,
    changeSet,
    chatId,
  });

  // Fold durable preferences into long-term memory (fire-and-forget, throttled
  // so we don't spend a utility-LLM call on every single turn).
  maybeUpdateProfile(
    db,
    userId,
    [...history, { role: "assistant", content: result.text }],
    userMessage,
  );

  return saved;
}

/** Reflect a proposal status change onto the embedded copy in its chat message. */
export async function syncEmbeddedChangeSetStatus(db, changeSetId, status) {
  await db
    .collection("messages")
    .updateOne({ "changeSet._id": changeSetId }, { $set: { "changeSet.status": status } });
}
