import { getOpenAI, UTILITY_MODEL } from "./openaiClient.js";
import { generateAiReply } from "./assistantService.js";
import { messageToContextLine } from "./messageFormat.js";

/** Debounce quiet period before running the relevance classifier (ms). */
export const GROUP_CHAT_DEBOUNCE_MS = 4500;

/** Case-insensitive @Loka mention — word boundary after "loka". */
export const LOKA_MENTION_REGEX = /@loka\b/i;

export const LOKA_BOT_PARTICIPANT = {
  userId: "loka-bot",
  name: "Loka",
  role: "system",
  joinedAt: new Date(),
  avatar: "/videos/idle-animation.apng",
};

const CLASSIFIER_SYSTEM_PROMPT = `You are deciding whether Loka should send ONE short group-chat message.

Say YES when:
- HYPE or CELEBRATION — someone is excited about the trip ("it'll be awesome", "can't wait", "so pumped", "יהיה מטורף", "וואי כיף", "this is gonna be amazing"). Loka should join in with a tiny hype reply — this is important, don't skip it.
- Someone asked a direct question Loka can answer from the trip (flight time, hotel name, dates)
- A real scheduling conflict or mistake someone might miss

Say NO when:
- Friends are debating or deciding among themselves ("should we…", "need to think whether…", "what do you guys think") — not hype, just weighing options
- Loka would mainly offer to search, plan, or help without being asked
- Neutral logistics chat between humans with no excitement and no question for Loka
- Random small talk unrelated to the trip vibe

Hype ≠ debate. "Should we eat breakfast?" = no. "It's gonna be awesome!" = yes.

Reply with exactly one word: yes or no.`;

// Per-chat debounce timers and "last checked" cursors live in memory only —
// they reset on server restart, which is an accepted trade-off at this scale.
const debounceTimers = new Map();
/** @type {Map<string, Date>} chatId → timestamp after which messages are "new" for Loka */
const lastCheckedCursors = new Map();

/** Max human messages considered per classifier / mention batch. */
const MAX_BATCH_MESSAGES = 20;

export function isLokaMentioned(text) {
  return LOKA_MENTION_REGEX.test(text || "");
}

export function getLastCheckedCursor(chatId) {
  return lastCheckedCursors.get(chatId) || new Date(0);
}

export function advanceLastCheckedCursor(chatId, messages) {
  if (!messages.length) return;
  const latest = messages.reduce((max, m) => {
    const ts = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp);
    return ts > max ? ts : max;
  }, new Date(0));
  lastCheckedCursors.set(chatId, latest);
}

export function clearDebounceTimer(chatId) {
  const existing = debounceTimers.get(chatId);
  if (existing) {
    clearTimeout(existing);
    debounceTimers.delete(chatId);
  }
}

/**
 * Ensure trip group chats include loka-bot and allow the system role to post.
 * Returns the up-to-date chat document.
 */
export async function ensureLokaBotParticipant(db, chat) {
  if (chat.contextType !== "trip") return chat;

  const chatIdStr = chat._id.toString();
  const hasLoka = chat.participants.some((p) => p.userId === "loka-bot");
  const canMessage = chat.permissions?.canMessage || [];
  const needsSystemRole = !canMessage.includes("system");

  if (hasLoka && !needsSystemRole) {
    if (!lastCheckedCursors.has(chatIdStr)) {
      lastCheckedCursors.set(chatIdStr, new Date());
    }
    return chat;
  }

  const update = { $set: { updatedAt: new Date() } };
  if (!hasLoka) {
    update.$push = { participants: { ...LOKA_BOT_PARTICIPANT, joinedAt: new Date() } };
    lastCheckedCursors.set(chatIdStr, new Date());
  }
  if (needsSystemRole) {
    update.$set["permissions.canMessage"] = [...new Set([...canMessage, "system"])];
  }

  await db.collection("chats").updateOne({ _id: chat._id }, update);
  if (!lastCheckedCursors.has(chatIdStr)) {
    lastCheckedCursors.set(chatIdStr, new Date());
  }
  return db.collection("chats").findOne({ _id: chat._id });
}

/**
 * Messages from humans since Loka's last check/response (excludes loka-bot).
 */
