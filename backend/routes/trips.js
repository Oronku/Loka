import express from "express";
import { getDatabase } from "../config/database.js";
import { memoryStore } from "../config/memoryStore.js";
import { verifyGoogleToken } from "../middleware/auth.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyGoogleToken);

// Get trips collection (MongoDB or fallback to memory)
function getTripsCollection() {
  const db = getDatabase();
  return db ? db.collection("trips") : null;
}

// Helpers
async function getTripOr404(req, res) {
  const collection = getTripsCollection();

  let trip;
  if (collection) {
    // Use MongoDB - filter by userId
    trip = await collection.findOne({ id: req.params.id, userId: req.user.id });
  } else {
    // Fallback to memory store
    trip = memoryStore.trips.findById(req.params.id);
    if (trip && trip.userId !== req.user.id) {
      trip = null;
    }
  }

  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return null;
  }
  // Ensure arrays exist
  trip.flights = Array.isArray(trip.flights) ? trip.flights : [];
  trip.hotels = Array.isArray(trip.hotels) ? trip.hotels : [];
  trip.rides = Array.isArray(trip.rides) ? trip.rides : [];
  trip.attractions = Array.isArray(trip.attractions) ? trip.attractions : [];
  return trip;
}

// Get all trips for the authenticated user (owned + shared)
router.get("/", async (req, res) => {
  try {
    const collection = getTripsCollection();

    let trips;
    if (collection) {
      // Use MongoDB - get owned trips and trips shared with user
      const ownedTrips = await collection
        .find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      const sharedTrips = await collection
        .find({
          "sharedWith.userId": req.user.id,
        })
        .sort({ createdAt: -1 })
        .toArray();

      // Mark shared trips with isShared flag
      sharedTrips.forEach((trip) => {
        trip.isShared = true;
        trip.isOwner = false;
      });

      // Mark owned trips
      ownedTrips.forEach((trip) => {
        trip.isShared = false;
        trip.isOwner = true;
      });

      trips = [...ownedTrips, ...sharedTrips];
    } else {
      // Fallback to memory store
      trips = memoryStore.trips
        .find()
        .filter(
          (t) =>
            t.userId === req.user.id ||
            (t.sharedWith && t.sharedWith.some((s) => s.userId === req.user.id))
        );
      trips.forEach((trip) => {
        trip.isOwner = trip.userId === req.user.id;
        trip.isShared = !trip.isOwner;
      });
    }

    res.json(trips);
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

// Get a single trip by ID
router.get("/:id", async (req, res) => {
  try {
    const collection = getTripsCollection();

    let trip;
    if (collection) {
      // Use MongoDB
      trip = await collection.findOne({ id: req.params.id });
    } else {
      // Fallback to memory store
      trip = memoryStore.trips.findById(req.params.id);
    }

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Check if user has access (owner or shared with)
    const isOwner = trip.userId === req.user.id;
    const isShared =
      trip.sharedWith && trip.sharedWith.some((s) => s.userId === req.user.id);

    if (!isOwner && !isShared) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Add flags for frontend
    trip.isOwner = isOwner;
    trip.isShared = !isOwner;

    res.json(trip);
  } catch (error) {
    console.error("Error fetching trip:", error);
    res.status(500).json({ error: "Failed to fetch trip" });
  }
});

// Create a new trip
router.post("/", async (req, res) => {
  try {
    const tripData = req.body;
    const collection = getTripsCollection();

    let createdTrip;
    if (collection) {
      // Use MongoDB
      const newTrip = {
        ...tripData,
        id: tripData.id || `trip-${Date.now()}`,
        userId: req.user.id,
        userEmail: req.user.email,
        flights: tripData.flights || [],
        hotels: tripData.hotels || [],
        rides: tripData.rides || [],
        attractions: tripData.attractions || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await collection.insertOne(newTrip);
      createdTrip = newTrip;
      console.log(
        "✓ Trip saved to MongoDB:",
        createdTrip.id,
        "-",
        createdTrip.name,
        "for user:",
        req.user.email
      );
    } else {
      // Fallback to memory store
      createdTrip = memoryStore.trips.create({
        ...tripData,
        userId: req.user.id,
        userEmail: req.user.email,
      });
      console.log(
        "✓ Trip saved to memory:",
        createdTrip.id,
        "-",
        createdTrip.name,
        "for user:",
        req.user.email
      );
    }

    res.status(201).json(createdTrip);
  } catch (error) {
    console.error("Error creating trip:", error);
    res
      .status(500)
      .json({ error: "Failed to create trip", message: error.message });
  }
});

// Update a trip
router.put("/:id", async (req, res) => {
  try {
    const collection = getTripsCollection();

    // Check if trip exists and user is owner
    let existingTrip;
    if (collection) {
      existingTrip = await collection.findOne({ id: req.params.id });
    } else {
      existingTrip = memoryStore.trips.findById(req.params.id);
    }

    if (!existingTrip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    if (existingTrip.userId !== req.user.id) {
      return res.status(403).json({ error: "Only trip owner can edit" });
    }

    let updated;
    if (collection) {
      // Use MongoDB
      const updateData = {
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      delete updateData._id; // Remove MongoDB _id if present

      const result = await collection.findOneAndUpdate(
        { id: req.params.id },
        { $set: updateData },
        { returnDocument: "after" }
      );

      if (!result) {
        return res.status(404).json({ error: "Trip not found" });
      }
      updated = result;
      console.log("✓ Trip updated in MongoDB:", req.params.id);
    } else {
      // Fallback to memory store
      updated = memoryStore.trips.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Trip not found" });
      }
      console.log("✓ Trip updated in memory:", req.params.id);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating trip:", error);
    res
      .status(500)
      .json({ error: "Failed to update trip", message: error.message });
  }
});

// Update user's personal checklist (available to both owner and shared users)
router.put("/:id/checklist", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const { checklist } = req.body;

    // Check if trip exists and user has access (owner or shared user)
    let existingTrip;
    if (collection) {
      existingTrip = await collection.findOne({ id: req.params.id });
    } else {
      existingTrip = memoryStore.trips.findById(req.params.id);
    }

    if (!existingTrip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Check if user is owner or has shared access
    const isOwner = existingTrip.userId === req.user.id;
    const isSharedUser = existingTrip.sharedWith?.some(
      (s) => s.userId === req.user.id
    );

    if (!isOwner && !isSharedUser) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get existing userChecklists array or initialize it
    const userChecklists = existingTrip.userChecklists || [];

    // Find current user's checklist index
    const userChecklistIndex = userChecklists.findIndex(
      (uc) => uc.userId === req.user.id
    );

    // Update or add user's checklist
    let updatedUserChecklists;
    if (userChecklistIndex >= 0) {
      updatedUserChecklists = [...userChecklists];
      updatedUserChecklists[userChecklistIndex] = {
        userId: req.user.id,
        checklist: checklist,
      };
    } else {
      updatedUserChecklists = [
        ...userChecklists,
        { userId: req.user.id, checklist: checklist },
      ];
    }

    let updated;
    if (collection) {
      // Use MongoDB
      const result = await collection.findOneAndUpdate(
        { id: req.params.id },
        {
          $set: {
            userChecklists: updatedUserChecklists,
            updatedAt: new Date().toISOString(),
          },
        },
        { returnDocument: "after" }
      );

      if (!result) {
        return res.status(404).json({ error: "Trip not found" });
      }
      updated = result;
      console.log(
        "✓ User checklist updated in MongoDB:",
        req.params.id,
        "for user:",
        req.user.id
      );
    } else {
      // Fallback to memory store
      existingTrip.userChecklists = updatedUserChecklists;
      existingTrip.updatedAt = new Date().toISOString();
      updated = existingTrip;
      console.log(
        "✓ User checklist updated in memory:",
        req.params.id,
        "for user:",
        req.user.id
      );
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating user checklist:", error);
    res
      .status(500)
      .json({ error: "Failed to update checklist", message: error.message });
  }
});

// Delete a trip
router.delete("/:id", async (req, res) => {
  try {
    const collection = getTripsCollection();

    // Check if trip exists and user is owner
    let existingTrip;
    if (collection) {
      existingTrip = await collection.findOne({ id: req.params.id });
    } else {
      existingTrip = memoryStore.trips.findById(req.params.id);
    }

    if (!existingTrip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    if (existingTrip.userId !== req.user.id) {
      return res.status(403).json({ error: "Only trip owner can delete" });
    }

    let deleted;
    if (collection) {
      // Use MongoDB
      const result = await collection.deleteOne({ id: req.params.id });
      deleted = result.deletedCount > 0;
      if (deleted) {
        console.log("✓ Trip deleted from MongoDB:", req.params.id);
      }
    } else {
      // Fallback to memory store
      deleted = memoryStore.trips.delete(req.params.id);
      if (deleted) {
        console.log("✓ Trip deleted from memory:", req.params.id);
      }
    }

    if (!deleted) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ success: true, message: "Trip deleted successfully" });
  } catch (error) {
    console.error("Error deleting trip:", error);
    res
      .status(500)
      .json({ error: "Failed to delete trip", message: error.message });
  }
});

// Share trip with users by email
router.post("/:id/share", async (req, res) => {
  try {
    const { emails, expensePermissions = {} } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: "emails array is required" });
    }

    const collection = getTripsCollection();
    const trip = await getTripOr404(req, res);
    if (!trip) return;

    // Only owner can share
    if (trip.userId !== req.user.id) {
      return res.status(403).json({ error: "Only trip owner can share" });
    }

    // Get user collection to validate emails
    const db = collection ? collection.s.db : null;
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    const usersCollection = db.collection("users");
    const users = await usersCollection
      .find({ email: { $in: emails } })
      .toArray();

    if (users.length === 0) {
      return res
        .status(404)
        .json({ error: "No registered users found with provided emails" });
    }

    // Initialize sharedWith if not exists
    if (!trip.sharedWith) {
      trip.sharedWith = [];
    }

    // Add new users (avoid duplicates)
    const newShares = users
      .filter(
        (user) =>
          !trip.sharedWith.some((s) => s.userId === user.id) &&
          user.id !== trip.userId
      )
      .map((user) => ({
        userId: user.id, // Use custom id field, not MongoDB _id
        email: user.email,
        name: user.name,
        sharedAt: new Date().toISOString(),
        expensePermission: expensePermissions[user.email] || "edit", // Default to edit if not specified
      }));

    if (newShares.length === 0) {
      return res
        .status(400)
        .json({ error: "All users already have access or are trip owner" });
    }

    trip.sharedWith.push(...newShares);

    // Update in database
    await collection.updateOne(
      { id: trip.id },
      {
        $set: {
          sharedWith: trip.sharedWith,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    const updatedTrip = await collection.findOne({ id: trip.id });

    res.json({
      message: `Trip shared with ${newShares.length} user(s)`,
      sharedWith: updatedTrip.sharedWith,
    });
  } catch (error) {
    console.error("Error sharing trip:", error);
    res
      .status(500)
      .json({ error: "Failed to share trip", message: error.message });
  }
});

// Revoke trip access from a user
router.delete("/:id/share/:userId", async (req, res) => {
  try {
    const { id, userId } = req.params;

    const collection = getTripsCollection();
    if (!collection) {
      return res.status(500).json({ error: "Database not available" });
    }

    const trip = await collection.findOne({ id });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Only owner can revoke access
    if (trip.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only trip owner can revoke access" });
    }

    if (!trip.sharedWith) {
      trip.sharedWith = [];
    }

    const initialLength = trip.sharedWith.length;
    trip.sharedWith = trip.sharedWith.filter((s) => s.userId !== userId);

    if (trip.sharedWith.length === initialLength) {
      return res.status(404).json({ error: "User not found in shared list" });
    }

    // Update in database
    await collection.updateOne(
      { id: trip.id },
      {
        $set: {
          sharedWith: trip.sharedWith,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    res.json({
      message: "Access revoked successfully",
      sharedWith: trip.sharedWith,
    });
  } catch (error) {
    console.error("Error revoking access:", error);
    res
      .status(500)
      .json({ error: "Failed to revoke access", message: error.message });
  }
});

export default router;

/**
 * Trip Sub-resources API
 * --------------------------------------
 * POST /api/trips/:id/flights       -> add a flight segment
 * POST /api/trips/:id/hotels        -> add a hotel booking
 * POST /api/trips/:id/rides         -> add a ride leg
 * POST /api/trips/:id/attractions   -> add an attraction visit
 * DELETE /api/trips/:id/:type/:idx  -> remove by index (type in flights|hotels|rides|attractions)
 */

router.post("/:id/flights", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const flight = req.body || {};
  // minimal validation
  if (
    !flight.flightNumber ||
    !flight.departureDateTime ||
    !flight.arrivalDateTime
  ) {
    return res.status(400).json({
      error: "flightNumber, departureDateTime and arrivalDateTime are required",
    });
  }
  trip.flights.push(flight);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      { id: trip.id },
      { $set: { flights: trip.flights, updatedAt: new Date().toISOString() } }
    );
    updated = await collection.findOne({ id: trip.id });
  } else {
    updated = memoryStore.trips.update(trip.id, { flights: trip.flights });
  }

  res.status(201).json(updated);
});

router.post("/:id/hotels", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const hotel = req.body || {};
  if (!hotel.name || !hotel.checkIn || !hotel.checkOut) {
    return res
      .status(400)
      .json({ error: "name, checkIn and checkOut are required" });
  }
  trip.hotels.push(hotel);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      { id: trip.id },
      { $set: { hotels: trip.hotels, updatedAt: new Date().toISOString() } }
    );
    updated = await collection.findOne({ id: trip.id });
  } else {
    updated = memoryStore.trips.update(trip.id, { hotels: trip.hotels });
  }

  res.status(201).json(updated);
});

router.post("/:id/rides", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const ride = req.body || {};
  if (!ride.pickup || !ride.dropoff) {
    return res.status(400).json({ error: "pickup and dropoff are required" });
  }
  trip.rides.push(ride);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      { id: trip.id },
      { $set: { rides: trip.rides, updatedAt: new Date().toISOString() } }
    );
    updated = await collection.findOne({ id: trip.id });
  } else {
    updated = memoryStore.trips.update(trip.id, { rides: trip.rides });
  }

  res.status(201).json(updated);
});

