import { getOpenAI, UTILITY_MODEL } from "./openaiClient.js";

export const PROFILES_COLLECTION = "ai_user_profiles";

/**
 * Long-term per-user memory/profile that makes Loka smarter over time.
 * Shape:
 * {
 *   userId, homeAirport, travelStyle, pace, budgetLevel,
 *   cuisines[], interests[], dislikes[], languages[],
 *   summary,            // rolling free-text notes
 *   updatedAt
 * }
 */

export async function getUserProfile(db, userId) {
  if (!db) return null;
  return db.collection(PROFILES_COLLECTION).findOne({ userId });
}

const ARRAY_FIELDS = ["cuisines", "interests", "dislikes", "languages"];
const SCALAR_FIELDS = ["homeAirport", "travelStyle", "pace", "budgetLevel"];

function mergeProfile(existing, patch) {
  const next = { ...(existing || {}) };
  for (const f of SCALAR_FIELDS) {
    if (patch[f]) next[f] = patch[f];
  }
  for (const f of ARRAY_FIELDS) {
    if (Array.isArray(patch[f]) && patch[f].length) {
      next[f] = Array.from(new Set([...(next[f] || []), ...patch[f]])).slice(0, 12);
    }
  }
  if (patch.summary) next.summary = patch.summary;
  return next;
}

/**
 * Inspect a finished conversation turn and fold any durable preferences into
 * the user's profile. Best-effort and non-blocking — never throws.
 *
 * @param {object} db
 * @param {string} userId
 * @param {{ role: string, content: string }[]} recentMessages
 */
export async function updateProfileFromConversation(db, userId, recentMessages = []) {
  const openai = getOpenAI();
  if (!openai || !db || recentMessages.length === 0) return;

  try {
    const existing = await getUserProfile(db, userId);
    const transcript = recentMessages
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: UTILITY_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Extract DURABLE travel preferences about the user from the conversation. " +
            "Return strict JSON with any of these keys you can confidently infer: " +
            "homeAirport (IATA), travelStyle, pace (relaxed|moderate|packed), budgetLevel (budget|moderate|luxury), " +
            "cuisines[], interests[], dislikes[], languages[], summary (<=2 sentence rolling note). " +
            "Only include keys you are confident about. If nothing durable, return {}. " +
            `Existing profile: ${JSON.stringify(existing || {})}`,
        },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const patch = JSON.parse(completion.choices[0].message.content || "{}");
    if (!patch || Object.keys(patch).length === 0) return;

    const merged = mergeProfile(existing, patch);
    merged.userId = userId;
    merged.updatedAt = new Date();

    await db
      .collection(PROFILES_COLLECTION)
      .updateOne({ userId }, { $set: merged }, { upsert: true });
  } catch (err) {
    console.error("[ai/memory] updateProfileFromConversation failed:", err.message);
  }
}
