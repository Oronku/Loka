import { MongoClient } from "mongodb";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = "meetloca";

async function setAgent() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB");

    const db = client.db(DATABASE_NAME);
    const users = db.collection("users");

    // Update user to be an agent
    const email = "oronku@gmail.com"; // Change this to desired email

    const result = await users.updateOne(
      { email: email },
      {
        $set: {
          isAgent: true,
          agencyName: "Oron Travel Agency",
          agencyLicense: "IL-2026-001",
          agencyDescription: "סוכנות נסיעות מובילה המתמחה בטיולים מאורגנים",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      console.log("❌ User not found with email:", email);
      return;
    }

    console.log("✅ Successfully set", email, "as travel agent");

    // Fetch and display the updated user
    const user = await users.findOne({ email: email });
    console.log("\nUser details:");
    console.log("  Name:", user.name);
    console.log("  Email:", user.email);
    console.log("  Agent:", user.isAgent ? "Yes ✓" : "No");
    console.log("  Agency Name:", user.agencyName || "N/A");
    console.log("  License:", user.agencyLicense || "N/A");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
    console.log("\n✓ Disconnected from MongoDB");
  }
}

setAgent();
