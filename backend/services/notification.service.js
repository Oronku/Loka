import { getDb } from "../config/database.js";
import { PUSH_TOKENS_COLLECTION } from "../models/pushToken.helper.js";

export function getPushTokensCollection() {
  const db = getDb();
  return db ? db.collection(PUSH_TOKENS_COLLECTION) : null;
}

/**
 * @param {{ userId: string, expoPushToken: string, platform: "ios" | "android" | null }} params
 */
export async function registerPushToken({ userId, expoPushToken, platform }) {
  if (!userId || !expoPushToken) {
    return null;
  }

  const collection = getPushTokensCollection();
  if (!collection) {
    return null;
  }

  const now = new Date();
  const filter = { userId, expoPushToken };

  await collection.updateOne(
    filter,
    {
      $set: {
        updatedAt: now,
        platform: platform ?? null,
      },
      $setOnInsert: {
        createdAt: now,
        userId,
        expoPushToken,
      },
    },
    { upsert: true }
  );

  return collection.findOne(filter);
}

/**
 * @param {{ userId: string, expoPushToken: string }} params
 */
export async function removePushToken({ userId, expoPushToken }) {
  if (!userId || !expoPushToken) {
    return false;
  }

  const collection = getPushTokensCollection();
  if (!collection) {
    return false;
  }

  const result = await collection.deleteOne({ userId, expoPushToken });
  return result.deletedCount > 0;
}

/**
 * @param {string} userId
 */
export async function listPushTokensForUser(userId) {
  if (!userId) {
    return [];
  }

  const collection = getPushTokensCollection();
  if (!collection) {
    return [];
  }

  return collection.find({ userId }).toArray();
}

/**
 * Placeholder for future Expo push delivery. Loads tokens but does not send.
 *
 * @param {string} userId
 * @param {object} payload
 */
export async function sendPushNotification(userId, payload) {
  const tokens = await listPushTokensForUser(userId);

  // TODO: integrate expo-server-sdk here — build messages from tokens + payload
  // and POST to Expo Push API. Install `expo-server-sdk` when implementing send.
  // Example flow:
  //   const Expo = require('expo-server-sdk');
  //   const expo = new Expo();
  //   const messages = tokens
  //     .filter((t) => Expo.isExpoPushToken(t.expoPushToken))
  //     .map((t) => ({ to: t.expoPushToken, ...payload }));
  //   await expo.sendPushNotificationsAsync(messages);

  return {
    delivered: false,
    reason: "not_implemented",
    tokenCount: tokens.length,
  };
}
