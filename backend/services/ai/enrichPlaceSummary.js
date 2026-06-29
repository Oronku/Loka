import { getOpenAI, UTILITY_MODEL } from "./openaiClient.js";

const MAX_SUMMARY_CHARS = 240;
const MAX_TAGS = 8;

/**
 * Generate a short vibe summary + tags for a place. Never throws.
 *
 * @param {{ name: string, city?: string|null, country?: string|null, types?: string[], rating?: number|null }} place
 * @param {string|null} [caption] optional user/social caption for context
 * @returns {Promise<{ summary: string, tags: string[] }|null>}
 */
export async function enrichPlaceSummary(place, caption = null) {
  const openai = getOpenAI();
  if (!openai || !place?.name) return null;

  const types = Array.isArray(place.types) ? place.types.slice(0, 6) : [];
  const context = [
    `Name: ${place.name}`,
    place.city ? `City: ${place.city}` : null,
    place.country ? `Country: ${place.country}` : null,
    types.length ? `Types: ${types.join(", ")}` : null,
    place.rating != null ? `Rating: ${place.rating}` : null,
    caption ? `Social caption: ${caption.slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: UTILITY_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You write friendly, specific travel blurbs for saved places. " +
            "Return STRICT JSON: { \"summary\": string, \"tags\": string[] }. " +
            `summary must be <= ${MAX_SUMMARY_CHARS} chars, 1-2 sentences, concrete vibe (not generic). ` +
            `tags are lowercase vibe labels (e.g. rooftop, romantic, budget, family-friendly), max ${MAX_TAGS} items. ` +
            "If unsure, still return your best guess.",
        },
        { role: "user", content: context },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, MAX_SUMMARY_CHARS) : "";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t) => typeof t === "string" && t.trim())
          .map((t) => t.trim().toLowerCase())
          .slice(0, MAX_TAGS)
      : [];

    if (!summary) return null;
    return { summary, tags };
  } catch (err) {
    console.error("[ai/enrichPlaceSummary] failed:", err.message);
    return null;
  }
}