export async function gatherMessagesSinceCursor(db, chatId) {
  const since = getLastCheckedCursor(chatId);
  const messages = await db
    .collection("messages")
    .find({
      chatId,
      senderId: { $ne: "loka-bot" },
      timestamp: { $gt: since },
    })
    .sort({ timestamp: -1 })
    .limit(MAX_BATCH_MESSAGES)
    .toArray();
  return messages.reverse();
}

/**
 * Cheap yes/no classifier over a small batch of recent group messages.
 */
export async function classifyShouldRespond(messages) {
  const openai = getOpenAI();
  if (!openai || !messages.length) return false;

  const batchText = messages.map(messageToContextLine).filter(Boolean).join("\n");
  if (!batchText) return false;

  try {
    const response = await openai.chat.completions.create({
      model: UTILITY_MODEL,
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: batchText },
      ],
      max_tokens: 1,
      temperature: 0,
    });

    const answer = (response.choices[0]?.message?.content || "").trim().toLowerCase();
    return answer.startsWith("y");
  } catch (err) {
    console.error("[groupChat] classifier failed:", err);
    return false;
  }
}

async function runGroupChatReply(db, { chatId, tripId, user, messages }) {
  const latest = messages[messages.length - 1];
  const latestText = latest?.text || "";

  await generateAiReply(db, {
    chatId,
    user,
    userMessage: latestText,
    activeTripId: tripId,
    isGroupChat: true,
  });

  advanceLastCheckedCursor(chatId, messages);
}

async function onDebounceFire(db, chatId, tripId) {
  debounceTimers.delete(chatId);

  let messages;
  try {
    messages = await gatherMessagesSinceCursor(db, chatId);
  } catch (err) {
    console.error("[groupChat] gather messages failed:", err);
    return;
  }

  if (!messages.length) return;

  const triggering = messages[messages.length - 1];
  const user = {
    id: triggering.senderId,
    email: triggering.senderEmail || "",
    name: triggering.senderName || "User",
  };

  const shouldRespond = await classifyShouldRespond(messages);
  if (!shouldRespond) {
    advanceLastCheckedCursor(chatId, messages);
    return;
  }

  try {
    await runGroupChatReply(db, { chatId, tripId, user, messages });
  } catch (err) {
    console.error("[groupChat] AI reply failed:", err);
  }
}

function scheduleDebounce(db, chatId, tripId) {
  clearDebounceTimer(chatId);
  const timer = setTimeout(() => {
    onDebounceFire(db, chatId, tripId).catch((err) =>
      console.error("[groupChat] debounce handler failed:", err),
    );
  }, GROUP_CHAT_DEBOUNCE_MS);
  debounceTimers.set(chatId, timer);
}

/**
 * After a human message is saved in a trip group chat: @Loka → immediate reply;
 * otherwise (re)schedule the debounced classifier path.
 */
export async function handleTripGroupMessage(db, chat, user, text) {
  if (chat.contextType !== "trip") return;

  const chatId = chat._id.toString();
  const tripId = chat.contextId;

  if (isLokaMentioned(text)) {
    clearDebounceTimer(chatId);
    try {
      const messages = await gatherMessagesSinceCursor(db, chatId);
      const batch = messages.length
        ? messages
        : [
            {
              text,
              senderId: user.id,
              senderName: user.name,
              timestamp: new Date(),
            },
          ];
      await runGroupChatReply(db, { chatId, tripId, user, messages: batch });
    } catch (err) {
      console.error("[groupChat] mention reply failed:", err);
    }
    return;
  }

  scheduleDebounce(db, chatId, tripId);
}

/** Participant list for new trip chats — appends loka-bot if missing. */
export function withLokaBotParticipant(participants) {
  if (participants.some((p) => p.userId === "loka-bot")) return participants;
  return [
    ...participants,
    { ...LOKA_BOT_PARTICIPANT, joinedAt: new Date() },
  ];
}

/** canMessage roles for trip chats including Loka's system role. */
export function tripChatPermissions() {
  return {
    canInvite: ["owner", "member"],
    canRemove: ["owner"],
    canMessage: ["owner", "member", "system"],
  };
}
