import { randomUUID } from "crypto";
import { PLACES_CACHE_COLLECTION } from "../../placeCache.js";
import {
  DEFAULT_SEARCH_BUDGET,
  MAX_CANDIDATES,
  MIN_CANDIDATES,
} from "./constants.js";

/**
 * @param {string} name
 */
function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {import('./constants.js').Candidate} candidate
 */
function dedupeKey(candidate) {
  if (candidate.placeId) return `pid:${candidate.placeId}`;
  return `name:${normalizeName(candidate.name)}`;
}

/**
 * @param {object} item
 * @param {import('./constants.js').DeliberationSlot} slot
 * @returns {import('./constants.js').Candidate|null}
 */
function candidateFromIdea(item, slot) {
  if (!item?.name) return null;
  if (slot.ideaIds?.length && !slot.ideaIds.includes(item.id)) return null;
  if (item.status && item.status !== "idea") return null;

  /** @type {Record<string, unknown>} */
  const attributes = { ...(item.attributes || {}) };
  if (item.notes && typeof item.notes === "string") {
    if (/alcohol[- ]free|no alcohol/i.test(item.notes)) attributes.alcoholFree = true;
    if (/kid.?friendly|children/i.test(item.notes)) attributes.kidFriendly = true;
  }

  return {
    id: item.id || randomUUID(),
    name: item.name,
    placeId: item.placeId || undefined,
    area: item.address || undefined,
    lat: typeof item.lat === "number" ? item.lat : undefined,
    lng: typeof item.lng === "number" ? item.lng : undefined,
    price: item.price ?? undefined,
    currency: item.currency || undefined,
    rating: typeof item.rating === "number" ? item.rating : undefined,
    openingHours: item.openingHours || undefined,
    website: item.website || undefined,
    bookingUrl: item.bookingUrl || undefined,
    bookingRequired: item.bookingRequired === true ? true : undefined,
    bookingLeadDays: typeof item.bookingLeadDays === "number" ? item.bookingLeadDays : undefined,
    attributes,
    origin: "user_idea",
  };
}

/**
 * @param {object} doc
 * @returns {import('./constants.js').Candidate}
 */
function candidateFromCache(doc) {
  const lat = doc.location?.lat ?? doc.location?.latitude ?? undefined;
  const lng = doc.location?.lng ?? doc.location?.longitude ?? undefined;
  return {
    id: randomUUID(),
    name: doc.name,
    placeId: doc.placeId || undefined,
    area: doc.address || doc.city || undefined,
    lat: typeof lat === "number" ? lat : undefined,
    lng: typeof lng === "number" ? lng : undefined,
    priceLevel: typeof doc.priceLevel === "number" ? doc.priceLevel : undefined,
    rating: typeof doc.rating === "number" ? doc.rating : undefined,
    reviewCount: typeof doc.userRatingsTotal === "number" ? doc.userRatingsTotal : undefined,
    openingHours: doc.openingHours || undefined,
    website: doc.website || undefined,
    attributes: { ...(doc.attributes || {}) },
    origin: "places_cache",
  };
}

/**
 * @param {object|null} place
 * @returns {import('./constants.js').Candidate|null}
 */
function candidateFromPlaceLookup(place) {
  if (!place?.name) return null;
  return {
    id: randomUUID(),
    name: place.name,
    placeId: place.placeId || undefined,
    area: place.address || undefined,
    lat: typeof place.lat === "number" ? place.lat : undefined,
    lng: typeof place.lng === "number" ? place.lng : undefined,
    rating: typeof place.rating === "number" ? place.rating : undefined,
    openingHours: place.openingHours || undefined,
    website: place.website || undefined,
    attributes: {},
    origin: "places_lookup",
  };
}

/**
 * Parse lightweight candidate rows from web search text (deterministic heuristics).
 * @param {string} text
 * @param {{ url: string, title?: string }[]} citations
 * @returns {import('./constants.js').Candidate[]}
 */
export function parseCandidatesFromSearchText(text, citations = []) {
  if (!text?.trim()) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  /** @type {import('./constants.js').Candidate[]} */
  const found = [];

  for (const line of lines) {
    const bullet = line.replace(/^[-*•\d.)]+\s*/, "");
    const priceMatch = bullet.match(/(?:€|EUR|\$|USD)\s*(\d+(?:\.\d+)?)/i);
    const name = bullet.split(/[-–—|(,]/)[0]?.trim();
    if (!name || name.length < 3) continue;

    /** @type {Record<string, unknown>} */
    const attributes = {};
    if (/alcohol[- ]free|no alcohol|dry/i.test(bullet)) attributes.alcoholFree = true;
    if (/serves alcohol|wine|beer|drinks included/i.test(bullet)) attributes.servesAlcohol = true;
    if (/kid.?friendly|family/i.test(bullet)) attributes.kidFriendly = true;

    found.push({
      id: randomUUID(),
      name,
      price: priceMatch ? Number(priceMatch[1]) : undefined,
      currency: /€|EUR/i.test(bullet) ? "EUR" : /\$|USD/i.test(bullet) ? "USD" : undefined,
      attributes,
      origin: "web_search",
      sourceUrl: citations[0]?.url,
    });
  }
  return found;
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} params
 * @param {import('./constants.js').DeliberationSlot} params.slot
 * @param {object} params.trip
 * @param {(query: string, opts?: object) => Promise<{ ok: boolean, text: string, citations: { url: string, title?: string }[] }>} params.search
 * @param {(name: string, cityContext?: string|null, db?: import('mongodb').Db|null) => Promise<object|null>} params.places
 * @param {(input: object) => Promise<object>} [params.llm]
 * @param {number} [params.searchBudget]
 * @returns {Promise<{ candidates: import('./constants.js').Candidate[], searchesUsed: number }>}
 */
export async function gatherCandidates(db, {
  slot,
  trip,
  search,
  places,
  llm: _llm,
  searchBudget = DEFAULT_SEARCH_BUDGET,
}) {
  const merged = new Map();
  const add = (candidate) => {
    if (!candidate?.name) return;
    const key = dedupeKey(candidate);
    if (!merged.has(key)) merged.set(key, candidate);
  };

  for (const item of trip?.attractions || []) {
    add(candidateFromIdea(item, slot));
  }

  const queryTerms = [slot.query, slot.label].filter(Boolean);
  const regex = queryTerms.length
    ? new RegExp(queryTerms.map((t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i")
    : null;

  if (db && regex) {
    const cacheDocs = await db
      .collection(PLACES_CACHE_COLLECTION)
      .find({ name: { $regex: regex } })
      .limit(MAX_CANDIDATES)
      .toArray();
    for (const doc of cacheDocs) add(candidateFromCache(doc));
  }

  let searchesUsed = 0;
  const city = trip?.destinations?.[0]?.city || trip?.destinations?.[0]?.name || null;
  const lookupQuery = slot.query || slot.label;

  if (merged.size < MIN_CANDIDATES && lookupQuery && places) {
    const place = await places(lookupQuery, city, db);
    add(candidateFromPlaceLookup(place));
  }

  while (merged.size < MIN_CANDIDATES && searchesUsed < searchBudget && lookupQuery && search) {
    searchesUsed += 1;
    const result = await search(`${lookupQuery}${city ? ` ${city}` : ""}`);
    if (result?.ok) {
      for (const c of parseCandidatesFromSearchText(result.text, result.citations)) add(c);
    }
  }

  const candidates = [...merged.values()].slice(0, MAX_CANDIDATES);
  return { candidates, searchesUsed };
}
