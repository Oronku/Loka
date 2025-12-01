import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "meetloca";

async function cleanup() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB");

    const db = client.db(dbName);

    // Delete friendships where receiverId or senderId doesn't start with 'user-'
    const result = await db.collection("friendships").deleteMany({
      $or: [
        { receiverId: { $not: { $regex: /^user-/ } } },
        { senderId: { $not: { $regex: /^user-/ } } },
      ],
    });

    console.log(`✓ Deleted ${result.deletedCount} invalid friendships`);

    // Show remaining friendships
    const remaining = await db.collection("friendships").find({}).toArray();
    console.log(`\n✓ Remaining friendships: ${remaining.length}`);
    remaining.forEach((f) => {
      console.log(`  - From ${f.senderId} to ${f.receiverId} (${f.status})`);
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
    console.log("\n✓ Disconnected from MongoDB");
  }
}

cleanup();
