import express from "express";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import { ObjectId } from "mongodb";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyGoogleToken);

// Create a new check-in
router.post("/", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { placeId, name, address, location, photoUrl } = req.body;

    if (!placeId || !name || !location) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const checkIn = {
      userId,
      placeId,
      name,
      address,
      location, // { lat, lng }
      photoUrl,
      createdAt: new Date(),
    };

    const result = await db.collection("checkins").insertOne(checkIn);

    res.status(201).json({
      ...checkIn,
      _id: result.insertedId,
    });
  } catch (error) {
    console.error("Error creating check-in:", error);
    res.status(500).json({ error: "Failed to create check-in" });
  }
});

// Get check-ins for the current user
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const checkIns = await db
      .collection("checkins")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json(checkIns);
  } catch (error) {
    console.error("Error fetching check-ins:", error);
    res.status(500).json({ error: "Failed to fetch check-ins" });
  }
});

export default router;
