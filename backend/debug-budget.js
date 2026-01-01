import { connectToDatabase, getDatabase } from "./config/database.js";

async function checkBudget() {
  try {
    await connectToDatabase();
    const db = getDatabase();

    const trip = await db
      .collection("trips")
      .findOne({ id: "trip-1763479137963" });

    console.log("🗄️ trip.budget keys:", Object.keys(trip?.budget || {}));
    console.log("🗄️ trip.budget.totalBudget:", trip?.budget?.totalBudget);
    console.log("🗄️ trip.budget.currency:", trip?.budget?.currency);
    console.log("🗄️ trip.budget.updatedAt:", trip?.budget?.updatedAt);
    console.log(
      "🗄️ trip.budget.expenses length:",
      trip?.budget?.expenses?.length || 0
    );

    if (trip?.budget?.totalBudget) {
      console.log("✅ totalBudget קיים במסד!");
    } else {
      console.log("❌ totalBudget לא קיים במסד!");
      console.log("📊 מבנה budget מלא:", JSON.stringify(trip?.budget, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ שגיאה:", error);
    process.exit(1);
  }
}

checkBudget();