router.post("/:id/attractions", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const attraction = req.body || {};
  if (!attraction.name || !attraction.scheduledDate) {
    return res
      .status(400)
      .json({ error: "name and scheduledDate are required" });
  }
  trip.attractions.push(attraction);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      { id: trip.id },
      {
        $set: {
          attractions: trip.attractions,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    updated = await collection.findOne({ id: trip.id });
  } else {
    updated = memoryStore.trips.update(trip.id, {
      attractions: trip.attractions,
    });
  }

  res.status(201).json(updated);
});

router.delete("/:id/:type/:idx", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const { type, idx } = req.params;
  const valid = ["flights", "hotels", "rides", "attractions"];
  if (!valid.includes(type))
    return res.status(400).json({ error: "Invalid type" });
  const i = parseInt(idx, 10);
  if (Number.isNaN(i) || i < 0 || i >= trip[type].length)
    return res.status(400).json({ error: "Invalid index" });
  trip[type].splice(i, 1);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      { id: trip.id },
      { $set: { [type]: trip[type], updatedAt: new Date().toISOString() } }
    );
    updated = await collection.findOne({ id: trip.id });
  } else {
    updated = memoryStore.trips.update(trip.id, { [type]: trip[type] });
  }

  res.json(updated);
});

// ============= EXPENSE MANAGEMENT ENDPOINTS =============

