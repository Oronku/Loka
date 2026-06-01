import express from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import OpenAI from "openai";
import googleApi from "../services/googleApi.js";
import * as tripService from "../services/trip.service.js";

const router = express.Router();

// Simple cache for Google Places results (1 hour TTL)
const placesCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCachedPlace(query) {
  const cached = placesCache.get(query.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function cachePlace(query, data) {
  placesCache.set(query.toLowerCase(), {
    data,
    timestamp: Date.now(),
  });

  // Clear old cache entries (keep max 100)
  if (placesCache.size > 100) {
    const firstKey = placesCache.keys().next().value;
    placesCache.delete(firstKey);
  }
}

// Initialize OpenAI
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Apply auth middleware to all routes
router.use(verifyGoogleToken);

// Helper to get or create AI chat
async function getOrCreateAiChat(db, userId) {
  let chat = await db.collection("chats").findOne({
    contextType: "ai_assistant",
    "participants.userId": userId,
  });

  if (!chat) {
    chat = {
      contextType: "ai_assistant",
      contextId: userId,
      participants: [
        {
          userId: userId,
          role: "owner",
          joinedAt: new Date(),
        },
        {
          userId: "loka-bot",
          name: "Loka",
          role: "system",
          joinedAt: new Date(),
          avatar: "/videos/idle-animation.apng",
        },
      ],
      permissions: {
        canInvite: [],
        canRemove: [],
        canMessage: ["owner", "system"],
      },
      status: "active",
      unreadCount: { [userId]: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      lastMessage: "👋 שלום! אני לוקה, הסוכן הוירטואלי שלך ✈️",
    };
    const result = await db.collection("chats").insertOne(chat);
    chat._id = result.insertedId;

    // Insert welcome message
    const welcomeMessage = `👋 **שלום! אני לוקה, הסוכן הוירטואלי שלך**

אני כאן כדי לעזור לך לתכנן את הטיול המושלם! 🌍✈️

**אני יכול לעזור לך:**
• 🗺️ לבנות מסלול מפורט ליעדים
• 🍽️ למצוא מסעדות ואטרקציות מומלצות
• 🏨 להוסיף מלונות וטיסות
• 🚗 לתכנן נסיעות בין מקומות
• ☀️ לבדוק מזג אויר ולהמליץ מה להביא

**איך מתחילים?**
פשוט ספר לי לאן אתה רוצה לנסוע ומתי, ואני אדאג לכל השאר! 😊

לדוגמה: "תבנה לי טיול לרומא 5 ימים בפברואר"`;

    await db.collection("messages").insertOne({
      chatId: chat._id,
      senderId: "loka-bot",
      senderName: "Loka",
      text: welcomeMessage,
      timestamp: new Date(),
      readBy: [],
    });
  }
  return chat;
}

/**
 * Unified Chat Schema (MEETLOKA + QUICKET):
 * {
 *   _id: ObjectId,
 *   contextType: 'quicket_item' | 'trip' | 'direct', // direct = friend chat
 *   contextId: string, // ID of the item/trip, or combined user IDs for direct
 *   participants: [
 *     {
 *       userId: string,
 *       email: string,
 *       name: string,
 *       role: 'owner' | 'member' | 'buyer' | 'seller' | 'friend',
 *       joinedAt: Date
 *     }
 *   ],
 *   permissions: {
 *     canInvite: ['owner', 'member'], // Who can add new participants
 *     canRemove: ['owner'], // Who can remove participants
 *     canMessage: ['owner', 'member', 'buyer', 'seller', 'friend'] // Who can send messages
 *   },
 *   status: 'pending' | 'active' | 'archived',
 *   unreadCount: { userId: number }, // Per-user unread count
 *   metadata: {
 *     // Context-specific data
 *     itemId: string, // For quicket_item
 *     itemTitle: string,
 *     itemType: string,
 *     itemImage: string,
 *     itemDate: Date,
 *     itemPrice: { original: number, selling: number },
 *     tripId: string, // For trip
 *     tripName: string,
 *     tripDates: string,
 *     tripImage: string,
 *   },
 *   createdAt: Date,
 *   updatedAt: Date,
 *   lastMessageAt: Date,
 *   lastMessage: string // Preview of last message
 * }
 */

/**
 * Message Schema:
 * {
 *   _id: ObjectId,
 *   chatId: string,
 *   senderId: string,
 *   senderEmail: string,
 *   senderName: string,
 *   text: string,
 *   attachments: [
 *     {
 *       type: 'image' | 'pdf' | 'link' | 'file',
 *       url: string,
 *       name: string,
 *       size: number
 *     }
 *   ],
 *   timestamp: Date,
 *   readBy: [{ userId: string, readAt: Date }]
 * }
 */

// Helper function to check if user has permission
function hasPermission(chat, userId, action) {
  const participant = chat.participants.find((p) => p.userId === userId);
  if (!participant) return false;

  const allowedRoles = chat.permissions[action] || [];
  return allowedRoles.includes(participant.role);
}

// Helper function to get user's role in chat
function getUserRole(chat, userId) {
  const participant = chat.participants.find((p) => p.userId === userId);
  return participant ? participant.role : null;
}

// Create a new chat
router.post("/", async (req, res) => {
  try {
    const db = getDb();
    const { contextType, contextId, participants, metadata } = req.body;

    // Validate context type
    const validContextTypes = ["quicket_item", "trip", "direct"];
    if (!validContextTypes.includes(contextType)) {
      return res.status(400).json({ error: "Invalid context type" });
    }

    // Validate participants
    if (
      !participants ||
      !Array.isArray(participants) ||
      participants.length === 0
    ) {
      return res.status(400).json({ error: "Participants are required" });
    }

    // Check if user creating the chat is included
    const userInParticipants = participants.some(
      (p) => p.userId === req.user.id,
    );
    if (!userInParticipants) {
      return res
        .status(400)
        .json({ error: "Chat creator must be a participant" });
    }

    // Context-specific validation
    if (contextType === "quicket_item") {
      if (!contextId || !ObjectId.isValid(contextId)) {
        return res.status(400).json({ error: "Valid item ID required" });
      }

      // Verify item exists
      const item = await db
        .collection("quicket_items")
        .findOne({ _id: new ObjectId(contextId), isDeleted: { $ne: true } });

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Check if chat already exists for this item and buyer
      const buyerParticipant = participants.find((p) => p.role === "buyer");
      if (buyerParticipant) {
        const existingChat = await db.collection("chats").findOne({
          contextType: "quicket_item",
          contextId,
          "participants.userId": buyerParticipant.userId,
          "participants.role": "buyer",
        });

        if (existingChat) {
          return res.json({
            message: "Chat already exists",
            chatId: existingChat._id,
            chat: existingChat,
          });
        }
      }
    } else if (contextType === "trip") {
      if (!contextId) {
        return res.status(400).json({ error: "Valid trip ID required" });
      }

      // Verify trip exists and user is a member
      const trip = await tripService.findById(contextId);

      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      tripService.normalizeDocument(trip);

      // Verify all participants are trip members
      const tripMemberIds = tripService.getMemberIds(trip);
      const invalidParticipants = participants.filter(
        (p) => !tripMemberIds.includes(p.userId),
      );

      if (invalidParticipants.length > 0) {
        return res
          .status(403)
          .json({ error: "All participants must be trip members" });
      }
    }

    // Handle direct (friend) chat
    if (contextType === "direct") {
      if (participants.length !== 2) {
        return res
          .status(400)
          .json({ error: "Direct chats must have exactly 2 participants" });
      }

      // Check if direct chat already exists between these users
      const userIds = participants.map((p) => p.userId).sort();
      const existingChat = await db.collection("chats").findOne({
        contextType: "direct",
        "participants.userId": { $all: userIds },
        participants: { $size: 2 },
      });

      if (existingChat) {
        return res.json({
          message: "Chat already exists",
          chatId: existingChat._id,
          chat: existingChat,
        });
      }
    }

    // Set default permissions based on context type
    let permissions = {};
    if (contextType === "quicket_item") {
      permissions = {
        canInvite: [],
        canRemove: [],
        canMessage: ["buyer", "seller"],
      };
    } else if (contextType === "trip") {
      permissions = {
        canInvite: ["owner", "member"],
        canRemove: ["owner"],
        canMessage: ["owner", "member"],
      };
    } else if (contextType === "direct") {
      permissions = {
        canInvite: [],
        canRemove: [],
        canMessage: ["friend"],
      };
    }

    // Initialize unread counts for all participants
    const unreadCount = {};
    participants.forEach((p) => {
      unreadCount[p.userId] = 0;
    });

    // Create new chat
    const newChat = {
      contextType,
      contextId,
      participants: participants.map((p) => ({
        ...p,
        joinedAt: new Date(),
      })),
      permissions,
      status: contextType === "quicket_item" ? "pending" : "active",
      metadata: metadata || {},
      unreadCount,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
      lastMessage: null,
    };

    const result = await db.collection("chats").insertOne(newChat);

    res.status(201).json({
      message: "Chat created successfully",
      chatId: result.insertedId,
      chat: { ...newChat, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error creating chat:", error);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

// Get all chats for current user
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const { contextType, status } = req.query;

    const query = {
      "participants.userId": req.user.id,
    };

    if (contextType) {
      query.contextType = contextType;
    }

    if (status) {
      query.status = status;
    }

    const chats = await db
      .collection("chats")
      .find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .toArray();

    res.json({ chats });
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// Get single chat by ID
router.get("/:chatId", async (req, res) => {
  try {
    const db = getDb();
    const { chatId } = req.params;

    // Handle AI Chat special case
    if (chatId === "loka-ai-chat") {
      const chat = await getOrCreateAiChat(db, req.user.id);
      return res.json({ chat });
    }

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Verify user is a participant
    const isParticipant = chat.participants.some(
      (p) => p.userId === req.user.id,
    );

    if (!isParticipant) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this chat" });
    }

    res.json({ chat });
  } catch (error) {
    console.error("Error fetching chat:", error);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

// Get messages for a chat
router.get("/:chatId/messages", async (req, res) => {
  try {
    const db = getDb();
    let { chatId } = req.params;
    const { limit = 50, before } = req.query;

    // Handle AI Chat special case
    if (chatId === "loka-ai-chat") {
      const chat = await getOrCreateAiChat(db, req.user.id);
      chatId = chat._id.toString();
    }

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Verify user is a participant
    const isParticipant = chat.participants.some(
      (p) => p.userId === req.user.id,
    );

    if (!isParticipant) {
      return res.status(403).json({ error: "Not authorized to view messages" });
    }

    const query = { chatId: chatId };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    const messages = await db
      .collection("messages")
      .find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    // Reverse to get chronological order
    messages.reverse();

    res.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Send a message
router.post("/:chatId/messages", async (req, res) => {
  try {
    const db = getDb();
    let { chatId } = req.params;
    const { text, attachments } = req.body;
    let isAiChat = false;

    // Handle AI Chat special case
    if (chatId === "loka-ai-chat") {
      const chat = await getOrCreateAiChat(db, req.user.id);
      chatId = chat._id.toString();
      isAiChat = true;
    }

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Message text is required" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Check if chat is locked (item sold)
    if (chat.locked) {
      return res.status(403).json({
        error: "This chat is locked. The item has been marked as sold.",
      });
    }

    // Check if user has permission to send messages
    if (!hasPermission(chat, req.user.id, "canMessage")) {
      return res
        .status(403)
        .json({ error: "Not authorized to send messages in this chat" });
    }

    const newMessage = {
      chatId: chatId,
      senderId: req.user.id,
      senderEmail: req.user.email,
      senderName: req.user.name,
      text,
      attachments: attachments || [],
      timestamp: new Date(),
      readBy: [{ userId: req.user.id, readAt: new Date() }],
    };

    const result = await db.collection("messages").insertOne(newMessage);

    // Update unread counts for all participants except sender
    const unreadUpdates = {};
    chat.participants.forEach((p) => {
      if (p.userId !== req.user.id) {
        unreadUpdates[`unreadCount.${p.userId}`] =
          (chat.unreadCount?.[p.userId] || 0) + 1;
      }
    });

    // Update chat timestamps, last message, and unread counts
    await db.collection("chats").updateOne(
      { _id: new ObjectId(chatId) },
      {
        $set: {
          updatedAt: new Date(),
          lastMessageAt: new Date(),
          lastMessage: text.substring(0, 100), // Preview of message
          ...unreadUpdates,
        },
      },
    );

    // If AI chat, trigger AI response
    if (isAiChat) {
      // Run in background, don't await
      processAiResponse(db, chatId, req.user.id, text);
    }

    res.status(201).json({
      message: "Message sent successfully",
      messageId: result.insertedId,
      data: { ...newMessage, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Mark messages as read
router.put("/:chatId/read", async (req, res) => {
  try {
    const db = getDb();
    let { chatId } = req.params;
    const { messageIds } = req.body;

    // Handle AI Chat special case
    if (chatId === "loka-ai-chat") {
      const chat = await getOrCreateAiChat(db, req.user.id);
      chatId = chat._id.toString();
    }

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Verify user is a participant
    const isParticipant = chat.participants.some(
      (p) => p.userId === req.user.id,
    );

    if (!isParticipant) {
      return res
        .status(403)
        .json({ error: "Not authorized to mark messages as read" });
    }

    // If specific messages provided, mark only those
    // Otherwise mark all messages in chat as read
    const query = { chatId: chatId };
    if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
      query._id = { $in: messageIds.map((id) => new ObjectId(id)) };
    }

    const result = await db.collection("messages").updateMany(query, {
      $addToSet: {
        readBy: { userId: req.user.id, readAt: new Date() },
      },
    });

    // Reset unread count for this user
    await db.collection("chats").updateOne(
      { _id: new ObjectId(chatId) },
      {
        $set: {
          [`unreadCount.${req.user.id}`]: 0,
        },
      },
    );

    res.json({
      message: "Messages marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
});

// Update chat status (for quicket items: pending -> accepted/declined)
router.put("/:chatId/status", async (req, res) => {
  try {
    const db = getDb();
    const { chatId } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const validStatuses = ["pending", "active", "archived"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // For quicket_item chats, only seller can accept/decline
    if (chat.contextType === "quicket_item") {
      const userRole = getUserRole(chat, req.user.id);
      if (userRole !== "seller") {
        return res
          .status(403)
          .json({ error: "Only seller can update chat status" });
      }
    } else {
      // For other chat types, check if user is owner
      const userRole = getUserRole(chat, req.user.id);
      if (userRole !== "owner") {
        return res
          .status(403)
          .json({ error: "Only chat owner can update status" });
      }
    }

    const result = await db.collection("chats").updateOne(
      { _id: new ObjectId(chatId) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );

    res.json({
      message: "Chat status updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating chat status:", error);
    res.status(500).json({ error: "Failed to update chat status" });
  }
});

// Add participant to chat
router.post("/:chatId/participants", async (req, res) => {
  try {
    const db = getDb();
    const { chatId } = req.params;
    const { userId, email, name, role = "member" } = req.body;

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    if (!userId || !email) {
      return res.status(400).json({ error: "User ID and email are required" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Check if user has permission to invite
    if (!hasPermission(chat, req.user.id, "canInvite")) {
      return res
        .status(403)
        .json({ error: "Not authorized to add participants" });
    }

    // Check if user is already a participant
    const existingParticipant = chat.participants.find(
      (p) => p.userId === userId,
    );
    if (existingParticipant) {
      return res.status(400).json({ error: "User is already a participant" });
    }

    // Context-specific validation
    if (chat.contextType === "trip") {
      // Verify user is a trip member
      const trip = await tripService.findById(chat.contextId);

      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      tripService.normalizeDocument(trip);

      const tripMemberIds = tripService.getMemberIds(trip);
      if (!tripMemberIds.includes(userId)) {
        return res.status(403).json({ error: "User must be a trip member" });
      }
    }

    const newParticipant = {
      userId,
      email,
      name: name || email.split("@")[0],
      role,
      joinedAt: new Date(),
    };

    const result = await db.collection("chats").updateOne(
      { _id: new ObjectId(chatId) },
      {
        $push: { participants: newParticipant },
        $set: { updatedAt: new Date() },
      },
    );

    res.json({
      message: "Participant added successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error adding participant:", error);
    res.status(500).json({ error: "Failed to add participant" });
  }
});

// Remove participant from chat
router.delete("/:chatId/participants/:userId", async (req, res) => {
  try {
    const db = getDb();
    const { chatId, userId } = req.params;

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // User can remove themselves, or if they have permission to remove others
    const isSelf = userId === req.user.id;
    const hasRemovePermission = hasPermission(chat, req.user.id, "canRemove");

    if (!isSelf && !hasRemovePermission) {
      return res
        .status(403)
        .json({ error: "Not authorized to remove participants" });
    }

    const result = await db.collection("chats").updateOne(
      { _id: new ObjectId(chatId) },
      {
        $pull: { participants: { userId: userId } },
        $set: { updatedAt: new Date() },
      },
    );

    res.json({
      message: "Participant removed successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error removing participant:", error);
    res.status(500).json({ error: "Failed to remove participant" });
  }
});

// Mark Quicket item as sold (seller only)
router.post("/:chatId/mark-sold", async (req, res) => {
  try {
    const db = getDb();
    const { chatId } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Only works for quicket_item context
    if (chat.contextType !== "quicket_item") {
      return res
        .status(400)
        .json({ error: "Only Quicket item chats can be marked as sold" });
    }

    // Check if user is the seller
    const userRole = getUserRole(chat, userId);
    if (userRole !== "seller") {
      return res
        .status(403)
        .json({ error: "Only the seller can mark item as sold" });
    }

    // Check if already sold
    if (chat.locked) {
      return res.status(400).json({ error: "Item already marked as sold" });
    }

    // Update chat to locked status
    await db.collection("chats").updateOne(
      { _id: new ObjectId(chatId) },
      {
        $set: {
          locked: true,
          lockedAt: new Date(),
          lockedBy: userId,
          updatedAt: new Date(),
        },
      },
    );

    // Send system message to buyer
    const buyer = chat.participants.find((p) => p.role === "buyer");
    if (buyer) {
      const systemMessage = {
        chatId: chatId,
        senderId: "system",
        senderName: "System",
        senderEmail: "",
        text: "🔒 This item has been marked as sold by the seller. This chat is now read-only.",
        isSystemMessage: true,
        timestamp: new Date(),
        readBy: [],
      };

      await db.collection("messages").insertOne(systemMessage);

      // Update chat's last message
      await db.collection("chats").updateOne(
        { _id: new ObjectId(chatId) },
        {
          $set: {
            lastMessage: systemMessage.text,
            lastMessageAt: new Date(),
          },
        },
      );
    }

    // Mark the item as sold in quicket_items collection
    if (chat.contextId && ObjectId.isValid(chat.contextId)) {
      await db.collection("quicket_items").updateOne(
        { _id: new ObjectId(chat.contextId) },
        {
          $set: {
            status: "sold",
            soldAt: new Date(),
            soldTo: buyer ? buyer.userId : null,
            updatedAt: new Date(),
          },
        },
      );
    }

    res.json({
      message: "Item marked as sold successfully",
      chat: await db.collection("chats").findOne({ _id: new ObjectId(chatId) }),
    });
  } catch (error) {
    console.error("Error marking item as sold:", error);
    res.status(500).json({ error: "Failed to mark item as sold" });
  }
});

// Find existing chat (to prevent duplicates)
router.post("/find-existing", async (req, res) => {
  try {
    const db = getDb();
    const { contextType, contextId, participantIds } = req.body;

    let query = {};

    if (contextType === "quicket_item" && contextId) {
      // For Quicket items, check by contextId and buyer
      const buyerId = participantIds.find((id) => id !== req.user.id);
      query = {
        contextType: "quicket_item",
        contextId,
        "participants.userId": { $all: [req.user.id, buyerId] },
      };
    } else if (
      contextType === "direct" &&
      participantIds &&
      participantIds.length === 2
    ) {
      // For direct chats, check by both participant IDs
      query = {
        contextType: "direct",
        "participants.userId": { $all: participantIds },
        participants: { $size: 2 },
      };
    } else if (contextType === "trip" && contextId) {
      // For trips, there should be one chat per trip
      query = {
        contextType: "trip",
        contextId,
      };
    }

    const existingChat = await db.collection("chats").findOne(query);

    if (existingChat) {
      res.json({
        exists: true,
        chat: existingChat,
        chatId: existingChat._id,
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error("Error finding existing chat:", error);
    res.status(500).json({ error: "Failed to check for existing chat" });
  }
});

// Process AI response
async function processAiResponse(db, chatId, userId, userMessage) {
  const startTime = Date.now();
  console.log("Processing AI response for chat:", chatId);
  if (!openai) {
    console.log("OpenAI not initialized");
    return;
  }

  try {
    // 1. Get user's trips for context (optimized: only fetch necessary fields)
    const trips = await db
      .collection("trips")
      .find(
        {
          $or: [{ userId: userId }, { "sharedWith.userId": userId }],
        },
        {
          projection: {
            _id: 1,
            name: 1,
            startDate: 1,
            endDate: 1,
            destinations: 1,
            "flights.airline": 1,
            "flights.flightNumber": 1,
            "hotels.name": 1,
            "rides.type": 1,
            "attractions.name": 1,
          },
        },
      )
      .limit(10) // Only get recent trips
      .toArray();

    console.log("Found trips for context:", trips.length);

    // 2. Get chat history for context (reduced to 20 for faster responses)
    const history = await db
      .collection("messages")
      .find({ chatId: chatId })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    // Format history for OpenAI
    const previousMessages = history.reverse().map((msg) => ({
      role: msg.senderId === "loka-bot" ? "assistant" : "user",
      content: msg.text,
    }));

    // Ensure current message is included if not already (it should be in DB)
    if (
      previousMessages.length === 0 ||
      previousMessages[previousMessages.length - 1].content !== userMessage
    ) {
      previousMessages.push({ role: "user", content: userMessage });
    }

    console.log(
      "Sending messages to OpenAI:",
      JSON.stringify(previousMessages, null, 2),
    );

    const systemPrompt = `
You are Loka, a PREMIUM TRAVEL ASSISTANT for MeetLoka.

You are FAST, SMART, and VISUALLY PROFESSIONAL.
You feel like a real human travel agent, not a technical bot.

CURRENT USER TRIPS: ${JSON.stringify(
      trips.map((t) => ({
        id: t._id,
        name: t.name,
        dates: t.startDate + " to " + t.endDate,
        destinations: t.destinations,
        itemCounts: {
          flights: (t.flights || []).length,
          hotels: (t.hotels || []).length,
          rides: (t.rides || []).length,
          attractions: (t.attractions || []).length,
        },
        existingAttractions: (t.attractions || []).map((a) => ({
          name: a.name,
          type: a.type,
          date: a.scheduledDate,
          time: a.scheduledTime,
        })),
        hotels: (t.hotels || []).map((h) => ({
          name: h.name,
          checkIn: h.checkIn,
          checkOut: h.checkOut,
        })),
        isPast: new Date(t.endDate) < new Date(),
      })),
    )}

IMPORTANT TRIP SELECTION RULES:
- If user has MULTIPLE trips, ALWAYS ask which trip they want to work on
- When user asks "הוסף מסעדה" / "add restaurant" without specifying trip:
  1. Show list of their trips with dates
  2. Ask "לאיזה טיול?" / "Which trip?"
  3. Wait for user to choose before calling functions
- When user says trip name or dates → Use select_trip function
- Never assume which trip - ALWAYS confirm first
- After selecting trip, remember it for the conversation context

TRIP SELECTION EXAMPLES:
User: "הוסף מסעדה Nobu"
You: "נהדר! לאיזה טיול?\n\n🌍 **Dubai Honeymoon** (Jan 2-5)\n🌍 **Paris Weekend** (Feb 10-12)"

User: "לדובאי"
You: [Call select_trip, then proceed to add restaurant]

IMPORTANT: When adding activities, CHECK existingAttractions first!
- Don't suggest places that are already added
- Acknowledge what's already there: "Burj Khalifa is in your plan ✓"
- Suggest NEW places that complement what they have

=== YOUR PERSONALITY ===

**You are WARM, FRIENDLY & HELPFUL:**
- Always greet users pleasantly: "שלום!", "נהדר!", "מעולה!"
- Show enthusiasm with emojis: ✨🌍✈️😊🎉
- Be encouraging: "זה נשמע מדהים!", "בחירה מצוינת!"
- End with helpful offers: "רוצה שאוסיף עוד משהו?", "יש משהו נוסף שתרצה?"

**PROACTIVE SUGGESTIONS:**
After creating a trip or adding activities, ALWAYS offer helpful tips:
1. **Weather advice** based on destination and dates:
   - Winter trips: "מזג האוויר ב[יעד] ב[חודש] יכול להיות קר - מומלץ להביא בגדים חמים 🧥"
   - Summer trips: "ב[יעד] ב[חודש] חם מאוד - אל תשכחו קרם הגנה ובקבוק מים ☀️💧"
   - Spring/Fall: "מזג אוויר נעים ב[יעד] - בגדים קלים ומעיל דק 🌤️"

2. **Practical tips:**
   - "💡 טיפ: רוב המוזיאונים סגורים ביום ראשון"
   - "⏰ מומלץ להזמין מסעדות מראש, במיוחד בסופי שבוע"
   - "🚗 המרחק בין המקומות האלה הוא כ-X דקות - רוצה שאוסיף נסיעה?"

3. **Destination insights:**
   - Share 1-2 interesting facts about places
   - Mention local customs or best times to visit
   - Suggest complementary activities nearby

**TONE:**
- Hebrew: חם, ידידותי, עוזר
- English: Warm, friendly, helpful
- Always positive and solution-oriented
- Never robotic - feel like a real travel agent friend

=== PREMIUM ASSISTANT PRINCIPLES ===

0. **RECOGNIZE TRIP CREATION REQUESTS** (CRITICAL)
   When user asks to:
   - "תבנה לי [destination]" / "Build me [destination]"
   - "Plan a trip to [destination]"
   - "Create [type] trip to [destination]"
   - "ירח דבש [destination]" / "honeymoon [destination]"
   
   **YOU MUST**:
   1. Extract destination, dates, trip name from their message
   2. Call create_trip function IMMEDIATELY with:
      - destination: City/country name
      - startDate: YYYY-MM-DD format
      - endDate: YYYY-MM-DD format
      - name: Descriptive name (e.g., "Italy Honeymoon", "Milan Romantic Getaway")
   3. Parse dates from Hebrew/English:
      - "20.1" = January 20
      - "עד 24.1" = until January 24
      - Current year: 2025, but if month passed, assume 2026
   
   **After creating trip**: 
   - Confirm creation with enthusiasm
   - Then automatically suggest 3-5 activities matching their request
   - Use add_multiple_activities to add them all at once

1. ULTRA-FAST RESPONSES
   - NO unnecessary questions
   - Use SMART DEFAULTS for everything
   - Infer dates from context (if trip has dates, use them)
   - Default time: restaurants = 20:00, attractions = 10:00
   - Ask only if truly ambiguous

2. INSTANT RECOGNITION & AUTO-CLASSIFICATION
   - User says "Add restaurant Nobu" → Recognize it's a place, add it immediately
   - User says "Dinner at Din Tai Fung tomorrow" → Understand intent, extract time/date
   - User mentions a place name → Assume they want to add it
   - NEVER ask "Would you like me to add this?" - JUST DO IT
   
   **AUTO-DETECT TYPE (CRITICAL)**:
   - Restaurants/Cafes/Bars → type: "restaurant"
     Examples: Nobu, Din Tai Fung, At.mosphere, Zuma, McDonald's, Starbucks
   - Tourist Sites/Museums/Parks/Beaches/Shopping → type: "attraction"
     Examples: Burj Khalifa, Dubai Mall, Louvre, Central Park, Beach, Market
   - **You MUST classify correctly** - don't ask user
   - If unsure: dining places = restaurant, sightseeing = attraction
   
   **ITINERARY REQUESTS** (מסלול / plan / suggestions):
   - If user asks for "itinerary", "plan", "מסלול", "מה לעשות" → Suggest 3-5 activities
   - Spread throughout the day: morning (10:00), afternoon (14:00), evening (19:00-21:00)
   - Include mix: 2-3 attractions + 1-2 restaurants
   - **CLASSIFY EACH ITEM**: restaurants as "restaurant", attractions as "attraction"
   - Present as a LIST of suggestions first
   - After presenting list, ask: "Want me to add any of these?"
   - If user says "yes" / "כן" / "הוסף" → Use add_multiple_activities with ALL items
   - If user specifies specific items ("add the first two", "only restaurants") → Add only those

3. ZERO-FRICTION UX
   - Minimal typing required from user
   - Show confirmations with visual previews (I'll format them)
   - Use action buttons (Add / Edit / Cancel) instead of asking again
   - One-click confirmations

4. SMART CONTEXT AWARENESS
   - Check CHAT HISTORY before asking anything
   - If you just added something, DON'T repeat the duplicate message
   - For greetings ("hi", "hello", "היי"), just greet back - NO actions
   - Remember what was discussed
   - Infer "it", "this", "that" from recent messages
   - **CRITICAL**: If user asks for "itinerary/מסלול" AFTER you added one item, they want MORE suggestions, not the same item again
   - When user says "אבל ביקשתי מסלול" → They want a FULL PLAN, not just one place
   - Present 3-5 different places, don't keep repeating what's already added

5. STRUCTURED RESPONSES
   - When adding places, respond in this EXACT format:
   
   🍽️ **[Name]**
   📍 [Full Address]
   ⭐ [Rating if known]
   🕗 [Time]
   📅 [Date]
   
   Added to your trip!
   
   - Use emojis: 🍽️ restaurants, 🎟️ attractions, 🏨 hotels, 🚗 rides, ✈️ flights
   - Keep messages clean and scannable

6. INTELLIGENT FOLLOW-UPS (MAX 1 PER ACTION)
   After adding something, suggest ONE relevant next step ONLY:
   - "Want me to add a ride from your hotel?" (if place is far)
   - "Should I add breakfast tomorrow?"
   - "Anything else for this evening?"
   
   NEVER spam suggestions. Be calm and helpful.

7. SMART RIDE SUGGESTIONS
   If place is not at hotel:
   - Suggest: "This place is [distance] from your hotel. Want me to add a ride?"
   - If confirmed, calculate pickup time automatically
   - Show estimated arrival time

8. NATURAL LANGUAGE EDITING
   User can type simple commands:
   - "Change dinner to 21:00" → Update time
   - "Move this to tomorrow" → Update date
   - "Delete this" → Remove item
   - "Edit the time" → Ask for new time
   
   Understand context from recent messages.

8.5. ADDING FROM ITINERARY SUGGESTIONS
   **IMPORTANT**: When user says "yes"/"כן"/"add them all" after you suggested an itinerary:
   - Use the add_multiple_activities function (NOT add_activity)
   - Pass ALL the activities you just suggested in the activities array
   - **CRITICAL**: Set correct "type" for each:
     * Restaurants/dining → type: "restaurant"
     * Attractions/sightseeing → type: "attraction"
   - Include: name, type, date, time for each (location is optional, Google will find it)
   - The system will add them all at once and show progress
   - Response will be automatic: "מעולה! הוספתי X פריטים לטיול שלך..."
   
   Example JSON structure:
   {
     "tripId": "...",
     "activities": [
       {"name": "Dubai Mall", "type": "attraction", "date": "2026-01-02", "time": "12:00"},
       {"name": "At.mosphere", "type": "restaurant", "date": "2026-01-02", "time": "14:00"},
       {"name": "Pierchic", "type": "restaurant", "date": "2026-01-02", "time": "20:00"}
     ]
   }

9. VALIDATION (SILENT & HELPFUL)
   - Check timelines in background
   - Only mention issues if critical
   - Suggest fixes immediately: "I moved it to 19:30 to avoid conflict"
   - Don't spam warnings

10. COMMUNICATION STYLE
   - Polite, not robotic
   - Use natural language
   - Be concise (2-3 sentences max)
   - Friendly but professional
   - Support Hebrew and English fluently

=== SMART DEFAULTS ===

When adding activities/restaurants:
- If user says "tomorrow" → Use next day in their trip
- If user says "tonight" or "this evening" → Use today at 20:00
- If user says "morning" → Use 10:00
- If user says "lunch" → Use 13:00
- If user says "dinner" → Use 20:00
- If no time specified for restaurant → Default 20:00
- If no time specified for attraction → Default 10:00
- If no date specified → Use first day of active trip

For hotels:
- Default check-in: 15:00
- Default check-out: 12:00

For rides:
- Airport pickup: 3 hours before flight
- Return to hotel after activity: Right after activity ends

=== RESPONSE FORMAT EXAMPLES ===

GOOD - Adding a restaurant:
"🍽️ **Nobu Dubai**
📍 Atlantis The Palm, Dubai
⭐ 4.6
🕗 20:00
📅 Jan 2, 2026

Added to your trip! Want me to add a ride from your hotel?"

GOOD - Simple greeting:
"Hi! How can I help with your trip planning today?"

GOOD - Itinerary request (מסלול):
"Here's what I recommend for Dubai:

**Morning:**
🎟️ Burj Khalifa (10:00) - attraction - Already in your trip
🎟️ Dubai Mall (12:00) - attraction

**Afternoon:**
🍽️ At.mosphere (14:00) - restaurant - Lunch with a view

**Evening:**
🍽️ Pierchic (19:30) - Seafood by the water
🎟️ Dubai Fountain show (21:00)

Want me to add any of these?"

GOOD - Validation issue:
"⚠️ Your restaurant is at 14:00, but hotel check-in is at 15:00. I've moved it to 19:00 instead."

BAD - Don't say:
"Would you like me to add this restaurant to your trip?"
"I can help you with that. Which trip should I add it to?"
"Please confirm if you want me to proceed."
"Burj Khalifa is already in your trip" (when user asked for full itinerary)

=== GOAL ===
Be like Apple/Airbnb: Fast, elegant, minimal friction.
Make users feel taken care of, not interrogated.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Faster and more efficient than gpt-4-turbo-preview
      messages: [
        { role: "system", content: systemPrompt },
        ...previousMessages,
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_trip",
            description: "Create a new trip with destination and dates",
            parameters: {
              type: "object",
              properties: {
                destination: { type: "string" },
                startDate: {
                  type: "string",
                  format: "date",
                  description: "YYYY-MM-DD",
                },
                endDate: {
                  type: "string",
                  format: "date",
                  description: "YYYY-MM-DD",
                },
                name: { type: "string" },
              },
              required: ["destination", "startDate", "endDate", "name"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_flight",
            description: "Add a flight to a trip",
            parameters: {
              type: "object",
              properties: {
                tripId: {
                  type: "string",
                  description: "The ID of the trip to add to",
                },
                airline: { type: "string" },
                flightNumber: { type: "string" },
                departure: { type: "string", description: "Airport code" },
                arrival: { type: "string", description: "Airport code" },
                date: { type: "string", format: "date" },
                time: { type: "string", format: "time" },
              },
              required: [
                "tripId",
                "airline",
                "flightNumber",
                "departure",
                "arrival",
                "date",
                "time",
              ],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_activity",
            description:
              "Add a single restaurant, attraction, or activity to a trip",
            parameters: {
              type: "object",
              properties: {
                tripId: {
                  type: "string",
                  description: "The ID of the trip to add to",
                },
                type: {
                  type: "string",
                  enum: ["restaurant", "attraction", "activity", "other"],
                },
                name: { type: "string" },
                location: { type: "string" },
                date: { type: "string", format: "date" },
                time: {
                  type: "string",
                  format: "time",
                  description: "HH:MM format",
                },
                notes: { type: "string" },
              },
              required: ["tripId", "type", "name"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "select_trip",
            description:
              "Select which trip to work on. Use when user wants to switch between trips or specify which trip to add items to. Show user their trips and let them choose.",
            parameters: {
              type: "object",
              properties: {
                tripId: {
                  type: "string",
                  description:
                    "The ID of the trip to select. If not provided, show list of available trips.",
                },
                reason: {
                  type: "string",
                  description:
                    "Why selecting this trip (e.g., 'User wants to add activities to Paris trip')",
                },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_multiple_activities",
            description:
              "Add multiple activities/restaurants at once when user approves an entire suggested itinerary. Use this when user says 'yes'/'כן' to add all suggested items.",
            parameters: {
              type: "object",
              properties: {
                tripId: {
                  type: "string",
                  description: "The ID of the trip to add to",
                },
                activities: {
                  type: "array",
                  description: "List of all activities to add",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["restaurant", "attraction", "activity", "other"],
                      },
                      name: { type: "string" },
                      location: { type: "string" },
                      date: { type: "string", format: "date" },
                      time: { type: "string", format: "time" },
                      notes: { type: "string" },
                    },
                    required: ["type", "name"],
                  },
                },
              },
              required: ["tripId", "activities"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_hotel",
            description:
              "Add a hotel to a trip with check-in and check-out times",
            parameters: {
              type: "object",
              properties: {
                tripId: {
                  type: "string",
                  description: "The ID of the trip to add to",
                },
                name: { type: "string" },
                address: { type: "string" },
                checkIn: {
                  type: "string",
                  format: "date",
                  description: "YYYY-MM-DD",
                },
                checkOut: {
                  type: "string",
                  format: "date",
                  description: "YYYY-MM-DD",
                },
                arrivalTime: {
                  type: "string",
                  description: "HH:MM format, default 15:00",
                },
                includesMeals: { type: "boolean" },
                mealPlan: {
                  type: "string",
                  enum: ["breakfast", "half-board", "all-inclusive"],
                  description: "Only if includesMeals is true",
                },
              },
              required: ["tripId", "name", "address", "checkIn", "checkOut"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_ride",
            description: "Add a taxi or ride transfer to a trip",
            parameters: {
              type: "object",
              properties: {
                tripId: {
                  type: "string",
                  description: "The ID of the trip to add to",
                },
                type: { type: "string", enum: ["taxi", "rental"] },
                pickup: { type: "string" },
                dropoff: { type: "string" },
                date: { type: "string", format: "date" },
                time: {
                  type: "string",
                  format: "time",
                  description: "Pickup time HH:MM",
                },
                duration: { type: "string", description: "E.g., '45 minutes'" },
              },
              required: ["tripId", "pickup", "dropoff", "date", "time"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "validate_trip",
            description:
              "Validate a trip for logical issues, timeline conflicts, and missing items. Returns a list of issues found.",
            parameters: {
              type: "object",
              properties: {
                tripId: {
                  type: "string",
                  description: "The ID of the trip to validate",
                },
              },
              required: ["tripId"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "suggest_fix",
            description:
              "Suggest a specific fix for a timeline issue without applying it. User must approve.",
            parameters: {
              type: "object",
              properties: {
                tripId: { type: "string" },
                issue: {
                  type: "string",
                  description: "Description of the problem",
                },
                suggestedAction: {
                  type: "string",
                  description: "What should be done to fix it",
                },
                itemType: {
                  type: "string",
                  enum: ["flight", "hotel", "ride", "attraction"],
                },
                itemIndex: {
                  type: "number",
                  description: "Index of the item to modify",
                },
              },
              required: ["tripId", "issue", "suggestedAction"],
            },
          },
        },
      ],
      tool_choice: "auto",
    });

    const openaiTime = Date.now() - startTime;
    console.log(`OpenAI response received in ${openaiTime}ms`);
    const responseMessage = completion.choices[0].message;
    let responseText =
      responseMessage.content ||
      "I'm here to help! What would you like to know?";
    let action = null;

    console.log(
      "AI response type:",
      responseMessage.tool_calls ? "FUNCTION_CALL" : "TEXT_ONLY",
    );
    console.log("AI content:", responseText);

    // Check if AI wants to call a function
    if (responseMessage.tool_calls) {
      const toolCall = responseMessage.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      if (functionName === "create_trip") {
        try {
          const newTrip = {
            id: `trip-${Date.now()}`, // Add string ID for compatibility with trips routes
            userId: userId,
            name: functionArgs.name || `Trip to ${functionArgs.destination}`,
            destination: functionArgs.destination,
            destinations: [
              {
                name: functionArgs.destination,
                startDate: functionArgs.startDate,
                endDate: functionArgs.endDate,
              },
            ],
            startDate: functionArgs.startDate,
            endDate: functionArgs.endDate,
            participants: [{ userId: userId, role: "owner" }],
            sharedWith: [],
            flights: [],
            hotels: [],
            attractions: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await db.collection("trips").insertOne(newTrip);

          action = {
            type: "TRIP_CREATED",
            tripId: result.insertedId,
            data: functionArgs,
          };

          const startDate = new Date(functionArgs.startDate).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" },
          );
          const endDate = new Date(functionArgs.endDate).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" },
          );

          responseText = `✈️ **${functionArgs.name}**\n📍 ${functionArgs.destination}\n📅 ${startDate} - ${endDate}\n\nYour trip is ready! What would you like to add first?`;
        } catch (err) {
          console.error("Error creating trip:", err);
          responseText =
            "I couldn't create the trip due to an error. Please try again.";
        }
      } else if (functionName === "add_flight") {
        try {
          const tripId = functionArgs.tripId;
          const flight = {
            id: new ObjectId().toString(),
            airline: functionArgs.airline,
            flightNumber: functionArgs.flightNumber,
            departure: functionArgs.departure,
            arrival: functionArgs.arrival,
            date: functionArgs.date,
            time: functionArgs.time,
            createdAt: new Date(),
          };

          await db
            .collection("trips")
            .updateOne(
              { _id: new ObjectId(tripId) },
              { $push: { flights: flight } },
            );

          action = {
            type: "ADD_FLIGHT",
            data: functionArgs,
          };

          const flightDate = new Date(functionArgs.date).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" },
          );
          responseText = `✈️ **${functionArgs.airline} ${functionArgs.flightNumber}**\n🛫 ${functionArgs.departure} → 🛬 ${functionArgs.arrival}\n📅 ${flightDate} at ${functionArgs.time}\n\nFlight added! Need a ride to the airport?`;
        } catch (err) {
          console.error("Error adding flight:", err);
          responseText = "I couldn't add the flight due to an error.";
        }
      } else if (functionName === "add_activity") {
        try {
          const tripId = functionArgs.tripId;

          // Try to fetch place details from Google Places API
          let placeDetails = null;
          let enrichedLocation = functionArgs.location || "";
          let rating = null;

          // Always try to enrich with Google Places if we have a name
          if (functionArgs.name) {
            try {
              // Get trip to find location context
              const trip = await db
                .collection("trips")
                .findOne({ _id: new ObjectId(tripId) });
              const cityContext = trip?.destinations?.[0]?.name || null;

              // Search with city context if available
              const searchQuery = cityContext
                ? `${functionArgs.name} ${cityContext}`
                : functionArgs.name;

              // Check cache first
              placeDetails = getCachedPlace(searchQuery);

              if (placeDetails) {
                console.log(`💾 Cache hit for: ${searchQuery}`);
              } else {
                console.log(`🔍 Searching Google Places for: ${searchQuery}`);
                placeDetails = await googleApi.searchPlaceByText(searchQuery);

                if (placeDetails) {
                  cachePlace(searchQuery, placeDetails);
                  console.log(
                    `✅ Found & cached: ${placeDetails.name} at ${placeDetails.address}`,
                  );
                }
              }

              if (placeDetails) {
                enrichedLocation = placeDetails.address;
                rating = placeDetails.rating;
              }
            } catch (err) {
              console.error("Google Places search error:", err.message);
              // Continue without place details
            }
          }

          // Check if activity already exists to prevent duplicates
          const existingTrip = await db
            .collection("trips")
            .findOne({ _id: new ObjectId(tripId) });
          const isDuplicate = existingTrip?.attractions?.some(
            (attr) =>
              attr.name === functionArgs.name &&
              attr.scheduledDate === functionArgs.date &&
              attr.scheduledTime === functionArgs.time,
          );

          if (isDuplicate) {
            responseText = `${functionArgs.name} is already in your trip at ${functionArgs.time || "the scheduled time"}. 🎯`;
          } else {
            const activity = {
              id: new ObjectId().toString(),
              type: functionArgs.type, // Keep for internal use
              attractionType: functionArgs.type, // For frontend display
              name: placeDetails?.name || functionArgs.name,
              location: enrichedLocation, // Keep for backward compatibility
              address: enrichedLocation, // For frontend display
              scheduledDate: functionArgs.date,
              scheduledTime: functionArgs.time || "",
              notes: functionArgs.notes || "",
              rating: rating, // Google Places rating
              placeId: placeDetails?.placeId || null,
              photoReference: placeDetails?.photoReference || null, // Google photo
              createdAt: new Date(),
            };

            // Update the trip in the database
            await db
              .collection("trips")
              .updateOne(
                { _id: new ObjectId(tripId) },
                { $push: { attractions: activity } },
              );

            action = {
              type: "ADD_ACTIVITY",
              data: {
                ...functionArgs,
                icon:
                  functionArgs.type === "restaurant"
                    ? "🍽️"
                    : functionArgs.type === "attraction"
                      ? "🎟️"
                      : "📍",
              },
            };

            // Format premium response
            const icon =
              functionArgs.type === "restaurant"
                ? "🍽️"
                : functionArgs.type === "attraction"
                  ? "🎟️"
                  : "📍";
            const time = functionArgs.time || "time TBD";
            const date = functionArgs.date
              ? new Date(functionArgs.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "";

            responseText = `${icon} **${placeDetails?.name || functionArgs.name}**\n`;
            if (enrichedLocation) responseText += `📍 ${enrichedLocation}\n`;
            if (rating) responseText += `⭐ ${rating}\n`;
            responseText += `🕗 ${time}\n`;
            if (date) responseText += `📅 ${date}\n`;
            responseText += `\nAdded to your trip!`;
          }
        } catch (err) {
          console.error("Error adding activity:", err);
          responseText =
            "I tried to add that item but encountered an error. Please try again.";
        }
      } else if (functionName === "add_multiple_activities") {
        try {
          const tripId = functionArgs.tripId;
          const activitiesToAdd = functionArgs.activities || [];

          console.log(
            `🔄 Adding ${activitiesToAdd.length} activities in batch...`,
          );
          console.log(
            "📋 Activities received from AI:",
            JSON.stringify(activitiesToAdd, null, 2),
          );

          const addedItems = [];
          const skippedItems = [];

          // Get trip for context
          const trip = await db
            .collection("trips")
            .findOne({ _id: new ObjectId(tripId) });
          const cityContext = trip?.destinations?.[0]?.name || null;

          for (const activityData of activitiesToAdd) {
            try {
              // Check if already exists
              const existingTrip = await db
                .collection("trips")
                .findOne({ _id: new ObjectId(tripId) });
              const isDuplicate = existingTrip?.attractions?.some(
                (attr) =>
                  attr.name === activityData.name &&
                  attr.scheduledDate === activityData.date,
              );

              if (isDuplicate) {
                skippedItems.push(activityData.name + " (already added)");
                continue;
              }

              // Try to enrich with Google Places
              let placeDetails = null;
              let enrichedLocation = activityData.location || "";
              let rating = null;

              if (activityData.name) {
                const searchQuery = cityContext
                  ? `${activityData.name} ${cityContext}`
                  : activityData.name;

                console.log(`🔍 Searching for: "${searchQuery}"`);

                placeDetails = getCachedPlace(searchQuery);
                if (placeDetails) {
                  console.log(`💾 Cache hit for: ${searchQuery}`);
                } else {
                  console.log(
                    `🌐 Calling Google Places API for: ${searchQuery}`,
                  );
                  placeDetails = await googleApi.searchPlaceByText(searchQuery);
                  if (placeDetails) {
                    cachePlace(searchQuery, placeDetails);
                    console.log(
                      `✅ Found: ${placeDetails.name} at ${placeDetails.address}`,
                    );
                  } else {
                    console.log(`❌ Not found: ${searchQuery}`);
                  }
                }

                if (placeDetails) {
                  enrichedLocation = placeDetails.address;
                  rating = placeDetails.rating;
                  console.log(
                    `📍 Enriched location: ${enrichedLocation}, Rating: ${rating}`,
                  );
                } else {
                  console.log(`⚠️ No place details for: ${activityData.name}`);
                }
              }

              // Add the activity
              const activity = {
                id: new ObjectId().toString(),
                type: activityData.type, // Keep for internal use
                attractionType: activityData.type, // For frontend display
                name: placeDetails?.name || activityData.name,
                location: enrichedLocation, // Keep for backward compatibility
                address: enrichedLocation, // For frontend display
                rating: rating, // Add rating
                scheduledDate: activityData.date,
                scheduledTime: activityData.time || "",
                notes: activityData.notes || "",
                placeId: placeDetails?.placeId || null,
                photoReference: placeDetails?.photoReference || null, // Google photo
                createdAt: new Date(),
              };

              await db
                .collection("trips")
                .updateOne(
                  { _id: new ObjectId(tripId) },
                  { $push: { attractions: activity } },
                );

              addedItems.push({
                name: activity.name,
                location: enrichedLocation,
                rating: rating,
                time: activityData.time,
                date: activityData.date,
                type: activityData.type,
              });

              console.log(
                `✅ Added: ${activity.name} | Location: ${enrichedLocation || "N/A"} | Rating: ${rating || "N/A"}`,
              );
            } catch (itemErr) {
              console.error(`Error adding ${activityData.name}:`, itemErr);
              skippedItems.push(activityData.name + " (error)");
            }
          }

          // Build response
          responseText = `מעולה! הוספתי ${addedItems.length} פריטים לטיול שלך:\n\n`;

          addedItems.forEach((item, index) => {
            const icon = item.type === "restaurant" ? "🍽️" : "🎟️";
            responseText += `${index + 1}. ${icon} **${item.name}**\n`;
            if (item.location) responseText += `   📍 ${item.location}\n`;
            if (item.rating) responseText += `   ⭐ ${item.rating}\n`;
            if (item.time) responseText += `   🕗 ${item.time}\n`;
            responseText += `\n`;
          });

          if (skippedItems.length > 0) {
            responseText += `\n⚠️ Skipped ${skippedItems.length} items: ${skippedItems.join(", ")}`;
          }

          responseText += `\n✅ הכל מוכן! הטיול שלך מעודכן.`;

          console.log("📤 Final response being sent to user:");
          console.log(responseText);

          action = {
            type: "ADD_MULTIPLE_ACTIVITIES",
            data: { added: addedItems.length, skipped: skippedItems.length },
          };
        } catch (err) {
          console.error("Error adding multiple activities:", err);
          responseText =
            "Sorry, I encountered an error while adding the activities. Please try again.";
        }
      } else if (functionName === "add_hotel") {
        try {
          const tripId = functionArgs.tripId;

          // Calculate nights
          const checkInDate = new Date(functionArgs.checkIn);
          const checkOutDate = new Date(functionArgs.checkOut);
          const nights = Math.ceil(
            (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24),
          );

          const hotel = {
            id: new ObjectId().toString(),
            placeId: "",
            name: functionArgs.name,
            address: functionArgs.address,
            checkIn: functionArgs.checkIn,
            checkOut: functionArgs.checkOut,
            nights: nights,
            arrivalTime: functionArgs.arrivalTime || "15:00",
            includesMeals: functionArgs.includesMeals || false,
            mealPlan: functionArgs.mealPlan || null,
            createdAt: new Date(),
          };

          await db
            .collection("trips")
            .updateOne(
              { _id: new ObjectId(tripId) },
              { $push: { hotels: hotel } },
            );

          action = {
            type: "ADD_HOTEL",
            data: functionArgs,
          };

          const checkInFormatted = new Date(
            functionArgs.checkIn,
          ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const checkOutFormatted = new Date(
            functionArgs.checkOut,
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          responseText = `🏨 **${functionArgs.name}**\n📍 ${functionArgs.address}\n📅 ${checkInFormatted} - ${checkOutFormatted} (${nights} ${nights === 1 ? "night" : "nights"})\n🕒 Check-in: ${functionArgs.arrivalTime || "15:00"}\n\nHotel booked! Need a ride from the airport?`;
        } catch (err) {
          console.error("Error adding hotel:", err);
          responseText = "I couldn't add the hotel due to an error.";
        }
      } else if (functionName === "add_ride") {
        try {
          const tripId = functionArgs.tripId;
          const ride = {
            id: new ObjectId().toString(),
            type: functionArgs.type || "taxi",
            pickup: functionArgs.pickup,
            dropoff: functionArgs.dropoff,
            date: functionArgs.date,
            time: functionArgs.time,
            duration: functionArgs.duration || "",
            createdAt: new Date(),
          };

          await db
            .collection("trips")
            .updateOne(
              { _id: new ObjectId(tripId) },
              { $push: { rides: ride } },
            );

          action = {
            type: "ADD_RIDE",
            data: functionArgs,
          };

          const rideDate = new Date(functionArgs.date).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" },
          );
          const duration = functionArgs.duration
            ? ` (~${functionArgs.duration})`
            : "";

          responseText = `🚗 **Ride booked**\n📍 ${functionArgs.pickup} → ${functionArgs.dropoff}\n📅 ${rideDate} at ${functionArgs.time}${duration}\n\nAll set!`;
        } catch (err) {
          console.error("Error adding ride:", err);
          responseText = "I couldn't add the ride due to an error.";
        }
      } else if (functionName === "select_trip") {
        try {
          const tripId = functionArgs.tripId;

          if (tripId) {
            // User selected a specific trip
            const trip = await db
              .collection("trips")
              .findOne({ _id: new ObjectId(tripId) });

            if (!trip) {
              responseText = "לא מצאתי את הטיול הזה. בוא נבחר מחדש.";
            } else {
              const startDate = new Date(trip.startDate).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" },
              );
              const endDate = new Date(trip.endDate).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              );

              responseText = `✅ נהדר! אנחנו עובדים על:\n\n🌍 **${trip.name}**\n📅 ${startDate} - ${endDate}\n\n`;

              // Show what's already in the trip
              const hasItems =
                (trip.flights?.length || 0) +
                (trip.hotels?.length || 0) +
                (trip.attractions?.length || 0) +
                (trip.rides?.length || 0);

              if (hasItems > 0) {
                responseText += "**בטיול כבר יש:**\n";
                if (trip.flights?.length)
                  responseText += `✈️ ${trip.flights.length} טיסות\n`;
                if (trip.hotels?.length)
                  responseText += `🏨 ${trip.hotels.length} מלונות\n`;
                if (trip.attractions?.length)
                  responseText += `🎯 ${trip.attractions.length} אטרקציות\n`;
                if (trip.rides?.length)
                  responseText += `🚗 ${trip.rides.length} נסיעות\n`;
                responseText += "\n";
              }

              responseText += "מה תרצה להוסיף?";

              action = {
                type: "TRIP_SELECTED",
                tripId: tripId,
                data: {
                  name: trip.name,
                  dates: `${startDate} - ${endDate}`,
                },
              };
            }
          } else {
            // Show list of trips for user to choose
            if (trips.length === 0) {
              responseText =
                "אין לך טיולים פעילים כרגע. בוא ניצור טיול חדש! לאן אתה רוצה לנסוע?";
            } else if (trips.length === 1) {
              // Only one trip, select it automatically
              const trip = trips[0];
              const startDate = new Date(trip.startDate).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" },
              );
              const endDate = new Date(trip.endDate).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              );

              responseText = `נעבוד על הטיול שלך:\n\n🌍 **${trip.name}**\n📅 ${startDate} - ${endDate}\n\nמה תרצה להוסיף?`;

              action = {
                type: "TRIP_SELECTED",
                tripId: trip._id,
                data: {
                  name: trip.name,
                  dates: `${startDate} - ${endDate}`,
                },
              };
            } else {
              // Multiple trips - ask user to choose
              responseText = "יש לך כמה טיולים. לאיזה טיול תרצה להוסיף?\n\n";

              trips.forEach((trip, index) => {
                const startDate = new Date(trip.startDate).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                  },
                );
                const endDate = new Date(trip.endDate).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
                );

                const isPast = new Date(trip.endDate) < new Date();
                const status = isPast ? " (עבר)" : "";

                responseText += `${index + 1}. 🌍 **${trip.name}**${status}\n   📅 ${startDate} - ${endDate}\n\n`;
              });

              responseText += 'ענה עם המספר או שם הטיול (למשל: "1" או "דובאי")';

              action = {
                type: "SHOW_TRIP_LIST",
                data: trips.map((t) => ({
                  id: t._id,
                  name: t.name,
                })),
              };
            }
          }
        } catch (err) {
          console.error("Error selecting trip:", err);
          responseText = "אירעה שגיאה בבחירת הטיול. נסה שוב.";
        }
      } else if (functionName === "validate_trip") {
        try {
          const tripId = functionArgs.tripId;
          const trip = await db
            .collection("trips")
            .findOne({ _id: new ObjectId(tripId) });

          if (!trip) {
            responseText = "Trip not found.";
          } else {
            // Perform validation
            const issues = [];

            // Check for missing rides
            if (
              (trip.flights || []).length > 0 &&
              (trip.hotels || []).length > 0
            ) {
              const hasArrivalRide = (trip.rides || []).some(
                (r) =>
                  r.pickup.toLowerCase().includes("airport") &&
                  r.dropoff.toLowerCase().includes("hotel"),
              );
              if (!hasArrivalRide) {
                issues.push("⚠️ Missing airport → hotel ride");
              }

              const hasDepartureRide = (trip.rides || []).some(
                (r) =>
                  r.pickup.toLowerCase().includes("hotel") &&
                  r.dropoff.toLowerCase().includes("airport"),
              );
              if (!hasDepartureRide) {
                issues.push("⚠️ Missing hotel → airport ride");
              }
            }

            // Check hotel check-out times
            (trip.hotels || []).forEach((hotel, idx) => {
              if (!hotel.arrivalTime) {
                issues.push(
                  `⚠️ Hotel "${hotel.name}" has no check-in time (default should be 15:00)`,
                );
              }
            });

            // Check for activities outside hotel dates
            (trip.attractions || []).forEach((attr) => {
              const attrDate = new Date(attr.scheduledDate);
              const inHotelRange = (trip.hotels || []).some((hotel) => {
                const checkIn = new Date(hotel.checkIn);
                const checkOut = new Date(hotel.checkOut);
                return attrDate >= checkIn && attrDate <= checkOut;
              });

              if (!inHotelRange && (trip.hotels || []).length > 0) {
                issues.push(
                  `⚠️ Activity "${attr.name}" on ${attr.scheduledDate} is outside hotel stay dates`,
                );
              }
            });

            if (issues.length === 0) {
              responseText =
                "✅ Your trip looks good! Everything is logically organized with no conflicts.";
            } else {
              responseText = `I found ${issues.length} issue(s) with your trip:\n\n${issues.join("\n")}\n\nWould you like me to suggest fixes?`;
            }
          }
        } catch (err) {
          console.error("Error validating trip:", err);
          responseText = "I couldn't validate the trip due to an error.";
        }
      } else if (functionName === "suggest_fix") {
        responseText = `💡 **Suggested Fix:**\n\n**Issue:** ${functionArgs.issue}\n\n**Solution:** ${functionArgs.suggestedAction}\n\nShould I apply this change?`;

        action = {
          type: "SUGGEST_FIX",
          data: functionArgs,
        };
      }
    }

    // Save AI response to DB
    if (responseText) {
      const aiMessage = {
        chatId: chatId, // ObjectId string
        senderId: "loka-bot",
        senderName: "Loka",
        text: responseText,
        action: action,
        timestamp: new Date(),
        readBy: [],
      };
      await db.collection("messages").insertOne(aiMessage);

      // Update chat lastMessage
      await db.collection("chats").updateOne(
        { _id: new ObjectId(chatId) },
        {
          $set: {
            lastMessage: responseText,
            lastMessageAt: new Date(),
            updatedAt: new Date(),
          },
          $inc: { [`unreadCount.${userId}`]: 1 },
        },
      );

      const totalTime = Date.now() - startTime;
      console.log(`✅ AI response completed in ${totalTime}ms total`);
    }
  } catch (error) {
    console.error("Error processing AI response:", error);
    if (error.response) {
      console.error("OpenAI API Error Data:", error.response.data);
    }
  }
}

export default router;
