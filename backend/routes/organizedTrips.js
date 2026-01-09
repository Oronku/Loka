import express from "express";
import { getDatabase } from "../config/database.js";
import { ObjectId } from "mongodb";

const router = express.Router();

// Get all public organized trips (no authentication required)
router.get("/public", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const organizedTrips = db.collection("organized_trips");

    // Get query parameters for filtering
    const {
      destination,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      tags,
      agencyName,
      limit = 20,
    } = req.query;

    // Build filter
    const filter = {
      visibility: "public",
      status: { $in: ["published", "full"] }, // Only show published or full trips
    };

    // Add destination filter if provided
    if (destination) {
      filter.destination = new RegExp(destination, "i"); // Case-insensitive search
    }

    // Add price range filter
    if (minPrice || maxPrice) {
      filter.pricePerPerson = {};
      if (minPrice) filter.pricePerPerson.$gte = parseFloat(minPrice);
      if (maxPrice) filter.pricePerPerson.$lte = parseFloat(maxPrice);
    }

    // Add date range filter
    if (startDate) {
      filter.startDate = { $gte: startDate };
    }
    if (endDate) {
      filter.endDate = { $lte: endDate };
    }

    // Add tags filter
    if (tags) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $all: tagsArray };
    }

    // Add agency name filter
    if (agencyName) {
      filter.agencyName = new RegExp(agencyName, "i");
    }

    const trips = await organizedTrips
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({
      trips,
      count: trips.length,
    });
  } catch (error) {
    console.error("Error fetching public trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

// Get single trip by ID (public or private, anyone with link can view)
router.get("/:id", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const organizedTrips = db.collection("organized_trips");
    const tripId = req.params.id;

    const trip = await organizedTrips.findOne({ _id: new ObjectId(tripId) });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Only allow viewing if visibility is public or private (not draft)
    if (trip.visibility === "draft") {
      return res
        .status(403)
        .json({ error: "This trip is not available publicly" });
    }

    // Don't return sensitive information
    const { participants, ...publicTripData } = trip;

    // Return trip with participant count only
    res.json({
      ...publicTripData,
      participantCount: participants?.length || 0,
      availableSpots: trip.maxParticipants - (participants?.length || 0),
    });
  } catch (error) {
    console.error("Error fetching trip:", error);
    res.status(500).json({ error: "Failed to fetch trip" });
  }
});

// Submit trip registration (for potential participants)
router.post("/:id/register", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const organizedTrips = db.collection("organized_trips");
    const tripId = req.params.id;
    const { name, email, phone, message } = req.body;

    // Validate required fields
    if (!name || !email || !phone) {
      return res
        .status(400)
        .json({ error: "Name, email, and phone are required" });
    }

    const trip = await organizedTrips.findOne({ _id: new ObjectId(tripId) });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Check if trip is available for registration
    if (trip.visibility === "draft") {
      return res
        .status(403)
        .json({ error: "This trip is not available for registration" });
    }

    if (trip.status === "cancelled" || trip.status === "completed") {
      return res
        .status(400)
        .json({ error: "This trip is no longer available" });
    }

    if (trip.participants?.length >= trip.maxParticipants) {
      return res.status(400).json({ error: "This trip is full" });
    }

    // Create registration request
    const registration = {
      name,
      email,
      phone,
      message: message || "",
      status: "pending", // Agent needs to approve
      requestedAt: new Date().toISOString(),
    };

    // Add to trip's pending registrations
    await organizedTrips.updateOne(
      { _id: new ObjectId(tripId) },
      {
        $push: { pendingRegistrations: registration },
        $set: { updatedAt: new Date().toISOString() },
      }
    );

    res.json({
      message:
        "Registration submitted successfully. The agent will contact you soon.",
      registration,
    });
  } catch (error) {
    console.error("Error submitting registration:", error);
    res.status(500).json({ error: "Failed to submit registration" });
  }
});

// Get participant's trips (requires authentication via email token or similar)
// For now, simplified - get by email
router.get("/participant/:email/trips", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const organizedTrips = db.collection("organized_trips");
    const { email } = req.params;

    // Find all trips where this email is a participant
    const trips = await organizedTrips
      .find({
        "participants.email": email,
      })
      .toArray();

    // Don't expose other participants' data
    const sanitizedTrips = trips.map((trip) => {
      const participant = trip.participants.find((p) => p.email === email);
      return {
        ...trip,
        myParticipantData: participant,
        participants: undefined, // Remove other participants
      };
    });

    res.json({ trips: sanitizedTrips });
  } catch (error) {
    console.error("Error fetching participant trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

export default router;
