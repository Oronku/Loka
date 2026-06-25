import { getOpenAI, UTILITY_MODEL } from "./openaiClient.js";

export const PROFILES_COLLECTION = "ai_user_profiles";

/**
 * Long-term per-user memory/profile that makes Loka smarter over time.
 * Shape:
 * {
 *   userId, homeAirport, travelStyle, pace, budgetLevel,
 *   cuisines[], interests[], dislikes[], languages[],
 *   summary,            // rolling free-text notes
 *   turnCounter,        // chat turns seen (cheap, no tokens) — used for throttling
 *   lastExtractionAt,   // last time we ran the LLM extraction
 *   updatedAt
 * }
 */

const ARRAY_FIELDS = ["cuisines", "interests", "dislikes", "languages"];
const SCALAR_FIELDS = ["homeAirport", "travelStyle", "pace", "budgetLevel"];

/** Fields that are internal bookkeeping and should never reach the client/prompt. */
const INTERNAL_FIELDS = ["_id", "turnCounter", "lastExtractionAt"];

/**
 * Run the (token-spending) extraction at most once every N chat turns, unless
 * the latest message clearly states a preference or we've never extracted yet.
 */
const EXTRACTION_INTERVAL = 4;

// Heuristic cues that the user just stated something worth remembering.
const PREF_CUES_EN =
  /\b(remember|i (?:always|usually|never|prefer|like|love|hate|avoid)|favou?rite|allerg|vegetarian|vegan|kosher|halal|gluten|window seat|aisle seat|home airport|on a budget|luxury)\b/i;
const PREF_CUES_HE =
  /(תזכור|זכור|אני (?:תמיד|בדרך כלל|מעדיף|מעדיפה|אוהב|אוהבת|שונא|שונאת)|טבעוני|צמחוני|כשר|אלרגי)/;

function hasPreferenceCue(text = "") {
  return PREF_CUES_EN.test(text) || PREF_CUES_HE.test(text);
}

export async function getUserProfile(db, userId) {
  if (!db || !userId) return null;
  return db.collection(PROFILES_COLLECTION).findOne({ userId });
}

/** Client/prompt-safe view of the profile (drops internal bookkeeping + empties). */
export function publicProfile(profile) {
  if (!profile) return null;
  const out = {};
  for (const [k, v] of Object.entries(profile)) {
    if (INTERNAL_FIELDS.includes(k)) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v == null || v === "") continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export async function clearUserProfile(db, userId) {
  if (!db || !userId) return;
  await db.collection(PROFILES_COLLECTION).deleteOne({ userId });
}

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
 * Decide whether to extract this turn, bump the cheap turn counter, and run the
 * extraction only when it's worth the tokens. This is the entry point the
 * assistant pipeline should call (not updateProfileFromConversation directly).
 *
 * @param {object} db
 * @param {string} userId
 * @param {{ role: string, content: string }[]} recentMessages
 * @param {string} latestUserText  the user's most recent message (for cue detection)
 */
export async function maybeUpdateProfile(db, userId, recentMessages = [], latestUserText = "") {
  const openai = getOpenAI();
  if (!openai || !db || !userId || recentMessages.length === 0) return;

  let existing = null;
  try {
    existing = await getUserProfile(db, userId);
  } catch {
    /* non-fatal */
  }

  const nextCount = (existing?.turnCounter || 0) + 1;

  // Cheap bookkeeping write — costs no tokens, just tracks cadence.
  try {
    await db
      .collection(PROFILES_COLLECTION)
      .updateOne({ userId }, { $set: { userId }, $inc: { turnCounter: 1 } }, { upsert: true });
  } catch {
    /* non-fatal */
  }

  const coldStart = !existing?.lastExtractionAt;
  const onInterval = nextCount % EXTRACTION_INTERVAL === 0;
  if (!(coldStart || onInterval || hasPreferenceCue(latestUserText))) return;

  await updateProfileFromConversation(db, userId, recentMessages, existing);
}

/**
 * Inspect a finished conversation turn and fold any durable preferences into
 * the user's profile. Best-effort and non-blocking — never throws.
 *
 * @param {object} db
 * @param {string} userId
 * @param {{ role: string, content: string }[]} recentMessages
 * @param {object|null} [existing]  pre-loaded profile (avoids a duplicate read)
 */
export async function updateProfileFromConversation(db, userId, recentMessages = [], existing) {
  const openai = getOpenAI();
  if (!openai || !db || recentMessages.length === 0) return;

  try {
    if (existing === undefined) existing = await getUserProfile(db, userId);
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
            `Existing profile: ${JSON.stringify(publicProfile(existing) || {})}`,
        },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const patch = JSON.parse(completion.choices[0].message.content || "{}");

    // Always record that we attempted extraction so throttling can settle, even
    // when the turn yielded nothing durable.
    if (!patch || Object.keys(patch).length === 0) {
      await db
        .collection(PROFILES_COLLECTION)
        .updateOne(
          { userId },
          { $set: { userId, lastExtractionAt: new Date() } },
          { upsert: true },
        );
      return;
    }

    const merged = mergeProfile(existing, patch);
    merged.userId = userId;
    merged.updatedAt = new Date();
    merged.lastExtractionAt = new Date();
    delete merged.turnCounter; // never clobber the live counter
    delete merged._id;

    await db
      .collection(PROFILES_COLLECTION)
      .updateOne({ userId }, { $set: merged }, { upsert: true });
  } catch (err) {
    console.error("[ai/memory] updateProfileFromConversation failed:", err.message);
  }
}
