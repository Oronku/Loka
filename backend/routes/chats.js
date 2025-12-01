import express from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyGoogleToken);

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
      (p) => p.userId === req.user.id
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
      if (!contextId || !ObjectId.isValid(contextId)) {
        return res.status(400).json({ error: "Valid trip ID required" });
      }

      // Verify trip exists and user is a member
      const trip = await db
        .collection("trips")
        .findOne({ _id: new ObjectId(contextId) });

      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      // Verify all participants are trip members
      const tripMemberIds = [trip.userId, ...(trip.sharedWith || [])];
      const invalidParticipants = participants.filter(
        (p) => !tripMemberIds.includes(p.userId)
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
      (p) => p.userId === req.user.id
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
    const { chatId } = req.params;
    const { limit = 50, before } = req.query;

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
      (p) => p.userId === req.user.id
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
    const { chatId } = req.params;
    const { text, attachments } = req.body;

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
      return res
        .status(403)
        .json({
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
      }
    );

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
    const { chatId } = req.params;
    const { messageIds } = req.body;

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
      (p) => p.userId === req.user.id
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
      }
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
      }
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
      (p) => p.userId === userId
    );
    if (existingParticipant) {
      return res.status(400).json({ error: "User is already a participant" });
    }

    // Context-specific validation
    if (chat.contextType === "trip") {
      // Verify user is a trip member
      const trip = await db
        .collection("trips")
        .findOne({ _id: new ObjectId(chat.contextId) });

      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      const tripMemberIds = [trip.userId, ...(trip.sharedWith || [])];
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
      }
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
      }
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
      }
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
        }
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
        }
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

export default router;
