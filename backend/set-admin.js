import "dotenv/config";
import { connectToDatabase, closeDatabase, getDb } from "./config/database.js";

async function setAdmin() {
  try {
    console.log("Connecting to MongoDB...");
    await connectToDatabase();
    const db = await getDb();

    const email = "oronku@gmail.com";

    // Update user to be admin
    const result = await db
      .collection("users")
      .updateOne({ email: email }, { $set: { isAdmin: true } });

    if (result.matchedCount === 0) {
      console.log(`❌ User with email ${email} not found`);
    } else if (result.modifiedCount === 0) {
      console.log(`ℹ️  User ${email} was already an admin`);
    } else {
      console.log(`✅ Successfully set ${email} as admin`);
    }

    // Verify the update
    const user = await db.collection("users").findOne({ email: email });
    if (user) {
      console.log(`\nUser details:`);
      console.log(`  Name: ${user.name}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Admin: ${user.isAdmin ? "Yes ✓" : "No ✗"}`);
    }
  } catch (error) {
    console.error("Error setting admin:", error);
  } finally {
    await closeDatabase();
    process.exit(0);
  }
}

setAdmin();