// Add expense to trip
router.post("/:id/expenses", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const { expense } = req.body;

    // Check if trip exists and user has access
    let trip;
    if (collection) {
      trip = await collection.findOne({ id: req.params.id });
    } else {
      trip = memoryStore.trips.findById(req.params.id);
    }

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Check permission
    const isOwner = trip.userId === req.user.id;
    const sharedUser = trip.sharedWith?.find((s) => s.userId === req.user.id);
    const permission = sharedUser?.expensePermission || "disable";

    if (!isOwner && permission !== "edit") {
      return res.status(403).json({ error: "No permission to add expenses" });
    }

    // Add expense with metadata
    const newExpense = {
      ...expense,
      id: `expense-${Date.now()}`,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };

    const expenses = trip.expenses || [];
    expenses.push(newExpense);

    let updated;
    if (collection) {
      await collection.updateOne(
        { id: req.params.id },
        { $set: { expenses, updatedAt: new Date().toISOString() } }
      );
      updated = await collection.findOne({ id: req.params.id });
    } else {
      updated = memoryStore.trips.update(req.params.id, { expenses });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

// Update expense
router.put("/:id/expenses/:expenseId", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const { expense } = req.body;

    let trip;
    if (collection) {
      trip = await collection.findOne({ id: req.params.id });
    } else {
      trip = memoryStore.trips.findById(req.params.id);
    }

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Find the expense
    const expenses = trip.expenses || [];
    const expenseIndex = expenses.findIndex(
      (e) => e.id === req.params.expenseId
    );

    if (expenseIndex === -1) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Check permission: owner or creator of expense
    const isOwner = trip.userId === req.user.id;
    const isCreator = expenses[expenseIndex].createdBy === req.user.id;

    if (!isOwner && !isCreator) {
      return res
        .status(403)
        .json({ error: "No permission to edit this expense" });
    }

    // Update expense
    expenses[expenseIndex] = {
      ...expenses[expenseIndex],
      ...expense,
      id: req.params.expenseId, // Keep original ID
    };

    let updated;
    if (collection) {
      await collection.updateOne(
        { id: req.params.id },
        { $set: { expenses, updatedAt: new Date().toISOString() } }
      );
      updated = await collection.findOne({ id: req.params.id });
    } else {
      updated = memoryStore.trips.update(req.params.id, { expenses });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// Delete expense
router.delete("/:id/expenses/:expenseId", async (req, res) => {
  try {
    console.log("DELETE expense request:", {
      tripId: req.params.id,
      expenseId: req.params.expenseId,
      userId: req.user?.id,
      hasUser: !!req.user,
    });

    if (!req.user) {
      console.log("No user found in request");
      return res.status(401).json({ error: "Authentication required" });
    }

    const collection = getTripsCollection();

    let trip;
    if (collection) {
      trip = await collection.findOne({ id: req.params.id });
    } else {
      trip = memoryStore.trips.findById(req.params.id);
    }

    if (!trip) {
      console.log("Trip not found:", req.params.id);
      return res.status(404).json({ error: "Trip not found" });
    }

    const expenses = trip.expenses || [];
    console.log("Found expenses:", expenses.length);
    const expenseIndex = expenses.findIndex(
      (e) => e.id === req.params.expenseId
    );

    if (expenseIndex === -1) {
      console.log("Expense not found:", req.params.expenseId);
      console.log(
        "Available expense IDs:",
        expenses.map((e) => e.id)
      );
      return res.status(404).json({ error: "Expense not found" });
    }

    // Check permission
    const isOwner = trip.userId === req.user.id;
    const isCreator = expenses[expenseIndex].createdBy === req.user.id;

    console.log("Permission check:", {
      isOwner,
      isCreator,
      tripUserId: trip.userId,
      reqUserId: req.user.id,
      expenseCreatedBy: expenses[expenseIndex].createdBy,
    });

    if (!isOwner && !isCreator) {
      return res
        .status(403)
        .json({ error: "No permission to delete this expense" });
    }

    expenses.splice(expenseIndex, 1);

    let updated;
    if (collection) {
      await collection.updateOne(
        { id: req.params.id },
        { $set: { expenses, updatedAt: new Date().toISOString() } }
      );
      updated = await collection.findOne({ id: req.params.id });
    } else {
      updated = memoryStore.trips.update(req.params.id, { expenses });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// Update participant expense permission
router.put("/:id/participants/:userId/permission", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const { permission } = req.body; // 'disable', 'view', or 'edit'

    let trip;
    if (collection) {
      trip = await collection.findOne({ id: req.params.id });
    } else {
      trip = memoryStore.trips.findById(req.params.id);
    }

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Only owner can update permissions
    if (trip.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only trip owner can update permissions" });
    }

    // Update shared user permission
    const sharedWith = trip.sharedWith || [];
    const userIndex = sharedWith.findIndex(
      (s) => s.userId === req.params.userId
    );

    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found in shared list" });
    }

    sharedWith[userIndex].expensePermission = permission;

    let updated;
    if (collection) {
      await collection.updateOne(
        { id: req.params.id },
        { $set: { sharedWith, updatedAt: new Date().toISOString() } }
      );
      updated = await collection.findOne({ id: req.params.id });
    } else {
      updated = memoryStore.trips.update(req.params.id, { sharedWith });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating permission:", error);
    res.status(500).json({ error: "Failed to update permission" });
  }
});

// Calculate balances
router.get("/:id/expenses/balances", async (req, res) => {
  try {
    const collection = getTripsCollection();

    let trip;
    if (collection) {
      trip = await collection.findOne({ id: req.params.id });
    } else {
      trip = memoryStore.trips.findById(req.params.id);
    }

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Check access
    const isOwner = trip.userId === req.user.id;
    const sharedUser = trip.sharedWith?.find((s) => s.userId === req.user.id);
    const permission = sharedUser?.expensePermission || "disable";

    if (!isOwner && permission === "disable") {
      return res.status(403).json({ error: "No access to expenses" });
    }

    // Calculate balances
    const expenses = trip.expenses || [];
    const participants = {};

    // Initialize participants (owner + shared users with expense access)
    participants[trip.userId] = {
      userId: trip.userId,
      name: trip.userName || "Owner",
      email: trip.userEmail || "",
      totalPaid: 0,
      totalOwed: 0,
      balance: 0,
    };

    trip.sharedWith?.forEach((user) => {
      if (user.expensePermission && user.expensePermission !== "disable") {
        participants[user.userId] = {
          userId: user.userId,
          name: user.name,
          email: user.email,
          totalPaid: 0,
          totalOwed: 0,
          balance: 0,
        };
      }
    });

    // Calculate totals from expenses
    expenses.forEach((expense) => {
      // Add to payer's total paid (handle single or multiple payers)
      if (typeof expense.paidBy === "string") {
        // Single payer
        if (participants[expense.paidBy]) {
          participants[expense.paidBy].totalPaid += expense.amount;
        }
      } else if (Array.isArray(expense.paidBy)) {
        // Multiple payers
        expense.paidBy.forEach((payer) => {
          if (participants[payer.userId]) {
            participants[payer.userId].totalPaid += payer.amount;
          }
        });
      }

      // Calculate split amounts
      const splitParticipants = expense.splits;
      const participantCount = splitParticipants.length;

      splitParticipants.forEach((split) => {
        if (!participants[split.userId]) return;

        let owedAmount = 0;

        if (expense.splitMethod === "equal") {
          owedAmount = expense.amount / participantCount;
        } else if (expense.splitMethod === "custom-amount") {
          owedAmount = split.amount || 0;
        } else if (expense.splitMethod === "custom-percentage") {
          owedAmount = (expense.amount * (split.percentage || 0)) / 100;
        }

        participants[split.userId].totalOwed += owedAmount;
      });
    });

    // Calculate net balance for each participant
    Object.values(participants).forEach((p) => {
      p.balance = p.totalPaid - p.totalOwed;
    });

    res.json({
      participants: Object.values(participants),
      totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
    });
  } catch (error) {
    console.error("Error calculating balances:", error);
    res.status(500).json({ error: "Failed to calculate balances" });
  }
});
