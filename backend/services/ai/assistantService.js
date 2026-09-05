import { ObjectId } from "mongodb";
import { buildIdQuery, isOwner, isParticipant } from "../trip.service.js";
import { runAssistant } from "./runner.js";
import { PROPOSALS_COLLECTION } from "./changeset.js";
import { settleChatProposal } from "./replyGuard.js";
import { getUserProfile, maybeUpdateProfile } from "./memory.js";
import { messageToContextLine, messageToGroupHistoryLine, sanitizeLokaReplyText } from "./messageFormat.js";

export const AI_WELCOME = `Hey! I'm Loka 👋

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
    rationale: cs.rationale || "",
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

/**
 * Persist a Loka reply into a trip group chat and bump unread for all humans.
 */
export async function postGroupChatAssistantMessage(db, { chatId, text, changeSet = null }) {
  const chat = await db.collection("chats").findOne({ _id: new ObjectId(chatId) });
  if (!chat) throw new Error("Chat not found");

  const cleanText = sanitizeLokaReplyText(text) || "";

  const aiMessage = {
    chatId,
    senderId: "loka-bot",
    senderName: "Loka",
    text: cleanText,
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

  const unreadInc = {};
  for (const p of chat.participants) {
    if (p.userId !== "loka-bot") {
      unreadInc[`unreadCount.${p.userId}`] = 1;
    }
  }

  await db.collection("chats").updateOne(
    { _id: new ObjectId(chatId) },
    {
      $set: {
        lastMessage: cleanText.slice(0, 120),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      },
      $inc: unreadInc,
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

function collectTripParticipantNames(trip) {
  if (!trip) return [];
  const names = [];
  if (trip.userName) names.push(trip.userName);
  for (const entry of trip.sharedWith || []) {
    if (entry.name) names.push(entry.name);
  }
  return names;
}

async function loadGroupChatParticipants(db, chatId, activeTripId, trips) {
  const names = new Set();

  if (ObjectId.isValid(chatId)) {
    const chat = await db.collection("chats").findOne({ _id: new ObjectId(chatId) });
    for (const p of chat?.participants || []) {
      if (p.userId !== "loka-bot" && p.name) {
        names.add(p.name);
      }
    }
  }

  if (activeTripId) {
    const trip = trips.find((t) => (t.id || t._id?.toString()) === activeTripId);
    for (const name of collectTripParticipantNames(trip)) {
      names.add(name);
    }
  }

  return [...names];
}

async function loadGroupChatHistory(db, chatId, limit = 20) {
  const msgs = await db
    .collection("messages")
    .find({ chatId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  return msgs
    .reverse()
    .map((m) => {
      const content = messageToGroupHistoryLine(m);
      if (!content) return null;
      return {
        role: m.senderId === "loka-bot" ? "assistant" : "user",
        content,
      };
    })
    .filter(Boolean);
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
 * @param {boolean} [opts.isGroupChat]  trip group chat (multi-user history + broadcast unread)
 * @param {(delta: string) => void} [opts.onToken]
 * @returns {Promise<object>} the saved AI message (with embedded changeSet)
 */
export async function generateAiReply(db, {
  chatId,
  user,
  userMessage,
  activeTripId = null,
  isGroupChat = false,
  onToken,
}) {
  const userId = user.id;
  const historyLoader = isGroupChat ? loadGroupChatHistory : loadHistory;
  const [{ trips }, profile, history] = await Promise.all([
    loadAiContext(db, userId),
    getUserProfile(db, userId),
    historyLoader(db, chatId),
  ]);

  const groupParticipants = isGroupChat
    ? await loadGroupChatParticipants(db, chatId, activeTripId, trips)
    : [];

  if (
    !isGroupChat &&
    (!history.length || history[history.length - 1].content !== userMessage)
  ) {
    history.push({ role: "user", content: userMessage });
  }

  const result = await runAssistant({
    history,
    trips,
    profile,
    activeTripId,
    isGroupChat,
    groupParticipants,
    onToken,
  });

  const { changeSet, text } = await settleChatProposal(db, {
    result,
    chatId,
    userId,
  });

  const saved = isGroupChat
    ? await postGroupChatAssistantMessage(db, { text, changeSet, chatId })
    : await postAssistantMessage(db, {
        userId,
        text,
        changeSet,
        chatId,
      });

  // Fold durable preferences into long-term memory (fire-and-forget, throttled
  // so we don't spend a utility-LLM call on every single turn).
  maybeUpdateProfile(
    db,
    userId,
    [...history, { role: "assistant", content: text }],
    userMessage,
  );

  return saved;
}

/**
 * Create a new per-trip AI assistant conversation thread.
 * Seeds the standard welcome message; title stays "New chat" until the first user turn.
 *
 * @param {object} db
 * @param {string} userId
 * @param {string} tripId
 * @returns {Promise<object>} the new chat doc (with `_id`)
 */
export async function createAiTripConversation(db, userId, tripId) {
  const chat = {
    contextType: "ai_assistant_trip",
    contextId: tripId,
    title: "New chat",
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

  return chat;
}

/**
 * List per-trip AI conversations for a user, newest first.
 *
 * @param {object} db
 * @param {string} userId
 * @param {string} tripId
 * @returns {Promise<object[]>} plain summaries
 */
export async function listAiTripConversations(db, userId, tripId) {
  const chats = await db
    .collection("chats")
    .find({
      contextType: "ai_assistant_trip",
      contextId: tripId,
      "participants.userId": userId,
    })
    .sort({ updatedAt: -1 })
    .toArray();

  return chats.map((c) => ({
    _id: c._id.toString(),
    tripId: c.contextId,
    title: c.title || "New chat",
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
  }));
}

const TITLE_MAX = 60;

function isWelcomeText(text) {
  return String(text).trim() === AI_WELCOME.trim();
}

function truncateTitle(text) {
  const trimmed = String(text).trim();
  if (trimmed.length <= TITLE_MAX) return trimmed;
  return `${trimmed.slice(0, TITLE_MAX).trim()}…`;
}

function titleFromHistory(history, providedTitle) {
  if (providedTitle && String(providedTitle).trim()) {
    return String(providedTitle).trim();
  }
  const firstUser = (history || []).find(
    (item) => item?.role === "user" && String(item.content || "").trim(),
  );
  if (!firstUser) return "New chat";
  return truncateTitle(firstUser.content);
}

function parseHistoryTimestamp(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Persist an ephemeral (no-trip) Loka conversation onto a trip as a new
 * `ai_assistant_trip` thread. Relinks orphan proposals for that user+trip.
 *
 * @param {object} db
 * @param {{ id: string, email?: string, name?: string }} user
 * @param {object} opts
 * @param {string} opts.tripId
 * @param {{ role: "user"|"assistant", content: string, timestamp?: string }[]} [opts.history]
 * @param {string} [opts.title]
 * @returns {Promise<
 *   | { ok: true, chatId: string, title: string, tripId: string, conversation: object }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function attachEphemeralToTrip(db, user, { tripId, history = [], title } = {}) {
  if (!tripId) {
    return { ok: false, status: 400, error: "tripId is required" };
  }

  const trip = await db.collection("trips").findOne(buildIdQuery(tripId));
  if (!trip) {
    return { ok: false, status: 404, error: "Trip not found" };
  }
  if (!isOwner(trip, user.id) && !isParticipant(trip, user.id)) {
    return { ok: false, status: 403, error: "Not a trip member" };
  }

  const items = Array.isArray(history) ? history : [];
  const chat = await createAiTripConversation(db, user.id, tripId);
  const chatId = chat._id.toString();
  const resolvedTitle = titleFromHistory(items, title);

  const welcomeAt =
    chat.lastMessageAt instanceof Date ? chat.lastMessageAt.getTime() : Date.now();
  let nextMs = welcomeAt + 1;
  let sawFirstAssistant = false;
  const toInsert = [];

  for (const item of items) {
    const role = item?.role;
    const content = typeof item?.content === "string" ? item.content : "";
    if (!content.trim()) continue;
    if (role !== "user" && role !== "assistant") continue;

    if (role === "assistant" && !sawFirstAssistant) {
      sawFirstAssistant = true;
      if (isWelcomeText(content)) continue;
    }

    const fallback = new Date(nextMs);
    let timestamp = parseHistoryTimestamp(item.timestamp, fallback);
    if (timestamp.getTime() < nextMs) timestamp = fallback;
    nextMs = timestamp.getTime() + 1;

    if (role === "user") {
      toInsert.push({
        chatId,
        senderId: user.id,
        senderEmail: user.email,
        senderName: user.name,
        text: content,
        timestamp,
        readBy: [{ userId: user.id, readAt: timestamp }],
      });
    } else {
      toInsert.push({
        chatId,
        senderId: "loka-bot",
        senderName: "Loka",
        text: content,
        timestamp,
        readBy: [],
      });
    }
  }

  if (toInsert.length > 0) {
    await db.collection("messages").insertMany(toInsert);
  }

  const lastInserted = toInsert[toInsert.length - 1];
  const lastMessage = lastInserted
    ? String(lastInserted.text || "").slice(0, 120)
    : chat.lastMessage;
  const lastMessageAt = lastInserted ? lastInserted.timestamp : chat.lastMessageAt;
  const updatedAt = lastMessageAt || new Date();

  await db.collection("chats").updateOne(
    { _id: chat._id },
    {
      $set: {
        lastMessage,
        lastMessageAt,
        updatedAt,
        title: resolvedTitle,
      },
    },
  );

  await db.collection(PROPOSALS_COLLECTION).updateMany(
    {
      userId: user.id,
      tripId,
      $or: [{ chatId: null }, { chatId: { $exists: false } }],
    },
    { $set: { chatId } },
  );

  const conversation = {
    _id: chatId,
    tripId,
    title: resolvedTitle,
    createdAt: chat.createdAt,
    updatedAt,
    lastMessage,
    lastMessageAt,
  };

  return { ok: true, chatId, title: resolvedTitle, tripId, conversation };
}

/**
 * Ownership-checked lookup for a user's AI chat (global or per-trip).
 *
 * @param {object} db
 * @param {string} userId
 * @param {string} chatId
 * @returns {Promise<object|null>}
 */
export async function getAiChatForUser(db, userId, chatId) {
  if (!ObjectId.isValid(chatId)) return null;
  return db.collection("chats").findOne({
    _id: new ObjectId(chatId),
    contextType: { $in: ["ai_assistant_trip", "ai_assistant"] },
    "participants.userId": userId,
  });
}

/**
 * Delete a per-trip AI conversation and all of its messages.
 * Never deletes the legacy global `ai_assistant` chat.
 *
 * @param {object} db
 * @param {string} userId
 * @param {string} chatId
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
export async function deleteAiTripConversation(db, userId, chatId) {
  const chat = await getAiChatForUser(db, userId, chatId);
  if (!chat || chat.contextType !== "ai_assistant_trip") return false;

  const chatIdStr = chat._id.toString();
  await Promise.all([
    db.collection("chats").deleteOne({ _id: chat._id }),
    db.collection("messages").deleteMany({ chatId: chatIdStr }),
  ]);
  return true;
}

/**
 * Generate an assistant reply without persisting chat/messages (ephemeral mode).
 * Still creates ChangeSets when the model proposes trip changes.
 *
 * @param {object} db
 * @param {object} opts
 * @param {{ id, email, name }} opts.user
 * @param {string} opts.userMessage
 * @param {{ role: string, content: string }[]} [opts.history]
 * @param {(delta: string) => void} [opts.onToken]
 * @returns {Promise<object>} message-shaped object (not saved to DB)
 */
export async function generateEphemeralAiReply(db, { user, userMessage, history = [], onToken }) {
  const userId = user.id;
  const [{ trips }, profile] = await Promise.all([
    loadAiContext(db, userId),
    getUserProfile(db, userId),
  ]);

  const convo = [...history];
  if (!convo.length || convo[convo.length - 1].content !== userMessage) {
    convo.push({ role: "user", content: userMessage });
  }

  const result = await runAssistant({ history: convo, trips, profile, activeTripId: null, onToken });

  const { changeSet, text } = await settleChatProposal(db, {
    result,
    chatId: null,
    userId,
  });

  maybeUpdateProfile(
    db,
    userId,
    [...convo, { role: "assistant", content: text }],
    userMessage,
  );

  return {
    _id: new ObjectId().toString(),
    chatId: null,
    senderId: "loka-bot",
    senderName: "Loka",
    text,
    changeSet: embedChangeSet(changeSet),
    timestamp: new Date().toISOString(),
    readBy: [],
  };
}

/** Reflect a proposal status change onto the embedded copy in its chat message. */
export async function syncEmbeddedChangeSetStatus(db, changeSetId, status) {
  await db
    .collection("messages")
    .updateOne({ "changeSet._id": changeSetId }, { $set: { "changeSet.status": status } });
}
