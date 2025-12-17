import express from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyGoogleToken);

// Helper to get trip and verify ownership
async function getTripAndVerifyOwnership(tripId, userId) {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not available");
  }

  const tripsCollection = db.collection("trips");
  const query = {
    $or: [
      { userId: userId },
      { "sharedWith.userId": userId, "sharedWith.permission": "edit" },
    ],
  };

  if (ObjectId.isValid(tripId)) {
    query.$or.push({ _id: new ObjectId(tripId) });
  }
  query.$or.push({ id: tripId });

  const trip = await tripsCollection.findOne(query);
  if (!trip) {
    throw new Error("Trip not found or access denied");
  }

  return trip;
}

// GET /api/budgets/:tripId - Get budget for a trip
router.get("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    // Return budget or empty structure
    const budget = trip.budget || {
      totalBudget: 0,
      currency: "USD",
      categories: [],
    };

    res.json(budget);
  } catch (error) {
    console.error("Get budget error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to get budget" });
    }
  }
});

// POST /api/budgets/:tripId - Create or update budget for a trip
router.post("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;
    const budgetData = req.body;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    // Validate budget data
    if (
      typeof budgetData.totalBudget !== "number" ||
      budgetData.totalBudget < 0
    ) {
      return res.status(400).json({ error: "Invalid total budget" });
    }

    if (!Array.isArray(budgetData.categories)) {
      return res.status(400).json({ error: "Categories must be an array" });
    }

    // Validate categories
    for (const category of budgetData.categories) {
      if (!category.name || typeof category.name !== "string") {
        return res.status(400).json({ error: "Invalid category name" });
      }
      if (typeof category.budgeted !== "number" || category.budgeted < 0) {
        return res.status(400).json({ error: "Invalid budgeted amount" });
      }
      if (typeof category.spent !== "number" || category.spent < 0) {
        return res.status(400).json({ error: "Invalid spent amount" });
      }
    }

    // Prepare budget object
    const budget = {
      totalBudget: budgetData.totalBudget,
      currency: budgetData.currency || "USD",
      categories: budgetData.categories,
      updatedAt: new Date(),
    };

    // Update trip with budget
    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    const updateQuery = ObjectId.isValid(tripId)
      ? { _id: new ObjectId(tripId) }
      : { id: tripId };

    const result = await tripsCollection.updateOne(updateQuery, {
      $set: { budget: budget },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, budget });
  } catch (error) {
    console.error("Save budget error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to save budget" });
    }
  }
});

// PUT /api/budgets/:tripId - Update existing budget
router.put("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    if (!trip.budget) {
      return res.status(404).json({ error: "Budget not found for this trip" });
    }

    // Merge updates with existing budget
    const budget = {
      ...trip.budget,
      ...updates,
      updatedAt: new Date(),
    };

    // Update trip with budget
    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    const updateQuery = ObjectId.isValid(tripId)
      ? { _id: new ObjectId(tripId) }
      : { id: tripId };

    const result = await tripsCollection.updateOne(updateQuery, {
      $set: { budget: budget },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, budget });
  } catch (error) {
    console.error("Update budget error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to update budget" });
    }
  }
});

// DELETE /api/budgets/:tripId - Delete budget from trip
router.delete("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    // Remove budget from trip
    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    const updateQuery = ObjectId.isValid(tripId)
      ? { _id: new ObjectId(tripId) }
      : { id: tripId };

    const result = await tripsCollection.updateOne(updateQuery, {
      $unset: { budget: "" },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, message: "Budget deleted successfully" });
  } catch (error) {
    console.error("Delete budget error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to delete budget" });
    }
  }
});

// POST /api/budgets/:tripId/categories - Add a category
router.post("/:tripId/categories", async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;
    const category = req.body;

    if (!category.name || typeof category.name !== "string") {
      return res.status(400).json({ error: "Invalid category name" });
    }

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    if (!trip.budget) {
      return res.status(404).json({ error: "Budget not found for this trip" });
    }

    // Add category ID if not present
    const newCategory = {
      id: category.id || new ObjectId().toString(),
      name: category.name,
      budgeted: category.budgeted || 0,
      spent: category.spent || 0,
      icon: category.icon || null,
      color: category.color || null,
    };

    // Add category to budget
    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    const updateQuery = ObjectId.isValid(tripId)
      ? { _id: new ObjectId(tripId) }
      : { id: tripId };

    const result = await tripsCollection.updateOne(updateQuery, {
      $push: { "budget.categories": newCategory },
      $set: { "budget.updatedAt": new Date() },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, category: newCategory });
  } catch (error) {
    console.error("Add category error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to add category" });
    }
  }
});

