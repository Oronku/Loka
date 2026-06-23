import express from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import * as tripService from "../services/trip.service.js";

const router = express.Router();

const VALID_CATEGORIES = ['flight', 'hotel', 'food', 'activity', 'ride', 'shopping', 'other'];

router.use(verifyGoogleToken);

async function getTripWithAccess(tripId, userId, requireEdit = true) {
  const db = getDatabase();
  if (!db) throw new Error("Database not available");
  const trip = await tripService.findById(tripId);
  if (!trip) throw new Error("Trip not found or access denied");
  tripService.normalizeDocument(trip);
  const access = tripService.getAccess(trip, userId);
  if (requireEdit && !access.canEdit) throw new Error("Trip not found or access denied");
  if (!requireEdit && !access.canView) throw new Error("Trip not found or access denied");
  return trip;
}

function mapExpenseCategory(expense) {
  if (expense.linkedItemType === 'flight') return 'flight';
  if (expense.linkedItemType === 'hotel') return 'hotel';
  if (expense.category === 'hotel') return 'hotel';
  if (expense.category === 'food') return 'food';
  if (expense.category === 'activity') return 'activity';
  if (expense.category === 'ride') return 'ride';
  if (expense.category === 'shopping') return 'shopping';
  return 'other';
}

function buildCategoriesWithSpent(categories, expenses) {
  const result = {};
  for (const [name, budgetAmount] of Object.entries(categories)) {
    const spent = expenses
      .filter(exp => mapExpenseCategory(exp) === name)
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    result[name] = { budget: budgetAmount, spent: Math.round(spent) };
  }
  return result;
}

function validateCategories(categories) {
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
    return { error: 'Categories must be an object' };
  }
  const validated = {};
  for (const [name, amount] of Object.entries(categories)) {
    if (!VALID_CATEGORIES.includes(name)) return { error: 'Invalid category name', category: name };
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return { error: 'Invalid budgeted amount', category: name };
    }
    validated[name] = Math.round(amount);
  }
  return { validated };
}

// GET /api/budgets/:tripId - Get budget for a trip
router.get("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await getTripWithAccess(tripId, req.user.id, false);
    res.json(trip.budget || null);
  } catch (error) {
    console.error("Get budget error:", error);
    if (error.message === "Trip not found or access denied") {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to get budget" });
  }
});

// POST /api/budgets/:tripId - Create budget
router.post("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    const { totalBudget, currency, categories } = req.body;

    const trip = await getTripWithAccess(tripId, req.user.id);

    if (!totalBudget || typeof totalBudget !== 'number' || totalBudget < 0) {
      return res.status(400).json({ error: 'Invalid total budget' });
    }
    if (!currency || typeof currency !== 'string') {
      return res.status(400).json({ error: 'Invalid currency' });
    }

    const { error, validated } = validateCategories(categories);
    if (error) return res.status(400).json({ error });

    const budget = {
      totalBudget: Math.round(totalBudget),
      currency: currency.toUpperCase(),
      categories: validated,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const db = getDatabase();
    const q = ObjectId.isValid(tripId) ? { _id: new ObjectId(tripId) } : { id: tripId };
    const result = await db.collection("trips").updateOne(q, { $set: { budget } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.status(201).json({
      tripId,
      totalBudget: budget.totalBudget,
      currency: budget.currency,
      categories: buildCategoriesWithSpent(validated, trip.expenses || [])
    });
  } catch (error) {
    console.error('Error creating budget:', error);
    if (error.message === "Trip not found or access denied") {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// PUT /api/budgets/:tripId - Update budget
router.put("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    const { totalBudget, currency, categories } = req.body;

    const trip = await getTripWithAccess(tripId, req.user.id);

    if (!trip.budget) {
      return res.status(404).json({ error: 'Budget not found for this trip' });
    }

    const budget = { ...trip.budget, updatedAt: new Date() };

    if (totalBudget !== undefined) {
      if (typeof totalBudget !== 'number' || totalBudget < 0) {
        return res.status(400).json({ error: 'Invalid total budget' });
      }
      budget.totalBudget = Math.round(totalBudget);
    }

    if (currency !== undefined) {
      budget.currency = currency.toUpperCase();
    }

    if (categories !== undefined) {
      const { error, validated } = validateCategories(categories);
      if (error) return res.status(400).json({ error });
      budget.categories = validated;
    }

    const db = getDatabase();
    const q = ObjectId.isValid(tripId) ? { _id: new ObjectId(tripId) } : { id: tripId };
    const result = await db.collection("trips").updateOne(q, { $set: { budget } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({
      tripId,
      totalBudget: budget.totalBudget,
      currency: budget.currency,
      categories: buildCategoriesWithSpent(budget.categories, trip.expenses || [])
    });
  } catch (error) {
    console.error('Error updating budget:', error);
    if (error.message === "Trip not found or access denied") {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// DELETE /api/budgets/:tripId - Delete budget from trip
router.delete("/:tripId", async (req, res) => {
  try {
    const { tripId } = req.params;
    await getTripWithAccess(tripId, req.user.id);

    const db = getDatabase();
    const q = ObjectId.isValid(tripId) ? { _id: new ObjectId(tripId) } : { id: tripId };
    const result = await db.collection("trips").updateOne(q, { $unset: { budget: "" } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, message: "Budget deleted successfully" });
  } catch (error) {
    console.error('Error deleting budget:', error);
    if (error.message === "Trip not found or access denied") {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

export default router;
