import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { postAssistantMessage, postGroupChatAssistantMessage } from "./assistantService.js";

const CHAT_ID = "651c1f1f1f1f1f1f1f1f1f1f";
const USER_ID = "user-1";

function memoryCollection(docs) {
  return {
    findOne: async () => docs[0] || null,
    insertOne: async (doc) => {
      docs.push(doc);
      return { insertedId: `id-${docs.length}` };
    },
    updateOne: async () => ({ modifiedCount: 1, matchedCount: 1 }),
    updateMany: async () => ({ modifiedCount: 0, matchedCount: 0 }),
  };
}

function mockDb({ chats = [], messages = [] } = {}) {
  const collections = {
    chats: memoryCollection(chats),
    messages: memoryCollection(messages),
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = memoryCollection([]);
      return collections[name];
    },
    _messages: messages,
  };
}

// The deferredResearch flag crosses runner -> assistantService -> message document;
// without it the client never renders Loka's promised follow-up.
describe("deferredResearch persistence", () => {
  it("persists the flag on a direct assistant message", async () => {
    const db = mockDb({ chats: [{ _id: CHAT_ID }] });

    const saved = await postAssistantMessage(db, {
      userId: USER_ID,
      text: "Let me actually look into this.",
      chatId: CHAT_ID,
      deferredResearch: true,
    });

    assert.equal(saved.deferredResearch, true);
    assert.equal(db._messages[0].deferredResearch, true);
  });

  it("defaults to false when the turn promised nothing", async () => {
    const db = mockDb({ chats: [{ _id: CHAT_ID }] });

    const saved = await postAssistantMessage(db, {
      userId: USER_ID,
      text: "Booked.",
      chatId: CHAT_ID,
    });

    assert.equal(saved.deferredResearch, false);
  });

  it("persists the flag on a group chat message", async () => {
    const db = mockDb({ chats: [{ _id: CHAT_ID, participants: [] }] });

    await postGroupChatAssistantMessage(db, {
      chatId: CHAT_ID,
      text: "Looking into the empty afternoons.",
      deferredResearch: true,
    });

    assert.equal(db._messages[0].deferredResearch, true);
  });
});