// PUT /api/budgets/:tripId/categories/:categoryId - Update a category
router.put("/:tripId/categories/:categoryId", async (req, res) => {
  try {
    const { tripId, categoryId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    if (!trip.budget || !trip.budget.categories) {
      return res.status(404).json({ error: "Budget not found for this trip" });
    }

    // Find category index
    const categoryIndex = trip.budget.categories.findIndex(
      (cat) => cat.id === categoryId
    );

    if (categoryIndex === -1) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Update category
    const updatedCategory = {
      ...trip.budget.categories[categoryIndex],
      ...updates,
    };

    // Update in database
    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    const updateQuery = ObjectId.isValid(tripId)
      ? { _id: new ObjectId(tripId) }
      : { id: tripId };

    const result = await tripsCollection.updateOne(updateQuery, {
      $set: {
        [`budget.categories.${categoryIndex}`]: updatedCategory,
        "budget.updatedAt": new Date(),
      },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, category: updatedCategory });
  } catch (error) {
    console.error("Update category error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to update category" });
    }
  }
});

// DELETE /api/budgets/:tripId/categories/:categoryId - Delete a category
router.delete("/:tripId/categories/:categoryId", async (req, res) => {
  try {
    const { tripId, categoryId } = req.params;
    const userId = req.user.id;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    if (!trip.budget || !trip.budget.categories) {
      return res.status(404).json({ error: "Budget not found for this trip" });
    }

    // Remove category
    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    const updateQuery = ObjectId.isValid(tripId)
      ? { _id: new ObjectId(tripId) }
      : { id: tripId };

    const result = await tripsCollection.updateOne(updateQuery, {
      $pull: { "budget.categories": { id: categoryId } },
      $set: { "budget.updatedAt": new Date() },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    console.error("Delete category error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to delete category" });
    }
  }
});

// ============= BUDGET EXPENSE ENDPOINTS =============

// GET /api/budgets/:tripId/expenses - Get all budget expenses
router.get("/:tripId/expenses", async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    const trip = await getTripAndVerifyOwnership(tripId, userId);
    const expenses = trip.budget?.expenses || [];

    res.json(expenses);
  } catch (error) {
    console.error("Get expenses error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to get expenses" });
    }
  }
});

// POST /api/budgets/:tripId/expenses - Add expense
router.post("/:tripId/expenses", async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;
    const expense = req.body;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    // Validate expense
    if (!expense.category || typeof expense.category !== "string") {
      return res.status(400).json({ error: "Invalid category" });
    }
    if (typeof expense.amount !== "number" || expense.amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (!expense.description || typeof expense.description !== "string") {
      return res.status(400).json({ error: "Invalid description" });
    }
    if (!expense.date) {
      return res.status(400).json({ error: "Date is required" });
    }

    // Create expense with metadata
    const newExpense = {
      _id:
        expense._id ||
        `expense-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tripId,
      category: expense.category,
      amount: expense.amount,
      currency: expense.currency || "USD",
      description: expense.description,
      date: expense.date,
      notes: expense.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    // Initialize budget.expenses if it doesn't exist
    if (!trip.budget) {
      trip.budget = { expenses: [] };
    }
    if (!trip.budget.expenses) {
      trip.budget.expenses = [];
    }

    // Add expense
    const result = await tripsCollection.updateOne(
      { _id: trip._id },
      {
        $push: { "budget.expenses": newExpense },
        $set: { updatedAt: new Date().toISOString() },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json(newExpense);
  } catch (error) {
    console.error("Add expense error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to add expense" });
    }
  }
});

// PUT /api/budgets/:tripId/expenses/:expenseId - Update expense
router.put("/:tripId/expenses/:expenseId", async (req, res) => {
  try {
    const { tripId, expenseId } = req.params;
    const userId = req.user.id;
    const expense = req.body;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    // Find expense index
    const expenses = trip.budget?.expenses || [];
    const expenseIndex = expenses.findIndex((e) => e._id === expenseId);

    if (expenseIndex === -1) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Validate updates
    if (
      expense.amount !== undefined &&
      (typeof expense.amount !== "number" || expense.amount <= 0)
    ) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Update expense
    const updatedExpense = {
      ...expenses[expenseIndex],
      ...expense,
      _id: expenseId, // Keep original ID
      tripId, // Keep original tripId
      updatedAt: new Date().toISOString(),
    };

    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    // Update the specific expense in the array
    expenses[expenseIndex] = updatedExpense;

    const result = await tripsCollection.updateOne(
      { _id: trip._id },
      {
        $set: {
          "budget.expenses": expenses,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json(updatedExpense);
  } catch (error) {
    console.error("Update expense error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to update expense" });
    }
  }
});

// DELETE /api/budgets/:tripId/expenses/:expenseId - Delete expense
router.delete("/:tripId/expenses/:expenseId", async (req, res) => {
  try {
    const { tripId, expenseId } = req.params;
    const userId = req.user.id;

    const trip = await getTripAndVerifyOwnership(tripId, userId);

    // Find expense
    const expenses = trip.budget?.expenses || [];
    const expenseExists = expenses.some((e) => e._id === expenseId);

    if (!expenseExists) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const db = getDatabase();
    const tripsCollection = db.collection("trips");

    // Remove expense from array
    const result = await tripsCollection.updateOne(
      { _id: trip._id },
      {
        $pull: { "budget.expenses": { _id: expenseId } },
        $set: { updatedAt: new Date().toISOString() },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Delete expense error:", error);
    if (error.message === "Trip not found or access denied") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  }
});

export default router;
