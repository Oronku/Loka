import { connectToDatabase, getDatabase } from "./config/database.js";

async function cleanExpenses() {
  try {
    console.log("🗑️  Connecting to database...");
    await connectToDatabase();
    const db = getDatabase();

    const tripId = "trip-1763479137963";

    // Delete all expenses for this trip
    const result = await db.collection("expenses").deleteMany({ tripId });

    console.log(
      `✅ Deleted ${result.deletedCount} expenses for trip ${tripId}`
    );

    // Verify it's empty
    const remaining = await db
      .collection("expenses")
      .countDocuments({ tripId });
    console.log(`📊 Remaining expenses: ${remaining}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

cleanExpenses();
