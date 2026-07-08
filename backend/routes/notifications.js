import express from "express";
import { verifyGoogleToken } from "../middleware/auth.js";
import { getDb } from "../config/database.js";
import { registerPushToken, removePushToken } from "../services/notification.service.js";
import { isValidPlatform } from "../models/pushToken.helper.js";

const router = express.Router();
router.use(verifyGoogleToken);

router.post("/push-token", async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { expoPushToken, platform: rawPlatform } = req.body ?? {};

    if (!expoPushToken || typeof expoPushToken !== "string" || !expoPushToken.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let platform = null;
    if (rawPlatform != null && rawPlatform !== "") {
      if (!isValidPlatform(rawPlatform)) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      platform = rawPlatform;
    }

    const doc = await registerPushToken({
      userId: req.user.id,
      expoPushToken: expoPushToken.trim(),
      platform,
    });

    if (!doc) {
      return res.status(503).json({ error: "Database not available" });
    }

    res.status(200).json({ success: true, pushToken: doc });
  } catch (error) {
    console.error("Error registering push token:", error);
    res.status(500).json({ error: "Failed to register push token" });
  }
});

router.delete("/push-token", async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { expoPushToken } = req.body ?? {};

    if (!expoPushToken || typeof expoPushToken !== "string" || !expoPushToken.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await removePushToken({
      userId: req.user.id,
      expoPushToken: expoPushToken.trim(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing push token:", error);
    res.status(500).json({ error: "Failed to remove push token" });
  }
});

export default router;
