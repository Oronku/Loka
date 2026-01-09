import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

async function setAgencyAdmin() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in environment variables");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB");

    const db = client.db("meetloca");
    const users = db.collection("users");

    // Get email from command line or use default
    const email = process.argv[2] || "oronku@gmail.com";

    console.log(`\n🔍 Looking for user: ${email}`);

    const user = await users.findOne({ email });

    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      console.log("\nUsage: node set-agency-admin.js <email>");
      process.exit(1);
    }

    console.log("✓ Found user:", user.name);
    console.log("  Current status:");
    console.log("    - Is Admin:", user.isAdmin || false);
    console.log("    - Is Agent:", user.isAgent || false);
    console.log("    - Is Agency Admin:", user.isAgencyAdmin || false);
    console.log("    - Agency Name:", user.agencyName || "N/A");

    // Update user to be agency admin
    const result = await users.updateOne(
      { email },
      {
        $set: {
          isAgencyAdmin: true,
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log("\n✅ User updated successfully!");
      console.log("  New status:");
      console.log("    - Is Admin:", user.isAdmin || false);
      console.log("    - Is Agent:", user.isAgent || false);
      console.log("    - Is Agency Admin: true ⭐");
      console.log("    - Agency Name:", user.agencyName || "N/A");
      console.log("\n✨ User can now manage agents in their agency at /agency");
    } else {
      console.log("ℹ️  User was already an agency admin");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\n✓ Disconnected from MongoDB");
  }
}

setAgencyAdmin();
