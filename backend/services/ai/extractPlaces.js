import { getOpenAI, UTILITY_MODEL } from "./openaiClient.js";
import { enrichPlace } from "./places.js";
import googleApi from "../googleApi.js";

/**
 * Turn social-caption text into geocoded candidate places for Explore.
 *
 * Two steps, both lightweight:
 *  1. extractPlacesFromText(): one cheap json_object LLM call (UTILITY_MODEL,
 *     gpt-4o-mini) that pulls structured place mentions + tips out of free text.
 *     Mirrors the structured-JSON pattern in services/ai/memory.js.
 *  2. enrichCandidates(): for each extracted place, call enrichPlace(name, city)
 *     (Google Places text search) to attach placeId / location / photo / rating.
 *
 * Degrades gracefully: no OpenAI key -> returns empty extraction; no Google key
 * -> candidates keep their extracted fields but `enriched` is null. Never throws.
 */

const MAX_CAPTION_CHARS = 6000;
const MAX_PLACES = 12;

/**
 * @typedef {Object} ExtractedPlace
 * @property {string} name
 * @property {string} [type]    e.g. restaurant, cafe, bar, hotel, attraction, beach
 * @property {string} [tip]     short note/recommendation from the caption
 * @property {string} [city]
 * @property {string} [country]
 */

/**
 * @param {string} text caption / metadata text
 * @returns {Promise<{ places: ExtractedPlace[], primaryCity: string|null }>}
 */
export async function extractPlacesFromText(text) {
  const empty = { places: [], primaryCity: null };
  const openai = getOpenAI();
  if (!openai || !text || !text.trim()) return empty;

  const caption = text.slice(0, MAX_CAPTION_CHARS);

  try {
    const completion = await openai.chat.completions.create({
      model: UTILITY_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You extract real, visit-able places (restaurants, cafes, bars, hotels, " +
            "shops, attractions, beaches, viewpoints, neighborhoods) from a social media " +
            "caption. Return STRICT JSON with this exact shape: " +
            '{ "places": [{ "name": string, "type": string, "tip": string, "city": string, "country": string }], "primaryCity": string }. ' +
            "Rules: only include named places a traveler could actually go to (no generic " +
            "words like 'food' or 'view', no hashtags, no usernames). 'type' is a lowercase " +
            "category like restaurant, cafe, bar, hotel, attraction, beach, shop, viewpoint. " +
            "'tip' is a <=140 char recommendation distilled from the caption (empty string if none). " +
            "'city' and 'country' are your best guess from context (empty string if unknown). " +
            "'primaryCity' is the single most likely city for the whole post (empty string if unknown). " +
            "If there are no real places, return { \"places\": [], \"primaryCity\": \"\" }. " +
            `Return at most ${MAX_PLACES} places.`,
        },
        { role: "user", content: caption },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const rawPlaces = Array.isArray(parsed.places) ? parsed.places : [];

    const places = rawPlaces
      .filter((p) => p && typeof p.name === "string" && p.name.trim())
      .slice(0, MAX_PLACES)
      .map((p) => ({
        name: String(p.name).trim(),
        type: typeof p.type === "string" ? p.type.trim().toLowerCase() : "",
        tip: typeof p.tip === "string" ? p.tip.trim() : "",
        city: typeof p.city === "string" ? p.city.trim() : "",
        country: typeof p.country === "string" ? p.country.trim() : "",
      }));

    const primaryCity =
      typeof parsed.primaryCity === "string" && parsed.primaryCity.trim()
        ? parsed.primaryCity.trim()
        : null;

    return { places, primaryCity };
  } catch (err) {
    console.error("[ai/extractPlaces] extraction failed:", err.message);
    return empty;
  }
}

/**
 * Enrich extracted places with Google Places data. Runs lookups in parallel.
 * Each returned candidate keeps the extracted fields and adds `enriched`
 * (the enrichPlace result) plus flattened convenience fields used by the client.
 *
 * @param {ExtractedPlace[]} places
 * @param {string|null} primaryCity fallback city context for geocoding
 * @returns {Promise<Array>} candidate places (NOT yet saved)
 */
export async function enrichCandidates(places, primaryCity = null) {
  if (!Array.isArray(places) || places.length === 0) return [];

  const candidates = await Promise.all(
    places.map(async (p) => {
      const cityContext = p.city || primaryCity || null;
      let enriched = null;
      try {
        enriched = await enrichPlace(p.name, cityContext);
      } catch (err) {
        console.error(
          "[ai/extractPlaces] enrichPlace failed for",
          p.name,
          err.message
        );
      }

      return {
        name: enriched?.name || p.name,
        type: p.type || "",
        category: p.type || "",
        tip: p.tip || "",
        notes: p.tip || "",
        city: p.city || primaryCity || "",
        country: p.country || "",
        placeId: enriched?.placeId || null,
        address: enriched?.address || null,
        location: enriched?.location || null,
        photoReference: enriched?.photoReference || null,
        imageUrl: enriched?.photoReference
          ? googleApi.getPhotoUrl(enriched.photoReference, 800)
          : null,
        rating: enriched?.rating ?? null,
        types: enriched?.types || [],
        enriched: !!enriched,
      };
    })
  );

  return candidates;
}

/**
 * Convenience: extract + enrich in one call.
 * @param {string} text
 * @returns {Promise<{ candidates: Array, primaryCity: string|null }>}
 */
export async function extractAndEnrich(text) {
  const { places, primaryCity } = await extractPlacesFromText(text);
  const candidates = await enrichCandidates(places, primaryCity);
  return { candidates, primaryCity };
}
