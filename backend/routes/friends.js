import express from "express";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import { ObjectId } from "mongodb";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyGoogleToken);

// Get all friends (accepted friend requests)
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    // Find all accepted friendships where user is either sender or receiver
    const friendships = await db
      .collection("friendships")
      .find({
        $or: [
          { senderId: userId, status: "accepted" },
          { receiverId: userId, status: "accepted" },
        ],
      })
      .toArray();

    // Get friend user IDs
    const friendIds = friendships.map((f) =>
      f.senderId === userId ? f.receiverId : f.senderId
    );

    // Get friend details (friendIds are custom string IDs like 'user-XXXX')
    const friends = await db
      .collection("users")
      .find({
        id: { $in: friendIds },
      })
      .toArray();

    // Add online status (placeholder - will implement with WebSocket later)
    const friendsWithStatus = friends.map((friend) => ({
      _id: friend.id || friend._id,
      name: friend.name,
      email: friend.email,
      picture: friend.picture,
      isOnline: false, // TODO: Implement real-time status
      lastSeen: friend.lastSeen || null,
    }));

    res.json(friendsWithStatus);
  } catch (error) {
    console.error("Error fetching friends:", error);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// Search for users (potential friends)
router.get("/search", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json([]);
    }

    // Search by name or email
    // userId is the custom string ID from JWT (e.g., 'user-1762803473104')
    const users = await db
      .collection("users")
      .find({
        id: { $ne: userId }, // Exclude self using custom id field
        $or: [
          { name: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } },
        ],
      })
      .limit(20)
      .toArray();

    // Get existing friendships to show status
    const friendships = await db
      .collection("friendships")
      .find({
        $or: [{ senderId: userId }, { receiverId: userId }],
      })
      .toArray();

    const friendshipMap = {};
    friendships.forEach((f) => {
      const otherId = f.senderId === userId ? f.receiverId : f.senderId;
      friendshipMap[otherId] = f.status;
    });

    const usersWithStatus = users.map((user) => ({
      _id: user.id || user._id, // Use custom id field, fallback to _id
      name: user.name,
      email: user.email,
      picture: user.picture,
      friendshipStatus: friendshipMap[user.id || user._id] || "none",
    }));

    res.json(usersWithStatus);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

// Send friend request
router.post("/request", async (req, res) => {
  try {
    const db = getDb();
    const senderId = req.user.id;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: "Receiver ID is required" });
    }

    if (senderId === receiverId) {
      return res
        .status(400)
        .json({ error: "Cannot send friend request to yourself" });
    }

    // Check if friendship already exists
    const existing = await db.collection("friendships").findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    });

    if (existing) {
      return res.status(400).json({
        error: "Friend request already exists",
        status: existing.status,
      });
    }

    // Create friend request
    const friendship = {
      senderId,
      receiverId,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("friendships").insertOne(friendship);

    // TODO: Send notification to receiver

    res.status(201).json({
      message: "Friend request sent",
      friendshipId: result.insertedId,
    });
  } catch (error) {
    console.error("Error sending friend request:", error);
    res.status(500).json({ error: "Failed to send friend request" });
  }
});

// Get pending friend requests (received)
router.get("/requests", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const requests = await db
      .collection("friendships")
      .find({
        receiverId: userId,
        status: "pending",
      })
      .toArray();

    // Get sender details (senderIds are custom string IDs like 'user-XXXX')
    const senderIds = requests.map((r) => r.senderId);

    const senders = await db
      .collection("users")
      .find({
        id: { $in: senderIds },
      })
      .toArray();

    const senderMap = {};
    senders.forEach((s) => {
      // Use custom id field for map key
      senderMap[s.id || s._id] = s;
    });

    const requestsWithSenders = requests.map((r) => ({
      _id: r._id,
      sender: senderMap[r.senderId],
      createdAt: r.createdAt,
    }));

    res.json(requestsWithSenders);
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    res.status(500).json({ error: "Failed to fetch friend requests" });
  }
});

// Accept friend request
router.post("/accept/:requestId", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { requestId } = req.params;

    const friendship = await db.collection("friendships").findOne({
      _id: new ObjectId(requestId),
      receiverId: userId,
      status: "pending",
    });

    if (!friendship) {
      return res.status(404).json({ error: "Friend request not found" });
    }

    await db.collection("friendships").updateOne(
      { _id: new ObjectId(requestId) },
      {
        $set: {
          status: "accepted",
          acceptedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // TODO: Send notification to sender

    res.json({ message: "Friend request accepted" });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    res.status(500).json({ error: "Failed to accept friend request" });
  }
});

// Reject friend request
router.post("/reject/:requestId", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { requestId } = req.params;

    const friendship = await db.collection("friendships").findOne({
      _id: new ObjectId(requestId),
      receiverId: userId,
      status: "pending",
    });

    if (!friendship) {
      return res.status(404).json({ error: "Friend request not found" });
    }

    await db.collection("friendships").updateOne(
      { _id: new ObjectId(requestId) },
      {
        $set: {
          status: "rejected",
          rejectedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    res.json({ message: "Friend request rejected" });
  } catch (error) {
    console.error("Error rejecting friend request:", error);
    res.status(500).json({ error: "Failed to reject friend request" });
  }
});

// Remove friend
router.delete("/:friendId", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { friendId } = req.params;

    const result = await db.collection("friendships").deleteOne({
      $or: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
      status: "accepted",
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Friendship not found" });
    }

    res.json({ message: "Friend removed successfully" });
  } catch (error) {
    console.error("Error removing friend:", error);
    res.status(500).json({ error: "Failed to remove friend" });
  }
});

// Clean up old invalid friendships (development only)
router.delete("/cleanup-invalid", async (req, res) => {
  try {
    const db = getDb();

    // Delete friendships where receiverId doesn't start with 'user-'
    const result = await db.collection("friendships").deleteMany({
      $or: [
        { receiverId: { $not: { $regex: /^user-/ } } },
        { senderId: { $not: { $regex: /^user-/ } } },
      ],
    });

    res.json({
      message: "Invalid friendships cleaned up",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error cleaning up friendships:", error);
    res.status(500).json({ error: "Failed to cleanup friendships" });
  }
});

// Update user online status (called by frontend on activity)
router.post("/status", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    // userId is the custom string ID from JWT (e.g., 'user-1762803473104')
    await db.collection("users").updateOne(
      { id: userId },
      {
        $set: {
          lastSeen: new Date(),
          isOnline: true,
        },
      }
    );

    res.json({ message: "Status updated" });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

export default router;
