import express from "express";
import { getDatabase } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import { ObjectId } from "mongodb";

const router = express.Router();

// Middleware to check if user is agency admin
const isAgencyAdmin = (req, res, next) => {
  // Agency admin = either global admin OR user with isAgencyAdmin flag for their agency
  if (!req.user?.isAdmin && !req.user?.isAgencyAdmin) {
    return res
      .status(403)
      .json({ message: "Access denied. Agency admin privileges required." });
  }
  next();
};

// Apply authentication to all routes
router.use(verifyGoogleToken, isAgencyAdmin);

// ==================== AGENCY DASHBOARD ====================

// Get agency statistics
router.get("/stats", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const agencyName = req.user.agencyName;
    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    const users = db.collection("users");
    const organizedTrips = db.collection("organized_trips");

    // Get all agents in this agency
    const agencyAgents = await users
      .find({ agencyName, isAgent: true })
      .toArray();

    const agentIds = agencyAgents.map((agent) => agent._id.toString());

    // Get all trips by agency agents
    const agencyTrips = await organizedTrips
      .find({ agentId: { $in: agentIds } })
      .toArray();

    // Calculate statistics
    const totalTrips = agencyTrips.length;
    const publishedTrips = agencyTrips.filter(
      (t) => t.status === "published"
    ).length;
    const activeTrips = agencyTrips.filter(
      (t) => t.status === "published" && new Date(t.endDate) > new Date()
    ).length;

    // Total participants across all trips
    const totalParticipants = agencyTrips.reduce(
      (sum, trip) => sum + (trip.participants?.length || 0),
      0
    );

    // Total revenue (estimated)
    const totalRevenue = agencyTrips.reduce((sum, trip) => {
      const participants = trip.participants?.length || 0;
      const price = trip.pricePerPerson || 0;
      return sum + participants * price;
    }, 0);

    // Upcoming departures (trips starting in next 30 days)
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const upcomingTrips = agencyTrips.filter((trip) => {
      const startDate = new Date(trip.startDate);
      return (
        trip.status === "published" &&
        startDate >= now &&
        startDate <= thirtyDaysFromNow
      );
    });

    // Recent trips (last 5)
    const recentTrips = agencyTrips
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map((trip) => ({
        _id: trip._id,
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        status: trip.status,
        participants: trip.participants?.length || 0,
        maxParticipants: trip.maxParticipants,
        agentName: trip.agentName,
      }));

    res.json({
      agencyName,
      totalAgents: agencyAgents.length,
      totalTrips,
      publishedTrips,
      activeTrips,
      totalParticipants,
      totalRevenue,
      upcomingDepartures: upcomingTrips.length,
      recentTrips,
      agents: agencyAgents.map((agent) => ({
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        phone: agent.agentPhone,
        isAdmin: agent.isAdmin || false,
        isAgencyAdmin: agent.isAgencyAdmin || false,
      })),
    });
  } catch (error) {
    console.error("Error fetching agency stats:", error);
    res.status(500).json({ error: "Failed to fetch agency statistics" });
  }
});

// ==================== AGENCY AGENTS MANAGEMENT ====================

