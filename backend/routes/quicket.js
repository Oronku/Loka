import express from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyGoogleToken);

// Get all Quicket items with filters
router.get("/items", async (req, res) => {
  try {
    const db = getDb();
    const {
      type,
      minPrice,
      maxPrice,
      destination,
      startDate,
      endDate,
      canChangeName,
      mealPlan,
      sort = "newest",
      page = 1,
      limit = 20,
    } = req.query;

    const query = { isActive: true, isDeleted: { $ne: true } };

    // Apply filters
    if (type) query.type = type;
    if (destination) query.location = new RegExp(destination, "i");
    if (canChangeName === "true") query["metadata.canChangeName"] = true;
    if (mealPlan) query["metadata.mealPlan"] = mealPlan;

    // Price range
    if (minPrice || maxPrice) {
      query.priceSelling = {};
      if (minPrice) query.priceSelling.$gte = parseFloat(minPrice);
      if (maxPrice) query.priceSelling.$lte = parseFloat(maxPrice);
    }

    // Date range
    if (startDate || endDate) {
      query.startDatetime = {};
      if (startDate) query.startDatetime.$gte = new Date(startDate);
      if (endDate) query.startDatetime.$lte = new Date(endDate);
    }

    // Sort options
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      priceLow: { priceSelling: 1 },
      priceHigh: { priceSelling: -1 },
      popular: { likedCount: -1, viewsCount: -1 },
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const items = await db
      .collection("quicket_items")
      .find(query)
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection("quicket_items").countDocuments(query);

    // Anonymize seller info
    const itemsWithAnonymizedSellers = items.map((item) => ({
      ...item,
      seller: {
        id: item.sellerId,
        rating: item.sellerRating || 0,
        itemsSold: item.sellerItemsSold || 0,
      },
    }));

    res.json({
      items: itemsWithAnonymizedSellers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching Quicket items:", error);
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

// Get single Quicket item by ID
router.get("/items/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const item = await db
      .collection("quicket_items")
      .findOne({ _id: new ObjectId(id), isDeleted: { $ne: true } });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Increment views
    await db
      .collection("quicket_items")
      .updateOne({ _id: new ObjectId(id) }, { $inc: { viewsCount: 1 } });

    item.viewsCount = (item.viewsCount || 0) + 1;

    // Check if current user is the seller
    const isSeller = item.sellerId === req.user.id;

    // Anonymize seller unless current user is the seller
    const response = {
      ...item,
      seller: isSeller
        ? { id: item.sellerId, email: req.user.email }
        : {
            id: item.sellerId,
            rating: item.sellerRating || 0,
            itemsSold: item.sellerItemsSold || 0,
          },
      isSeller,
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching Quicket item:", error);
    res.status(500).json({ error: "Failed to fetch item" });
  }
});

// Create new Quicket item
router.post("/items", async (req, res) => {
  try {
    const db = getDb();
    const {
      tripId,
      type,
      title,
      description,
      priceOriginal,
      priceSelling,
      currency,
      startDatetime,
      endDatetime,
      location,
      metadata,
    } = req.body;

    // Validation
    if (!type || !title || !priceSelling || !currency) {
      return res.status(400).json({
        error: "Missing required fields: type, title, priceSelling, currency",
      });
    }

    const validTypes = ["flight", "hotel", "attraction", "event"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: "Invalid type. Must be flight, hotel, attraction, or event",
      });
    }

    const newItem = {
      sellerId: req.user.id,
      sellerEmail: req.user.email,
      tripId: tripId || null,
      type,
      title,
      description: description || "",
      priceOriginal: priceOriginal ? parseFloat(priceOriginal) : null,
      priceSelling: parseFloat(priceSelling),
      currency,
      startDatetime: startDatetime ? new Date(startDatetime) : null,
      endDatetime: endDatetime ? new Date(endDatetime) : null,
      location: location || "",
      metadata: metadata || {},
      isActive: true,
      isDeleted: false,
      likedCount: 0,
      viewsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("quicket_items").insertOne(newItem);

    res.status(201).json({
      message: "Item created successfully",
      itemId: result.insertedId,
      item: { ...newItem, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error creating Quicket item:", error);
    res.status(500).json({ error: "Failed to create item" });
  }
});

// Update Quicket item (seller only)
router.put("/items/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const item = await db
      .collection("quicket_items")
      .findOne({ _id: new ObjectId(id), isDeleted: { $ne: true } });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check if user is the seller
    if (item.sellerId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only the seller can update this item" });
    }

    const {
      title,
      description,
      priceOriginal,
      priceSelling,
      currency,
      startDatetime,
      endDatetime,
      location,
      metadata,
      isActive,
    } = req.body;

    const updates = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priceOriginal !== undefined)
      updates.priceOriginal = priceOriginal ? parseFloat(priceOriginal) : null;
    if (priceSelling !== undefined)
      updates.priceSelling = parseFloat(priceSelling);
    if (currency !== undefined) updates.currency = currency;
    if (startDatetime !== undefined)
      updates.startDatetime = startDatetime ? new Date(startDatetime) : null;
    if (endDatetime !== undefined)
      updates.endDatetime = endDatetime ? new Date(endDatetime) : null;
    if (location !== undefined) updates.location = location;
    if (metadata !== undefined) updates.metadata = metadata;
    if (isActive !== undefined) updates.isActive = isActive;

    await db
      .collection("quicket_items")
      .updateOne({ _id: new ObjectId(id) }, { $set: updates });

    res.json({ message: "Item updated successfully" });
  } catch (error) {
    console.error("Error updating Quicket item:", error);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// Soft delete Quicket item (seller only)
router.delete("/items/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const item = await db
      .collection("quicket_items")
      .findOne({ _id: new ObjectId(id), isDeleted: { $ne: true } });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check if user is the seller
    if (item.sellerId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only the seller can delete this item" });
    }

    await db
      .collection("quicket_items")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      );

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting Quicket item:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// Like or save item
router.post("/items/:id/like", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { likeType = "like" } = req.body; // 'like' or 'save'

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const item = await db
      .collection("quicket_items")
      .findOne({ _id: new ObjectId(id), isDeleted: { $ne: true } });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check if already liked
    const existingLike = await db.collection("quicket_likes").findOne({
      userId: req.user.id,
      itemId: id,
      likeType,
    });

    if (existingLike) {
      return res.status(400).json({ error: "Already liked this item" });
    }

    // Add like
    await db.collection("quicket_likes").insertOne({
      userId: req.user.id,
      itemId: id,
      likeType,
      createdAt: new Date(),
    });

    // Increment like count
    await db
      .collection("quicket_items")
      .updateOne({ _id: new ObjectId(id) }, { $inc: { likedCount: 1 } });

    res.json({ message: "Item liked successfully" });
  } catch (error) {
    console.error("Error liking item:", error);
    res.status(500).json({ error: "Failed to like item" });
  }
});

// Unlike item
router.post("/items/:id/dislike", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { likeType = "like" } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const result = await db.collection("quicket_likes").deleteOne({
      userId: req.user.id,
      itemId: id,
      likeType,
    });

    if (result.deletedCount === 0) {
      return res.status(400).json({ error: "Like not found" });
    }

    // Decrement like count
    await db
      .collection("quicket_items")
      .updateOne({ _id: new ObjectId(id) }, { $inc: { likedCount: -1 } });

    res.json({ message: "Item unliked successfully" });
  } catch (error) {
    console.error("Error unliking item:", error);
    res.status(500).json({ error: "Failed to unlike item" });
  }
});

// Express interest / Create or get chat
router.post("/items/:id/interest", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const item = await db
      .collection("quicket_items")
      .findOne({ _id: new ObjectId(id), isDeleted: { $ne: true } });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Cannot chat with yourself
    if (item.sellerId === req.user.id) {
      return res
        .status(400)
        .json({ error: "Cannot express interest in your own item" });
    }

    // Check if chat already exists
    const existingChat = await db.collection("quicket_chats").findOne({
      itemId: id,
      buyerId: req.user.id,
    });

    if (existingChat) {
      return res.json({
        message: "Chat already exists",
        chatId: existingChat._id,
        chat: existingChat,
      });
    }

    // Create new chat
    const newChat = {
      itemId: id,
      buyerId: req.user.id,
      buyerEmail: req.user.email,
      sellerId: item.sellerId,
      sellerEmail: item.sellerEmail,
      status: "pending", // pending, accepted, declined, completed
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("quicket_chats").insertOne(newChat);

    res.status(201).json({
      message: "Interest expressed successfully",
      chatId: result.insertedId,
      chat: { ...newChat, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error expressing interest:", error);
    res.status(500).json({ error: "Failed to express interest" });
  }
});

// Get chat messages
router.get("/chat/:chatId", async (req, res) => {
  try {
    const db = getDb();
    const { chatId } = req.params;

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const chat = await db
      .collection("quicket_chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Verify user is part of this chat
    console.log("Chat auth check:", {
      chatBuyerId: chat.buyerId,
      chatSellerId: chat.sellerId,
      userSub: req.user.id,
      match: chat.buyerId === req.user.id || chat.sellerId === req.user.id,
    });

    if (chat.buyerId !== req.user.id && chat.sellerId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this chat" });
    }

    const messages = await db
      .collection("quicket_messages")
      .find({ chatId })
      .sort({ timestamp: 1 })
      .toArray();

    res.json({ chat, messages });
  } catch (error) {
    console.error("Error fetching chat:", error);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

// Send message in chat
router.post("/chat/:chatId/message", async (req, res) => {
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
      .collection("quicket_chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Verify user is part of this chat
    console.log("Message auth check:", {
      chatBuyerId: chat.buyerId,
      chatSellerId: chat.sellerId,
      userSub: req.user.id,
      match: chat.buyerId === req.user.id || chat.sellerId === req.user.id,
    });

    if (chat.buyerId !== req.user.id && chat.sellerId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to send messages in this chat" });
    }

    const newMessage = {
      chatId: chatId, // Store as string for easy querying
      senderId: req.user.id,
      senderEmail: req.user.email,
      senderName: req.user.name,
      text,
      attachments: attachments || [],
      timestamp: new Date(),
    };

    const result = await db
      .collection("quicket_messages")
      .insertOne(newMessage);

    // Update chat timestamp
    await db
      .collection("quicket_chats")
      .updateOne(
        { _id: new ObjectId(chatId) },
        { $set: { updatedAt: new Date() } }
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

// Update chat status (accept/decline)
router.put("/chat/:chatId/status", async (req, res) => {
  try {
    const db = getDb();
    const { chatId } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const validStatuses = ["pending", "accepted", "declined", "completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const chat = await db
      .collection("quicket_chats")
      .findOne({ _id: new ObjectId(chatId) });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Only seller can accept/decline
    if (chat.sellerId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only the seller can update chat status" });
    }

    await db
      .collection("quicket_chats")
      .updateOne(
        { _id: new ObjectId(chatId) },
        { $set: { status, updatedAt: new Date() } }
      );

    res.json({ message: "Chat status updated successfully" });
  } catch (error) {
    console.error("Error updating chat status:", error);
    res.status(500).json({ error: "Failed to update chat status" });
  }
});

// Get user's saved searches
router.get("/saved-searches", async (req, res) => {
  try {
    const db = getDb();
    const searches = await db
      .collection("quicket_saved_searches")
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ searches });
  } catch (error) {
    console.error("Error fetching saved searches:", error);
    res.status(500).json({ error: "Failed to fetch saved searches" });
  }
});

// Save a search
router.post("/saved-searches", async (req, res) => {
  try {
    const db = getDb();
    const { filters, name } = req.body;

    if (!filters) {
      return res.status(400).json({ error: "Filters are required" });
    }

    const newSearch = {
      userId: req.user.id,
      name: name || "Untitled Search",
      filters,
      createdAt: new Date(),
    };

    const result = await db
      .collection("quicket_saved_searches")
      .insertOne(newSearch);

    res.status(201).json({
      message: "Search saved successfully",
      searchId: result.insertedId,
      search: { ...newSearch, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error saving search:", error);
    res.status(500).json({ error: "Failed to save search" });
  }
});

// Delete saved search
router.delete("/saved-searches/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid search ID" });
    }

    const result = await db.collection("quicket_saved_searches").deleteOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Search not found" });
    }

    res.json({ message: "Search deleted successfully" });
  } catch (error) {
    console.error("Error deleting search:", error);
    res.status(500).json({ error: "Failed to delete search" });
  }
});

// Get user's items (seller view)
router.get("/my-items", async (req, res) => {
  try {
    const db = getDb();
    const items = await db
      .collection("quicket_items")
      .find({ sellerId: req.user.id, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .toArray();

    // Get chat counts for each item
    const itemsWithChatCounts = await Promise.all(
      items.map(async (item) => {
        const chatCount = await db
          .collection("quicket_chats")
          .countDocuments({ itemId: item._id.toString() });
        return { ...item, chatCount };
      })
    );

    res.json({ items: itemsWithChatCounts });
  } catch (error) {
    console.error("Error fetching my items:", error);
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

// Get user's chats
router.get("/my-chats", async (req, res) => {
  try {
    const db = getDb();
    const chats = await db
      .collection("quicket_chats")
      .find({
        $or: [{ buyerId: req.user.id }, { sellerId: req.user.id }],
      })
      .sort({ updatedAt: -1 })
      .toArray();

    // Get item details and last message for each chat
    const chatsWithDetails = await Promise.all(
      chats.map(async (chat) => {
        const item = await db
          .collection("quicket_items")
          .findOne({ _id: new ObjectId(chat.itemId) });

        const lastMessage = await db
          .collection("quicket_messages")
          .findOne(
            { chatId: chat._id.toString() },
            { sort: { timestamp: -1 } }
          );

        return {
          ...chat,
          item,
          lastMessage,
          isSeller: chat.sellerId === req.user.id,
        };
      })
    );

    res.json({ chats: chatsWithDetails });
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// Get user's liked items
router.get("/liked-items", async (req, res) => {
  try {
    const db = getDb();
    const likes = await db
      .collection("quicket_likes")
      .find({ userId: req.user.id })
      .toArray();

    const itemIds = likes.map((like) => new ObjectId(like.itemId));

    const items = await db
      .collection("quicket_items")
      .find({ _id: { $in: itemIds }, isDeleted: { $ne: true } })
      .toArray();

    res.json({ items });
  } catch (error) {
    console.error("Error fetching liked items:", error);
    res.status(500).json({ error: "Failed to fetch liked items" });
  }
});

export default router;
