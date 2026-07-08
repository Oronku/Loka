/**
 * MongoDB collection `push_tokens` stores Expo push notification tokens
 * registered by mobile clients. Each document maps a user to one device token;
 * a user may have multiple tokens (multiple devices). The pair
 * `{ userId, expoPushToken }` is unique.
 */

export const PUSH_TOKENS_COLLECTION = "push_tokens";

/**
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.expoPushToken
 * @param {"ios" | "android" | null} [params.platform]
 */
export function buildPushTokenDocument({ userId, expoPushToken, platform }) {
  const now = new Date();
  return {
    userId,
    expoPushToken,
    platform: platform ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * @param {unknown} p
 * @returns {boolean}
 */
export function isValidPlatform(p) {
  return p === "ios" || p === "android";
}
