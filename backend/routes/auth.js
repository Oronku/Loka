import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import * as tripService from "../services/trip.service.js";
import { OAuth2Client } from "google-auth-library";

const router = express.Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Get users collection
function getUsersCollection() {
  const db = getDatabase();
  return db ? db.collection("users") : null;
}

// Register new user
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res
        .status(400)
        .json({ error: "Email, password, and name are required" });
    }

    const collection = getUsersCollection();
    if (!collection) {
      return res.status(503).json({ error: "Database not available" });
    }

    // Convert email to lowercase
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await collection.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = {
      id: `user-${Date.now()}`,
      email: normalizedEmail,
      password: hashedPassword,
      name,
      picture: null,
      provider: "email",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await collection.insertOne(newUser);

    const linkedTripsCount = 0;

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, name: newUser.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      user: userWithoutPassword,
      token,
      linkedTripsCount,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// Google Sign In
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "ID token is required" });
    }

    const collection = getUsersCollection();
    if (!collection) {
      return res.status(503).json({ error: "Database not available" });
    }

    // Verify token with Google
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Convert email to lowercase
    const normalizedEmail = email.toLowerCase();

    // Find or create user
    let user = await collection.findOne({ email: normalizedEmail });

    if (!user) {
      // Create new user (same structure as /register)
      const newUser = {
        id: `user-${Date.now()}`,
        email: normalizedEmail,
        password: null,
        name: name || email.split("@")[0],
        picture: picture || null,
        provider: "google",
        googleId: googleId,
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await collection.insertOne(newUser);
      user = newUser;
    }

    const linkedTripsCount = 0;

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      user: userWithoutPassword,
      token,
      linkedTripsCount,
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(401).json({ error: "Google authentication failed" });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const collection = getUsersCollection();
    if (!collection) {
      return res.status(503).json({ error: "Database not available" });
    }

    // Convert email to lowercase
    const normalizedEmail = email.toLowerCase();

    // Find user
    const user = await collection.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Trip invites are accepted explicitly via the invitations list, not
    // auto-linked on login.
    const linkedTripsCount = 0;

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      token,
      linkedTripsCount,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Get user profile
router.get("/profile", verifyGoogleToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const collection = getUsersCollection();
    if (!collection) {
      return res.status(503).json({ error: "Database not available" });
    }

    const user = await collection.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// Update user profile
router.put("/profile", verifyGoogleToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, preferredCurrency } = req.body;

    const collection = getUsersCollection();
    if (!collection) {
      return res.status(503).json({ error: "Database not available" });
    }

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (name) updateData.name = name;
    if (preferredCurrency) updateData.preferredCurrency = preferredCurrency;

    const result = await collection.findOneAndUpdate(
      { id: userId },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = result;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Change password
router.put("/change-password", verifyGoogleToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "New password must be at least 6 characters" });
    }

    const collection = getUsersCollection();
    if (!collection) {
      return res.status(503).json({ error: "Database not available" });
    }

    const user = await collection.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user has a password (Google users might not)
    if (!user.password) {
      return res.status(400).json({
        error: "Cannot change password for Google authenticated users",
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isValidPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await collection.updateOne(
      { id: userId },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ==================== AGENCY INVITATIONS (USER SIDE) ====================

// Get invitations for current user
router.get("/invitations", verifyGoogleToken, async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const userEmail = req.user.email;
    const invitations = db.collection("agency_invitations");

    const userInvitations = await invitations
      .find({
        email: userEmail,
        status: "pending",
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(userInvitations);
  } catch (error) {
    console.error("Error fetching user invitations:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

// Accept agency invitation
router.post(
  "/invitations/:invitationId/accept",
  verifyGoogleToken,
  async (req, res) => {
    try {
      const db = getDatabase();
      if (!db) {
        return res.status(503).json({ error: "Database not available" });
      }

      const { invitationId } = req.params;
      const userEmail = req.user.email;
      const userId = req.user.id;

      const invitations = db.collection("agency_invitations");
      const users = db.collection("users");

      // Get invitation
      const invitation = await invitations.findOne({
        _id: new ObjectId(invitationId),
        email: userEmail,
        status: "pending",
      });

      if (!invitation) {
        return res.status(404).json({ error: "הזמנה לא נמצאה או פגה תוקפה" });
      }

      // Check if expired
      if (new Date(invitation.expiresAt) < new Date()) {
        await invitations.updateOne(
          { _id: new ObjectId(invitationId) },
          { $set: { status: "expired" } }
        );
        return res.status(400).json({ error: "ההזמנה פגה תוקף" });
      }

      // Update user to be agent in this agency
      await users.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            isAgent: true,
            agencyName: invitation.agencyName,
            updatedAt: new Date(),
          },
        }
      );

      // Mark invitation as accepted
      await invitations.updateOne(
        { _id: new ObjectId(invitationId) },
        {
          $set: {
            status: "accepted",
            acceptedAt: new Date(),
            acceptedBy: userId,
          },
        }
      );

      res.json({
        message: "ההזמנה אושרה בהצלחה!",
        agencyName: invitation.agencyName,
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  }
);

// Reject agency invitation
router.post(
  "/invitations/:invitationId/reject",
  verifyGoogleToken,
  async (req, res) => {
    try {
      const db = getDatabase();
      if (!db) {
        return res.status(503).json({ error: "Database not available" });
      }

      const { invitationId } = req.params;
      const userEmail = req.user.email;

      const invitations = db.collection("agency_invitations");

      // Get invitation
      const invitation = await invitations.findOne({
        _id: new ObjectId(invitationId),
        email: userEmail,
        status: "pending",
      });

      if (!invitation) {
        return res.status(404).json({ error: "הזמנה לא נמצאה" });
      }

      // Mark invitation as rejected
      await invitations.updateOne(
        { _id: new ObjectId(invitationId) },
        {
          $set: {
            status: "rejected",
            rejectedAt: new Date(),
          },
        }
      );

      res.json({ message: "ההזמנה נדחתה" });
    } catch (error) {
      console.error("Error rejecting invitation:", error);
      res.status(500).json({ error: "Failed to reject invitation" });
    }
  }
);

// Check for pending organized trips for user's email
router.get("/check-pending-trips", verifyGoogleToken, async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const userEmail = req.user.email;
    const organizedTrips = db.collection("organized_trips");

    // Find trips where user is a participant but not registered
    const tripsWithPendingParticipation = await organizedTrips
      .find({
        "participants.email": userEmail,
        "participants.isRegistered": false,
      })
      .toArray();

    // Extract participant data for each trip
    const pendingTrips = tripsWithPendingParticipation.map((trip) => {
      const participant = trip.participants.find(
        (p) => p.email === userEmail && p.isRegistered === false
      );

      return {
        tripId: trip._id.toString(),
        tripTitle: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        agentName: trip.agentName,
        agencyName: trip.agencyName,
        participantStatus: participant?.status,
        invitedAt: participant?.invitedAt,
      };
    });

    res.json({
      count: pendingTrips.length,
      trips: pendingTrips,
    });
  } catch (error) {
    console.error("Error checking pending trips:", error);
    res.status(500).json({ error: "Failed to check pending trips" });
  }
});

// Link pending trips to registered user
router.post("/link-trips", verifyGoogleToken, async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { ObjectId } = await import("mongodb");
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { tripIds } = req.body; // Array of trip IDs to link

    if (!Array.isArray(tripIds) || tripIds.length === 0) {
      return res.status(400).json({ error: "Trip IDs array is required" });
    }

    const organizedTrips = db.collection("organized_trips");

    // Update all specified trips
    const updatePromises = tripIds.map((tripId) =>
      organizedTrips.updateOne(
        {
          _id: new ObjectId(tripId),
          "participants.email": userEmail,
          "participants.isRegistered": false,
        },
        {
          $set: {
            "participants.$[elem].userId": userId,
            "participants.$[elem].isRegistered": true,
            "participants.$[elem].status": "confirmed",
            "participants.$[elem].joinedAt": new Date().toISOString(),
            "participants.$[elem].confirmedAt": new Date().toISOString(),
          },
        },
        {
          arrayFilters: [
            { "elem.email": userEmail, "elem.isRegistered": false },
          ],
        }
      )
    );

    const results = await Promise.all(updatePromises);
    const linkedCount = results.filter((r) => r.modifiedCount > 0).length;

    res.json({
      message: `${linkedCount} טיולים קושרו בהצלחה`,
      linkedCount,
    });
  } catch (error) {
    console.error("Error linking trips:", error);
    res.status(500).json({ error: "Failed to link trips" });
  }
});

// Pending personal trip invites for current user
router.get("/pending-trip-invites", verifyGoogleToken, async (req, res) => {
  try {
    const db = getDatabase();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const trips = await tripService.getPendingInvites(req.user.email);

    res.json({ count: trips.length, trips });
  } catch (error) {
    console.error("Error fetching pending trip invites:", error);
    res.status(500).json({ error: "Failed to fetch pending trip invites" });
  }
});

export default router;