// Get all agents in agency
router.get("/agents", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const agencyName = req.user.agencyName;
    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    const users = db.collection("users");
    const organizedTrips = db.collection("organized_trips");

    // Get all agents in this agency
    const agents = await users
      .find({ agencyName, isAgent: true })
      .project({
        _id: 1,
        name: 1,
        email: 1,
        agentPhone: 1,
        agencyLicense: 1,
        isAdmin: 1,
        isAgencyAdmin: 1,
        createdAt: 1,
      })
      .toArray();

    // Get trip count for each agent
    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const tripCount = await organizedTrips.countDocuments({
          agentId: agent._id.toString(),
        });

        const activeTrips = await organizedTrips.countDocuments({
          agentId: agent._id.toString(),
          status: "published",
          endDate: { $gte: new Date().toISOString() },
        });

        return {
          ...agent,
          tripCount,
          activeTrips,
        };
      })
    );

    res.json(agentsWithStats);
  } catch (error) {
    console.error("Error fetching agency agents:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

// Send invitation to join agency
router.post("/invitations/send", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { email, name } = req.body;
    const agencyName = req.user.agencyName;

    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const invitations = db.collection("agency_invitations");
    const users = db.collection("users");

    // Check if user already exists and is in this agency
    const existingUser = await users.findOne({ email });
    if (existingUser?.agencyName === agencyName && existingUser?.isAgent) {
      return res.status(400).json({ error: "משתמש זה כבר סוכן בסוכנות שלך" });
    }

    // Check if invitation already exists
    const existingInvitation = await invitations.findOne({
      email,
      agencyName,
      status: "pending",
    });

    if (existingInvitation) {
      return res.status(400).json({ error: "הזמנה לכתובת מייל זו כבר נשלחה" });
    }

    // Create invitation
    const invitation = {
      email,
      name: name || null,
      agencyName,
      invitedBy: req.user.id,
      invitedByName: req.user.name,
      status: "pending", // pending, accepted, rejected, expired
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    const result = await invitations.insertOne(invitation);

    // TODO: Send email notification
    // In production, you would send an email here with a link to accept the invitation

    res.json({
      message: "הזמנה נשלחה בהצלחה",
      invitationId: result.insertedId,
      email,
    });
  } catch (error) {
    console.error("Error sending invitation:", error);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});

// Get all pending invitations
router.get("/invitations", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const agencyName = req.user.agencyName;
    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    const invitations = db.collection("agency_invitations");

    const agencyInvitations = await invitations
      .find({ agencyName })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(agencyInvitations);
  } catch (error) {
    console.error("Error fetching invitations:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

// Cancel/delete invitation
router.delete("/invitations/:invitationId", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { invitationId } = req.params;
    const agencyName = req.user.agencyName;

    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    const invitations = db.collection("agency_invitations");

    const result = await invitations.deleteOne({
      _id: new ObjectId(invitationId),
      agencyName, // Ensure the invitation belongs to this agency
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    res.json({ message: "הזמנה בוטלה" });
  } catch (error) {
    console.error("Error deleting invitation:", error);
    res.status(500).json({ error: "Failed to delete invitation" });
  }
});

// Add user as agent to this agency
router.post("/agents/add", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { userId } = req.body;
    const agencyName = req.user.agencyName;

    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const users = db.collection("users");

    // Update user to be agent in this agency
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          isAgent: true,
          agencyName: agencyName,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Agent added successfully",
      userId,
      agencyName,
    });
  } catch (error) {
    console.error("Error adding agent:", error);
    res.status(500).json({ error: "Failed to add agent" });
  }
});

// Update agent details (phone, license, agency admin status)
router.put("/agents/:userId", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { userId } = req.params;
    const { agentPhone, agencyLicense, isAgencyAdmin } = req.body;
    const agencyName = req.user.agencyName;

    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    const users = db.collection("users");

    // Verify the agent belongs to this agency (unless user is global admin)
    if (!req.user.isAdmin) {
      const agent = await users.findOne({ _id: new ObjectId(userId) });
      if (!agent || agent.agencyName !== agencyName) {
        return res
          .status(403)
          .json({ error: "Agent does not belong to your agency" });
      }
    }

    const updateFields = {};
    if (agentPhone !== undefined) updateFields.agentPhone = agentPhone;
    if (agencyLicense !== undefined) updateFields.agencyLicense = agencyLicense;
    if (isAgencyAdmin !== undefined) updateFields.isAgencyAdmin = isAgencyAdmin;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updateFields.updatedAt = new Date();

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({ message: "Agent updated successfully" });
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// Remove agent from agency (does not delete user, just removes agent status)
router.delete("/agents/:userId", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { userId } = req.params;
    const agencyName = req.user.agencyName;

    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    const users = db.collection("users");

    // Verify the agent belongs to this agency (unless user is global admin)
    if (!req.user.isAdmin) {
      const agent = await users.findOne({ _id: new ObjectId(userId) });
      if (!agent || agent.agencyName !== agencyName) {
        return res
          .status(403)
          .json({ error: "Agent does not belong to your agency" });
      }
    }

    // Remove agent status and agency association
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          isAgent: false,
          agencyName: null,
          isAgencyAdmin: false,
          updatedAt: new Date(),
        },
        $unset: {
          agentPhone: "",
          agencyLicense: "",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({ message: "Agent removed from agency successfully" });
  } catch (error) {
    console.error("Error removing agent:", error);
    res.status(500).json({ error: "Failed to remove agent" });
  }
});

// ==================== AGENCY TRIPS ====================

// Get all trips from agency
router.get("/trips", async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const agencyName = req.user.agencyName;
    if (!agencyName) {
      return res.status(400).json({ error: "User has no agency assigned" });
    }

    const users = db.collection("users");
    const organizedTrips = db.collection("organized_trips");

    // Get all agent IDs in this agency
    const agencyAgents = await users
      .find({ agencyName, isAgent: true })
      .toArray();
    const agentIds = agencyAgents.map((agent) => agent._id.toString());

    // Get all trips by these agents
    const trips = await organizedTrips
      .find({ agentId: { $in: agentIds } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(trips);
  } catch (error) {
    console.error("Error fetching agency trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

export default router;
