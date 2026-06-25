import { MongoClient } from "mongodb";

let db = null;
let client = null;

export async function connectToDatabase() {
  if (db) {
    return db;
  }

  // Get environment variables at runtime (after dotenv has loaded them)
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const DB_NAME = process.env.DB_NAME || "meetloca";

  try {
    console.log("Connecting to MongoDB...");
    console.log(
      "Using URI:",
      MONGODB_URI.includes("@")
        ? MONGODB_URI.replace(/:[^:@]+@/, ":****@")
        : MONGODB_URI
    );

    // Try with minimal options to avoid SSL issues
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    console.log("✓ MongoDB client connected");

    db = client.db(DB_NAME);
    console.log(`✓ Using database: ${DB_NAME}`);

    // Create indexes for trips collection
    await db.collection("trips").createIndex({ id: 1 }, { unique: true, sparse: true });
    await db.collection("trips").createIndex({ createdAt: -1 });
    await db.collection("trips").createIndex({ startDate: 1 });

    // Create indexes for Quicket collections
    await db.collection("quicket_items").createIndex({ createdAt: -1 });
    await db.collection("quicket_items").createIndex({ sellerId: 1 });
    await db
      .collection("quicket_items")
      .createIndex({ type: 1, isActive: 1, isDeleted: 1 });
    await db
      .collection("quicket_items")
      .createIndex({ location: "text", title: "text", description: "text" });
    await db.collection("quicket_items").createIndex({ startDatetime: 1 });
    await db.collection("quicket_items").createIndex({ priceSelling: 1 });

    await db
      .collection("quicket_likes")
      .createIndex({ userId: 1, itemId: 1 }, { unique: true });
    await db.collection("quicket_chats").createIndex({ itemId: 1, buyerId: 1 });
    await db.collection("quicket_chats").createIndex({ sellerId: 1 });
    await db
      .collection("quicket_messages")
      .createIndex({ chatId: 1, timestamp: 1 });
    await db.collection("quicket_saved_searches").createIndex({ userId: 1 });

    // Create indexes for unified chat system
    await db.collection("chats").createIndex({ "participants.userId": 1 });
    await db.collection("chats").createIndex({ contextType: 1, contextId: 1 });
    await db.collection("chats").createIndex({ lastMessageAt: -1 });
    await db.collection("messages").createIndex({ chatId: 1, timestamp: -1 });
    await db.collection("messages").createIndex({ senderId: 1 });

    // Create indexes for the Loka AI assistant (memory + proposals)
    await db
      .collection("ai_user_profiles")
      .createIndex({ userId: 1 }, { unique: true });
    await db.collection("ai_proposals").createIndex({ userId: 1, createdAt: -1 });
    await db.collection("ai_proposals").createIndex({ status: 1 });
    await db
      .collection("ai_agent_runs")
      .createIndex({ userId: 1, key: 1 }, { unique: true });
    await db.collection("ai_proposals").createIndex({ tripId: 1, status: 1 });
    await db
      .collection("ai_notifications")
      .createIndex({ userId: 1, read: 1, createdAt: -1 });

    // Create indexes for friends system
    await db
      .collection("friendships")
      .createIndex({ senderId: 1, receiverId: 1 });
    await db.collection("friendships").createIndex({ status: 1 });
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ name: "text", email: "text" });

    console.log("✓ Database indexes created");

    return db;
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error.message);
    throw error;
  }
}

export function getDatabase() {
  // Return null instead of throwing error to allow graceful handling
  return db;
}

// Alias for getDatabase
export function getDb() {
  return db;
}

export async function closeDatabase() {
  if (client) {
    await client.close();
    db = null;
    client = null;
    console.log("✓ Disconnected from MongoDB");
  }
}
