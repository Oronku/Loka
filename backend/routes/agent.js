import express from "express";
import { getDatabase } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";

const router = express.Router();

// Middleware to verify agent access
const isAgent = (req, res, next) => {
  if (!req.user?.isAgent && !req.user?.isAdmin) {
    return res
      .status(403)
      .json({ message: "Access denied. Agent privileges required." });
  }
  next();
};

// Apply authentication and agent check to all routes
router.use(verifyGoogleToken, isAgent);

// Get agent dashboard statistics
router.get("/dashboard/stats", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const agentId = req.user.id;

    // TODO: Implement real statistics from organized_trips collection
    // For now, return mock data
    const stats = {
      activeTrips: 5,
      totalParticipants: 87,
      upcomingDepartures: 3,
      revenue: 45000,
      recentTrips: [],
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching agent stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// Get all organized trips created by this agent
router.get("/trips", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const agentId = req.user.id;
    console.log("🔍 Agent looking for trips with agentId:", agentId);

    const organizedTrips = db.collection("organized_trips");

    const trips = await organizedTrips
      .find({ agentId: agentId })
      .sort({ createdAt: -1 })
      .toArray();

    console.log("📋 Found trips:", trips.length);
    if (trips.length > 0) {
      console.log("First trip agentId:", trips[0].agentId);
    }

    res.json(trips);
  } catch (error) {
    console.error("Error fetching agent trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

// Create a new organized trip
router.post("/trips/create", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const agentId = req.user.id;
    const organizedTrips = db.collection("organized_trips");

    const newTrip = {
      ...req.body,
      agentId: agentId,
      agentName: req.user.name,
      agencyName: req.user.agencyName,
      type: "organized",
      status: "draft",
      participants: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await organizedTrips.insertOne(newTrip);

    res.status(201).json({
      message: "Organized trip created successfully",
      tripId: result.insertedId,
      trip: newTrip,
    });
  } catch (error) {
    console.error("Error creating organized trip:", error);
    res.status(500).json({ error: "Failed to create trip" });
  }
});

// Get specific organized trip details
router.get("/trips/:id", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { ObjectId } = await import("mongodb");
    const organizedTrips = db.collection("organized_trips");

    const trip = await organizedTrips.findOne({
      _id: new ObjectId(req.params.id),
      agentId: req.user.id,
    });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json(trip);
  } catch (error) {
    console.error("Error fetching trip:", error);
    res.status(500).json({ error: "Failed to fetch trip" });
  }
});

// Update organized trip
router.put("/trips/:id", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { ObjectId } = await import("mongodb");
    const organizedTrips = db.collection("organized_trips");

    // Don't allow updating certain protected fields
    const { _id, agentId, agentName, createdAt, ...updateData } = req.body;

    const result = await organizedTrips.updateOne(
      {
        _id: new ObjectId(req.params.id),
        agentId: req.user.id,
      },
      {
        $set: {
          ...updateData,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ message: "Trip updated successfully" });
  } catch (error) {
    console.error("Error updating trip:", error);
    res.status(500).json({ error: "Failed to update trip" });
  }
});

// Update trip visibility
router.patch("/trips/:id/visibility", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { ObjectId } = await import("mongodb");
    const { visibility } = req.body;

    if (!["public", "private", "draft"].includes(visibility)) {
      return res.status(400).json({ error: "Invalid visibility value" });
    }

    const organizedTrips = db.collection("organized_trips");

    const result = await organizedTrips.updateOne(
      {
        _id: new ObjectId(req.params.id),
        agentId: req.user.id,
      },
      {
        $set: {
          visibility: visibility,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ message: "Visibility updated successfully", visibility });
  } catch (error) {
    console.error("Error updating visibility:", error);
    res.status(500).json({ error: "Failed to update visibility" });
  }
});

// Invite participant to organized trip
router.post("/trips/:id/invite", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { ObjectId } = await import("mongodb");
    const { userId, email, name, phone } = req.body;

    // Validate required fields
    if (!email || !name) {
      return res.status(400).json({ error: "Email and name are required" });
    }

    const organizedTrips = db.collection("organized_trips");
    const users = db.collection("users");

    // Check if user exists in system by email
    let isRegistered = false;
    let actualUserId = userId || null;

    if (email && !userId) {
      const existingUser = await users.findOne({ email: email });
      if (existingUser) {
        actualUserId = existingUser._id.toString();
        isRegistered = true;
      }
    } else if (userId) {
      isRegistered = true;
    }

    const participant = {
      userId: actualUserId,
      email: email,
      name: name,
      phone: phone || null,
      status: "invited",
      isRegistered: isRegistered,
      invitedAt: new Date().toISOString(),
      paidAmount: 0,
      personalDocs: [],
    };

    const result = await organizedTrips.updateOne(
      {
        _id: new ObjectId(req.params.id),
        agentId: req.user.id,
      },
      {
        $push: { participants: participant },
        $set: { updatedAt: new Date().toISOString() },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // TODO: Send invitation email

    res.json({ message: "Participant invited successfully", participant });
  } catch (error) {
    console.error("Error inviting participant:", error);
    res.status(500).json({ error: "Failed to invite participant" });
  }
});

// Send update/announcement to trip participants
router.post("/trips/:id/update", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { ObjectId } = await import("mongodb");
    const { type, message, recipients } = req.body;

    const tripUpdates = db.collection("trip_updates");

    const update = {
      tripId: req.params.id,
      agentId: req.user.id,
      agentName: req.user.name,
      type: type, // 'announcement', 'document', 'itinerary_change'
      message: message,
      recipients: recipients || [], // Empty = all participants
      createdAt: new Date().toISOString(),
    };

    await tripUpdates.insertOne(update);

    // TODO: Send notifications to participants

    res.json({ message: "Update sent successfully", update });
  } catch (error) {
    console.error("Error sending update:", error);
    res.status(500).json({ error: "Failed to send update" });
  }
});

// Upload document for trip
router.post("/trips/:id/documents", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { ObjectId } = await import("mongodb");
    const { type, url, fileName, forUser } = req.body;

    const organizedTrips = db.collection("organized_trips");

    const document = {
      type: type, // 'flight', 'hotel', 'insurance', 'other'
      url: url,
      fileName: fileName,
      forUser: forUser || null, // null = for all participants
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user.id,
    };

    const result = await organizedTrips.updateOne(
      {
        _id: new ObjectId(req.params.id),
        agentId: req.user.id,
      },
      {
        $push: { documents: document },
        $set: { updatedAt: new Date().toISOString() },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Error uploading document:", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

export default router;
