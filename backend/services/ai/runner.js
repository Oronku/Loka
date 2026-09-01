import { randomUUID } from "crypto";
import { getDb } from "../../config/database.js";
import { getOpenAI, CHAT_MODEL } from "./openaiClient.js";
import {
  READ_ONLY_TOOLS,
  THINK_TOOLS,
  MEMORY_TOOLS,
  ASK_USER_TOOLS,
  MAX_REMEMBER_PER_TURN,
  TOOL_DEFINITIONS,
} from "./tools.js";
import {
  buildSystemPrompt,
  buildTripAttentionContext,
  TRIP_ATTENTION_CHAR_BUDGET,
  isIdea,
} from "./prompt.js";
import { assessTripIntegrity, whatTripNeedsNow } from "./integrity/index.js";
import { newOperation, summarizeOperations, NEW_TRIP_REF } from "./changeset.js";
import { ARRAY_ENTITY_FIELD } from "./entityFields.js";
import { enrichPlace, normalizeOpeningHours } from "./places.js";
import { MAX_WEB_SEARCHES_PER_TURN, webSearch } from "./webSearch.js";
import { mergeTripIntent } from "../trip.service.js";
import { computeTripReadiness, readinessForPrompt } from "../trip/readiness.js";
import {
  applyRemember,
  buildAxisBrief,
  getAxes,
  recallAxis,
  selectRelevantAxes,
} from "./axisMemory.js";
import { sanitizeQuestionSet } from "./questions.js";
import { buildOperationProvenance, runWriteGate } from "./writeGate.js";
import {
  attachDeliberationToOperations,
  executeThinkItThrough,
  isBroadItineraryWrite,
  isBroadPlanningMessage,
} from "./thinkItThrough.js";

const ENTITY_FIELD = ARRAY_ENTITY_FIELD;

const PLACEHOLDER_KINDS = new Set(["meal", "activity", "travel", "rest", "other"]);
const VALID_INTENT_PACE = new Set(["freedom", "relax", "optimize", "packed"]);
const PLAN_SKELETON_MAX_BLOCKS = 60;

/**
 * plan_trip_skeleton operation labels use this prefix so the frontend can group by day:
 *   "{Weekday} {Mon} {D} — {title}"
 * Example: "Tue Sep 3 — Lunch somewhere near the Colosseum"
 * Locale: en-US (short weekday, short month, day without zero-padding).
 */
export function formatDayLabelPrefix(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  return `${weekday} ${month} ${day}`;
}

export function dayPrefixedLabel(dateStr, title) {
  return `${formatDayLabelPrefix(dateStr)} — ${title}`;
}

const MAX_READ_ROUNDS = 2;

function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const n = Math.ceil((b - a) / (1000 * 60 * 60 * 24));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function resolveTime(args) {
  const provided = typeof args.time === "string" && args.time.trim();
  const scheduledTime = provided
    ? args.time.trim()
    : args.type === "restaurant"
      ? "20:00"
      : "10:00";
  const timeConfidence =
    args.timeConfidence === "confirmed" || args.timeConfidence === "guess"
      ? args.timeConfidence
      : provided
        ? "confirmed"
        : "guess";
  return { scheduledTime, timeConfidence };
}

function attractionItem(args, place) {
  const { scheduledTime, timeConfidence } = resolveTime(args);
  const openingHours =
    place?.openingHours || normalizeOpeningHours(args.openingHours);
  const { lat, lng } = (() => {
    if (place?.lat != null || place?.lng != null) {
      return { lat: place.lat ?? null, lng: place.lng ?? null };
    }
    const loc = place?.location;
    return { lat: loc?.lat ?? null, lng: loc?.lng ?? null };
  })();

  const item = {
    id: randomUUID(),
    type: args.type,
    attractionType: args.type,
    name: place?.name || args.name,
    location: place?.address || args.location || "",
    address: place?.address || args.location || "",
    scheduledDate: args.date || "",
    scheduledTime,
    timeConfidence,
    status:
      args.status === "planned" || args.status === "booked" ? args.status : "idea",
    notes: args.notes || "",
    rating: place?.rating ?? null,
    placeId: place?.placeId || null,
    photoReference: place?.photoReference || null,
    createdAt: new Date(),
  };

  if (openingHours) item.openingHours = openingHours;
  const website = args.website || place?.website;
  if (website) item.website = website;
  if (args.bookingUrl) item.bookingUrl = args.bookingUrl;
  else if (args.sourceUrl) item.bookingUrl = args.sourceUrl;
  if (args.price != null) item.price = args.price;
  if (args.currency) item.currency = args.currency;
  if (args.durationMinutes != null) item.durationMinutes = args.durationMinutes;
  if (args.meetingPoint) item.meetingPoint = args.meetingPoint;
  if (args.meetingPointPlaceId) item.meetingPointPlaceId = args.meetingPointPlaceId;
  if (args.confirmationRef) item.confirmationRef = args.confirmationRef;
  if (lat != null) item.lat = lat;
  if (lng != null) item.lng = lng;

  return item;
}

function findItem(trip, entity, itemId) {
  const field = ENTITY_FIELD[entity];
  return (trip?.[field] || []).find((it) => it.id === itemId) || null;
}

function normalizeChecklistText(text) {
  return typeof text === "string" ? text.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function checklistTextExists(trip, text, extraTexts = []) {
  const needle = normalizeChecklistText(text);
  if (!needle) return true;
  const seen = new Set(
    [...(trip?.checklist || []), ...extraTexts].map((item) =>
      normalizeChecklistText(typeof item === "string" ? item : item?.text),
    ),
  );
  return seen.has(needle);
}

function generateChecklistItemId(categoryId) {
  const cat =
    typeof categoryId === "string" && categoryId.trim() && categoryId.trim() !== "custom"
      ? categoryId.trim()
      : null;
  return cat ? `${cat}:${randomUUID()}` : randomUUID();
}

function formatBudgetAmount(amount, currency = "USD") {
  const symbols = { EUR: "€", USD: "$", GBP: "£" };
  const sym = symbols[currency] || `${currency} `;
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${sym}0`;
  return `${sym}${n.toLocaleString("en-US")}`;
}

function buildBudgetPatch(args) {
  const patch = {};
  if (typeof args.totalBudget === "number" && args.totalBudget >= 0) {
    patch.totalBudget = args.totalBudget;
  }
  if (typeof args.currency === "string" && args.currency.trim()) {
    patch.currency = args.currency.trim();
  }
  if (Array.isArray(args.categories)) {
    patch.categories = args.categories
      .filter((cat) => cat && typeof cat === "object")
      .map((cat) => ({
        name: typeof cat.name === "string" ? cat.name.trim() : "",
        budgeted: typeof cat.budgeted === "number" ? cat.budgeted : NaN,
      }))
      .filter((cat) => cat.name && Number.isFinite(cat.budgeted) && cat.budgeted >= 0);
  }
  return patch;
}

function budgetOpLabel(patch, beforeBudget = {}) {
  const currency = patch.currency || beforeBudget.currency || "USD";
  const parts = [];
  if (patch.totalBudget != null) {
    parts.push(`Set budget to ${formatBudgetAmount(patch.totalBudget, currency)}`);
  }
  if (Array.isArray(patch.categories)) {
    for (const cat of patch.categories) {
      parts.push(`Raise ${cat.name} budget to ${formatBudgetAmount(cat.budgeted, currency)}`);
    }
  }
  return parts.join("; ") || "Update trip budget";
}

function normalizePlaceholderKind(kind) {
  if (typeof kind !== "string" || !kind.trim()) return "other";
  const trimmed = kind.trim();
  if (PLACEHOLDER_KINDS.has(trimmed)) return trimmed;
  if (trimmed === "restaurant") return "meal";
  return "other";
}

function defaultTimeForKind(kind) {
  switch (kind) {
    case "meal":
      return "19:00";
    case "travel":
      return "09:00";
    case "rest":
      return "15:00";
    case "activity":
    case "other":
    default:
      return "10:00";
  }
}

function placeholderEventItem({ title, date, time, durationMinutes, kind = "other" }) {
  const validKind = normalizePlaceholderKind(kind);
  const scheduledTime =
    typeof time === "string" && time.trim() ? time.trim() : defaultTimeForKind(validKind);
  const item = {
    id: randomUUID(),
    type: "event",
    attractionType: "event",
    name: String(title).trim(),
    placeholder: true,
    placeholderKind: validKind,
    scheduledDate: typeof date === "string" ? date.slice(0, 10) : "",
    scheduledTime,
    timeConfidence: "guess",
    status: date ? "planned" : "idea",
    notes: "",
    createdAt: new Date(),
  };
  if (durationMinutes != null && Number.isFinite(Number(durationMinutes))) {
    item.durationMinutes = Number(durationMinutes);
  }
  return item;
}

function isSlotOccupied(trip, date, time, pendingOps = []) {
  if (!date || !time) return false;
  const occupiedOnTrip = (trip?.attractions || []).some(
    (a) => a?.scheduledDate === date && a?.scheduledTime === time,
  );
  if (occupiedOnTrip) return true;
  return pendingOps.some(
    (op) =>
      op.entity === "attraction" &&
      op.op === "add" &&
      op.after?.scheduledDate === date &&
      op.after?.scheduledTime === time,
  );
}

function dateInTripRange(date, trip) {
  if (!date || !trip?.startDate || !trip?.endDate) return true;
  const d = String(date).slice(0, 10);
  return d >= String(trip.startDate).slice(0, 10) && d <= String(trip.endDate).slice(0, 10);
}

function buildIntentPatch(args) {
  const patch = {};
  if (typeof args.pace === "string" && VALID_INTENT_PACE.has(args.pace)) patch.pace = args.pace;
  if (Array.isArray(args.vibes)) {
    patch.vibes = args.vibes.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
  }
  if (Array.isArray(args.priorities)) {
    patch.priorities = args.priorities
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => v.trim());
  }
  if (typeof args.notes === "string" && args.notes.trim()) patch.notes = args.notes.trim();
  return patch;
}

function rationaleFromOperations(operations, sourceUrl) {
  const cited = operations.find((op) => op.after?.bookingUrl || sourceUrl);
  const url = sourceUrl || cited?.after?.bookingUrl;
  if (url) {
    const name = cited?.after?.name || "this";
    return `I found hours and a booking link for ${name} on ${hostOf(url)} — because that's their page. You can check it here: ${url}`;
  }

  const guessed = operations.filter(
    (op) => op.entity === "attraction" && op.after?.timeConfidence === "guess",
  );
  if (guessed.length === 1) {
    const time = guessed[0].after?.scheduledTime;
    const name = guessed[0].after?.name || "this";
    return `${time} is my guess for ${name} — because I couldn't find their hours.`;
  }
  return "";
}

function firstSourceUrl(toolCalls) {
  for (const call of toolCalls) {
    const url = call.args?.sourceUrl || call.args?.bookingUrl;
    if (typeof url === "string" && url.trim()) return url.trim();
    for (const act of call.args?.activities || []) {
      const actUrl = act.sourceUrl || act.bookingUrl;
      if (typeof actUrl === "string" && actUrl.trim()) return actUrl.trim();
    }
  }
  return "";
}

function citationUrlsFromSearchResults(webSearchResults) {
  const urls = new Set();
  for (const result of webSearchResults || []) {
    for (const cite of result?.citations || []) {
      if (cite?.url) urls.add(String(cite.url).trim());
    }
  }
  return urls;
}

function findTripIdea(trip, name) {
  const needle = typeof name === "string" ? name.trim().toLowerCase() : "";
  if (!needle) return null;
  return (trip?.attractions || []).find(
    (a) => isIdea(a) && typeof a.name === "string" && a.name.trim().toLowerCase() === needle,
  );
}

function attractionProvenance(args, place, trip, citationUrls) {
  return buildOperationProvenance({
    args,
    place,
    citationUrls,
    matchedIdea: findTripIdea(trip, args.name),
    fromCache: !!place?.placeId,
  });
}

/**
 * Convert the model's tool calls into a single ChangeSet's operations.
 * Enriches attractions with Google Places. Returns the resolved target trip
 * metadata so the caller can persist the proposal.
 */
export async function buildOperations(toolCalls, { trips, activeTripId, webSearchResults = [] }) {
  const operations = [];
  let createsTrip = false;
  let tripName = "";
  let targetTripId = null;
  let createDestination = null;
  let skeletonNotes = [];
  let grouping = null;
  let fromSkeleton = false;
  const citationUrls = citationUrlsFromSearchResults(webSearchResults);

  for (const call of toolCalls) {
    const args = call.args;
    if (call.name === "create_trip") {
      createsTrip = true;
      tripName = args.name;
      createDestination = args.destination;
    } else if (
      (call.name === "update_trip" || call.name === "delete_trip") &&
      args?.tripId
    ) {
      targetTripId = args.tripId;
    } else if (args?.tripId && args.tripId !== NEW_TRIP_REF && !targetTripId) {
      targetTripId = args.tripId;
    }
  }
  if (!createsTrip && !targetTripId) targetTripId = activeTripId || null;

  const targetTrip = trips.find((t) => (t.id || t._id?.toString()) === targetTripId) || null;
  if (!createsTrip && targetTrip) tripName = targetTrip.name;
  const city =
    createDestination ||
    (targetTrip?.destinations?.[0]
      ? typeof targetTrip.destinations[0] === "string"
        ? targetTrip.destinations[0]
        : targetTrip.destinations[0].name
      : null);

  const db = getDb();

  for (const call of toolCalls) {
    const a = call.args || {};
    switch (call.name) {
      case "update_trip": {
        const dest = a.destination ?? targetTrip?.destination;
        const start = a.startDate ?? targetTrip?.startDate;
        const end = a.endDate ?? targetTrip?.endDate;
        const changes = {};
        if (a.name) changes.name = a.name;
        if (a.destination) changes.destination = a.destination;
        if (a.startDate) changes.startDate = a.startDate;
        if (a.endDate) changes.endDate = a.endDate;
        if (dest && start && end) {
          changes.destinations = [{ name: dest, startDate: start, endDate: end }];
        }
        const parts = Object.entries(changes)
          .filter(([k]) => k !== "destinations")
          .map(([k, v]) => `${k} → ${v}`);
        operations.push(
          newOperation({
            op: "update",
            entity: "trip",
            before: {
              name: targetTrip?.name,
              destination: targetTrip?.destination,
              startDate: targetTrip?.startDate,
              endDate: targetTrip?.endDate,
            },
            after: changes,
            label: parts.length ? `Update trip: ${parts.join(", ")}` : "Update trip details",
          }),
        );
        break;
      }
      case "delete_trip":
        operations.push(
          newOperation({
            op: "remove",
            entity: "trip",
            before: {
              name: targetTrip?.name,
              destination: targetTrip?.destination,
              startDate: targetTrip?.startDate,
              endDate: targetTrip?.endDate,
            },
            label: `Delete trip: ${targetTrip?.name || "trip"}`,
          }),
        );
        break;
      case "create_trip":
        operations.push(
          newOperation({
            op: "add",
            entity: "trip",
            after: {
              name: a.name,
              destination: a.destination,
              startDate: a.startDate,
              endDate: a.endDate,
              destinations: [{ name: a.destination, startDate: a.startDate, endDate: a.endDate }],
            },
            label: `${a.name} — ${a.destination} (${a.startDate} → ${a.endDate})`,
          }),
        );
        break;
      case "add_flight":
        operations.push(
          newOperation({
            op: "add",
            entity: "flight",
            after: {
              id: randomUUID(),
              airline: a.airline || "",
              flightNumber: a.flightNumber,
              departure: a.departure,
              arrival: a.arrival,
              date: a.date,
              time: a.time,
              createdAt: new Date(),
            },
            label: `${a.airline ? a.airline + " " : ""}${a.flightNumber}: ${a.departure} → ${a.arrival}, ${a.date} ${a.time}`,
          }),
        );
        break;
      case "add_hotel":
        operations.push(
          newOperation({
            op: "add",
            entity: "hotel",
            after: {
              id: randomUUID(),
              name: a.name,
              address: a.address || "",
              checkIn: a.checkIn,
              checkOut: a.checkOut,
              nights: nightsBetween(a.checkIn, a.checkOut),
              arrivalTime: a.arrivalTime || "15:00",
              createdAt: new Date(),
            },
            label: `${a.name} (${a.checkIn} → ${a.checkOut})`,
          }),
        );
        break;
      case "add_ride":
        operations.push(
          newOperation({
            op: "add",
            entity: "ride",
            after: {
              id: randomUUID(),
              type: a.type || "taxi",
              pickup: a.pickup,
              dropoff: a.dropoff,
              date: a.date,
              time: a.time,
              duration: a.duration || "",
              createdAt: new Date(),
            },
            label: `${a.pickup} → ${a.dropoff}, ${a.date} ${a.time}`,
          }),
        );
        break;
      case "add_attraction": {
        const place = await enrichPlace(a.name, city, db);
        const item = attractionItem(a, place);
        operations.push(
          newOperation({
            op: "add",
            entity: "attraction",
            after: item,
            label: `${item.name}${item.scheduledDate ? ` (${item.scheduledDate} ${item.scheduledTime})` : ""}`,
            provenance: attractionProvenance(a, place, targetTrip, citationUrls),
          }),
        );
        break;
      }
      case "add_activities": {
        for (const act of a.activities || []) {
          const place = await enrichPlace(act.name, city, db);
          const item = attractionItem(act, place);
          operations.push(
            newOperation({
              op: "add",
              entity: "attraction",
              after: item,
              label: `${item.name}${item.scheduledDate ? ` (${item.scheduledDate} ${item.scheduledTime})` : ""}`,
              provenance: attractionProvenance(act, place, targetTrip, citationUrls),
            }),
          );
        }
        break;
      }
      case "update_item": {
        const before = findItem(targetTrip, a.entity, a.itemId);
        const changes = { ...(a.changes || {}) };
        if (changes.time && !changes.scheduledTime) {
          changes.scheduledTime = changes.time;
        }
        if (changes.sourceUrl && !changes.bookingUrl) {
          changes.bookingUrl = changes.sourceUrl;
        }
        delete changes.sourceUrl;
        if (
          changes.scheduledTime &&
          changes.timeConfidence !== "confirmed" &&
          changes.timeConfidence !== "guess"
        ) {
          changes.timeConfidence = "confirmed";
        }
        if (changes.openingHours) {
          const normalized = normalizeOpeningHours(changes.openingHours);
          if (normalized) changes.openingHours = normalized;
        }
        operations.push(
          newOperation({
            op: "update",
            entity: a.entity,
            itemId: a.itemId,
            before,
            after: changes,
            label: `Update ${a.entity}: ${Object.entries(changes)
              .map(([k, v]) => `${k} → ${v}`)
              .join(", ")}`,
            ...(a.entity === "attraction"
              ? {
                  provenance: buildOperationProvenance({
                    args: { ...changes, name: changes.name || before?.name },
                    place: {
                      openingHours: changes.openingHours || before?.openingHours,
                      placeId: before?.placeId,
                    },
                    citationUrls,
                    matchedIdea: before && isIdea(before) ? before : null,
                    fromCache: !!before?.placeId,
                  }),
                }
              : {}),
          }),
        );
        break;
      }
      case "remove_item": {
        const before = findItem(targetTrip, a.entity, a.itemId);
        operations.push(
          newOperation({
            op: "remove",
            entity: a.entity,
            itemId: a.itemId,
            before,
            label: `Remove ${a.entity}${before?.name ? `: ${before.name}` : ""}`,
          }),
        );
        break;
      }
      case "add_checklist_items": {
        if (!Array.isArray(a.items)) break;
        const batchTexts = [];
        for (const raw of a.items) {
          if (!raw || typeof raw !== "object") continue;
          const text = typeof raw.text === "string" ? raw.text.trim() : "";
          if (!text) continue;
          if (checklistTextExists(targetTrip, text, batchTexts)) continue;
          batchTexts.push({ text });
          const categoryId =
            typeof raw.categoryId === "string" && raw.categoryId.trim()
              ? raw.categoryId.trim()
              : undefined;
          const item = {
            id: generateChecklistItemId(categoryId),
            text,
            completed: false,
            ...(categoryId ? { categoryId } : {}),
          };
          operations.push(
            newOperation({
              op: "add",
              entity: "checklist",
              after: item,
              label: `Add "${text}" to packing`,
            }),
          );
        }
        break;
      }
      case "remove_checklist_item": {
        const itemId = typeof a.itemId === "string" ? a.itemId.trim() : "";
        if (!itemId) break;
        const before = findItem(targetTrip, "checklist", itemId);
        operations.push(
          newOperation({
            op: "remove",
            entity: "checklist",
            itemId,
            before,
            label: before?.text
              ? `Remove "${before.text}" from packing`
              : "Remove item from packing",
          }),
        );
        break;
      }
      case "set_trip_budget": {
        const patch = buildBudgetPatch(a);
        if (
          patch.totalBudget == null &&
          !patch.currency &&
          (!patch.categories || patch.categories.length === 0)
        ) {
          break;
        }
        operations.push(
          newOperation({
            op: "update",
            entity: "budget",
            before: targetTrip?.budget || null,
            after: patch,
            label: budgetOpLabel(patch, targetTrip?.budget),
          }),
        );
        break;
      }
      case "add_placeholder_event": {
        const title = typeof a.title === "string" ? a.title.trim() : "";
        if (!title) break;
        const kind = normalizePlaceholderKind(a.kind);
        const date = typeof a.date === "string" ? a.date.slice(0, 10) : "";
        const explicitTime = typeof a.time === "string" && a.time.trim() ? a.time.trim() : null;
        const time = explicitTime || defaultTimeForKind(kind);
        if (date && isSlotOccupied(targetTrip, date, time, operations)) break;
        const item = placeholderEventItem({
          title,
          date,
          time: explicitTime,
          durationMinutes: a.durationMinutes,
          kind,
        });
        operations.push(
          newOperation({
            op: "add",
            entity: "attraction",
            after: item,
            label: date
              ? dayPrefixedLabel(date, title)
              : `${title} (unscheduled placeholder)`,
            groupKey: date || null,
            provenance: {
              origin: "model_guess",
              verified: false,
              sourceUrl: null,
              note: "Open slot — no venue yet",
            },
          }),
        );
        break;
      }
      case "plan_trip_skeleton": {
        if (!Array.isArray(a.days)) break;
        fromSkeleton = true;
        grouping = "byDay";
        const sortedDays = [...a.days]
          .filter((day) => day && typeof day === "object" && typeof day.date === "string")
          .sort((left, right) => String(left.date).localeCompare(String(right.date)));

        let blockCount = 0;
        const skippedDates = [];

        for (const day of sortedDays) {
          const date = day.date.slice(0, 10);
          if (!dateInTripRange(date, targetTrip)) {
            skippedDates.push(date);
            continue;
          }
          const blocks = Array.isArray(day.blocks) ? day.blocks : [];
          const sortedBlocks = [...blocks].sort((left, right) => {
            const lt = typeof left?.time === "string" ? left.time : "99:99";
            const rt = typeof right?.time === "string" ? right.time : "99:99";
            return lt.localeCompare(rt);
          });

          for (const block of sortedBlocks) {
            if (blockCount >= PLAN_SKELETON_MAX_BLOCKS) break;
            if (!block || typeof block !== "object") continue;
            const title = typeof block.title === "string" ? block.title.trim() : "";
            if (!title) continue;

            const kind = normalizePlaceholderKind(block.kind);
            const explicitTime = typeof block.time === "string" && block.time.trim() ? block.time.trim() : null;
            const time = explicitTime || defaultTimeForKind(kind);
            if (isSlotOccupied(targetTrip, date, time, operations)) continue;


            const placeName =
              typeof block.placeName === "string" ? block.placeName.trim() : "";
            if (placeName) {
              const place = await enrichPlace(placeName, city, db);
              const item = attractionItem(
                {
                  type: "attraction",
                  name: placeName,
                  date,
                  time: explicitTime,
                  durationMinutes: block.durationMinutes,
                  status: "planned",
                },
                place,
              );
              operations.push(
                newOperation({
                  op: "add",
                  entity: "attraction",
                  after: item,
                  label: dayPrefixedLabel(date, item.name),
                  groupKey: date,
                  provenance: attractionProvenance(
                    {
                      type: "attraction",
                      name: placeName,
                      date,
                      time: explicitTime,
                    },
                    place,
                    targetTrip,
                    citationUrls,
                  ),
                }),
              );
            } else {
              const item = placeholderEventItem({
                title,
                date,
                time: explicitTime,
                durationMinutes: block.durationMinutes,
                kind,
              });
              operations.push(
                newOperation({
                  op: "add",
                  entity: "attraction",
                  after: item,
                  label: dayPrefixedLabel(date, title),
                  groupKey: date,
                  provenance: {
                    origin: "model_guess",
                    verified: false,
                    sourceUrl: null,
                    note: "Skeleton slot — unverified",
                  },
                }),
              );
            }
            blockCount += 1;
          }
          if (blockCount >= PLAN_SKELETON_MAX_BLOCKS) break;
        }

        if (operations.length === 0 && skippedDates.length > 0) {
          skeletonNotes.push(
            `All ${skippedDates.length} day(s) were outside the trip dates (${skippedDates.join(", ")}). Pick dates between ${targetTrip?.startDate} and ${targetTrip?.endDate}.`,
          );
        } else if (skippedDates.length > 0) {
          skeletonNotes.push(
            `Skipped ${skippedDates.length} day(s) outside the trip dates (${skippedDates.join(", ")}).`,
          );
        }
        if (blockCount >= PLAN_SKELETON_MAX_BLOCKS) {
          skeletonNotes.push(
            `Too many blocks — capped at ${PLAN_SKELETON_MAX_BLOCKS}. Split the plan or trim blocks and try again.`,
          );
        }
        if (typeof a.summary === "string" && a.summary.trim()) {
          skeletonNotes.unshift(a.summary.trim());
        }
        if (operations.filter((op) => op.groupKey).length === 0) {
          grouping = null;
        }
        break;
      }
      case "set_trip_intent": {
        const patch = buildIntentPatch(a);
        if (Object.keys(patch).length === 0) break;
        const merged = mergeTripIntent(targetTrip?.intent, { ...patch, source: "loka" }, {
          source: "loka",
        });
        if (!merged) break;
        operations.push(
          newOperation({
            op: "update",
            entity: "trip",
            before: { intent: targetTrip?.intent || null },
            after: { intent: merged },
            label: "Update trip preferences",
          }),
        );
        break;
      }
      case "web_search":
      case "recall":
      case "whats_needed":
      case "remember":
      case "ask_user":
      case "think_it_through":
        break;
      default:
        throw new Error(`Unknown tool: ${call.name}`);
    }
  }

  const baseRationale = rationaleFromOperations(operations, firstSourceUrl(toolCalls));
  const rationale =
    skeletonNotes.length > 0
      ? [baseRationale, ...skeletonNotes].filter(Boolean).join(" ")
      : baseRationale;

  return {
    operations,
    createsTrip,
    tripName,
    targetTripId,
    rationale,
    grouping,
    fromSkeleton,
  };
}

function toApiToolCalls(toolCalls) {
  return toolCalls.map((t, i) => ({
    id: t.id || `call_${i}_${t.name || "tool"}`,
    type: "function",
    function: {
      name: t.name,
      arguments: JSON.stringify(t.args || {}),
    },
  }));
}

async function executeWhatsNeeded({ tripId, activeTripId, trips = [], userId, profile = null }) {
  const targetId = tripId || activeTripId;
  if (!targetId) {
    return { ok: false, error: "no trip" };
  }
  const trip = trips.find((t) => (t.id || t._id?.toString()) === targetId);
  if (!trip) {
    return { ok: false, error: "trip not found" };
  }
  const db = getDb();
  const axes =
    db && userId ? await getAxes(db, targetId, userId, { trip }) : [];
  const assessment = assessTripIntegrity(trip, {
    axes,
    now: new Date(),
    profile,
  });
  const { findings, rationale } = whatTripNeedsNow(assessment.findings, { limit: 12 });
  return {
    ok: true,
    tripId: targetId,
    rationale,
    summary: assessment.summary,
    findings: findings.map((f) => ({
      id: f.id,
      code: f.code,
      axisIds: f.axisIds,
      kind: f.kind,
      severity: f.severity,
      blocking: f.blocking,
      deadline: f.deadline,
      urgency: f.urgency,
      title: f.title,
      detail: f.detail,
      evidence: f.evidence,
      entities: f.entities,
      resolution: f.resolution,
    })),
  };
}

async function runThinkTools(toolCalls, {
  tripId,
  trips,
  userId,
  profile,
  webSearchResults = [],
}) {
  const messages = [];
  /** @type {object|null} */
  let outcome = null;
  const db = getDb();

  for (const call of toolCalls) {
    const id = call.id || `call_th_${call.name || "tool"}`;
    if (call.name !== "think_it_through") continue;

    const args = call.args || {};
    const targetId = args.tripId || tripId;
    const trip = trips.find((t) => (t.id || t._id?.toString()) === targetId) || null;

    let payload;
    if (!targetId || !trip) {
      payload = { ok: false, error: "trip not found" };
    } else {
      payload = await executeThinkItThrough(db, {
        tripId: targetId,
        userId,
        trip,
        profile,
        args,
        now: () => new Date(),
      });
      outcome = payload;
    }

    messages.push({
      role: "tool",
      tool_call_id: id,
      content: JSON.stringify(payload),
    });
  }

  return { messages, outcome, webSearchResults };
}

async function runReadOnlyTools(toolCalls, searchesUsed, { tripId, trips, userId, profile } = {}) {
  const messages = [];
  const webSearchResults = [];
  let used = searchesUsed;
  const db = getDb();

  for (const call of toolCalls) {
    const id = call.id || `call_${used}_${call.name || "tool"}`;

    if (call.name === "recall") {
      let payload;
      if (!tripId) {
        payload = { ok: false, error: "no active trip" };
      } else {
        payload = await recallAxis(db, tripId, call.args?.axisId);
      }
      messages.push({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(payload),
      });
      continue;
    }

    if (call.name === "whats_needed") {
      const payload = await executeWhatsNeeded({
        tripId: call.args?.tripId,
        activeTripId: tripId,
        trips,
        userId,
        profile,
      });
      messages.push({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(payload),
      });
      continue;
    }

    if (call.name !== "web_search") continue;

    let payload;
    if (used >= MAX_WEB_SEARCHES_PER_TURN) {
      payload = {
        ok: false,
        error: "limit",
        text: "",
        citations: [],
      };
    } else {
      used += 1;
      try {
        payload = await webSearch(call.args?.query);
      } catch {
        payload = { ok: false, error: "failed", text: "", citations: [] };
      }
      webSearchResults.push(payload);
    }

    messages.push({
      role: "tool",
      tool_call_id: id,
      content: JSON.stringify(payload),
    });
  }

  return { messages, searchesUsed: used, webSearchResults };
}

async function runMemoryTools(toolCalls, { tripId, userId, memoryUsed }) {
  const messages = [];
  let used = memoryUsed;
  const db = getDb();

  for (const call of toolCalls) {
    const id = call.id || `call_mem_${used}_${call.name || "tool"}`;
    if (call.name !== "remember") continue;

    let payload;
    if (!tripId || !userId) {
      payload = { ok: false, error: "no active trip" };
    } else if (used >= MAX_REMEMBER_PER_TURN) {
      payload = { ok: false, error: "limit", max: MAX_REMEMBER_PER_TURN };
    } else {
      used += 1;
      payload = await applyRemember(db, { tripId, userId, args: call.args || {} });
    }

    messages.push({
      role: "tool",
      tool_call_id: id,
      content: JSON.stringify(payload),
    });
  }

  return { messages, memoryUsed: used };
}

/**
 * Stream a chat completion, invoking onToken for each text delta. Accumulates
 * tool calls (their arguments arrive incrementally). Returns { content, toolCalls }.
 */
async function streamCompletion(openai, messages, { tools, onToken }) {
  const stream = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    ...(tools ? { tools, tool_choice: "auto" } : {}),
    stream: true,
  });

  let content = "";
  const toolAcc = [];

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      content += delta.content;
      if (onToken) onToken(delta.content);
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolAcc[idx]) toolAcc[idx] = { id: "", name: "", arguments: "" };
        if (tc.id) toolAcc[idx].id = tc.id;
        if (tc.function?.name) toolAcc[idx].name = tc.function.name;
        if (tc.function?.arguments) toolAcc[idx].arguments += tc.function.arguments;
      }
    }
  }

  const toolCalls = toolAcc
    .filter(Boolean)
    .map((t, i) => {
      let args = {};
      try {
        args = JSON.parse(t.arguments || "{}");
      } catch {
        args = {};
      }
      return {
        id: t.id || `call_${i}_${t.name || "tool"}`,
        name: t.name,
        args,
      };
    });

  return { content, toolCalls };
}

function splitToolCalls(toolCalls) {
  const reads = [];
  const thinks = [];
  const memory = [];
  const asks = [];
  const writes = [];
  for (const call of toolCalls) {
    if (READ_ONLY_TOOLS.has(call.name)) reads.push(call);
    else if (THINK_TOOLS.has(call.name)) thinks.push(call);
    else if (MEMORY_TOOLS.has(call.name)) memory.push(call);
    else if (ASK_USER_TOOLS.has(call.name)) asks.push(call);
    else writes.push(call);
  }
  return { reads, thinks, memory, asks, writes };
}

function emptyResult(activeTripId) {
  return {
    text: "",
    operations: [],
    summary: "",
    rationale: "",
    createsTrip: false,
    tripName: "",
    targetTripId: activeTripId,
    questionSet: null,
    deliberation: null,
    deferredResearch: false,
  };
}

async function finishWithDeliberationQuestion(openai, messages, rawQuestions, deliberationOutcome, {
  onToken,
  tripId,
  userId,
}) {
  const questionResult = await finishWithProgrammaticAsk(openai, messages, rawQuestions, {
    onToken,
    tripId,
    userId,
  });
  return {
    ...questionResult,
    deliberation: deliberationOutcome,
  };
}

async function finishWithDeferredResearch(openai, messages, deliberationOutcome, { onToken, tripId }) {
  const intro =
    "You started looking into a broad itinerary request asynchronously. Tell the user in one friendly sentence that you are working through the options and will ping them when ready — do not propose changes or list places yet.";

  const followupMessages = [...messages, { role: "system", content: intro }];
  const second = await streamCompletion(openai, followupMessages, { tools: null, onToken });

  return {
    ...emptyResult(tripId),
    text:
      second.content ||
      "Give me a bit — I'm working through the options and will ping you when I've landed on something worth proposing.",
    deliberation: deliberationOutcome,
    deferredResearch: true,
  };
}

async function finishWithProgrammaticAsk(openai, messages, rawQuestions, { onToken, tripId, userId }) {
  const db = getDb();
  let questionSet = null;

  if (db && tripId && userId && rawQuestions?.length > 0) {
    const sanitized = await sanitizeQuestionSet(db, rawQuestions, { tripId, userId });
    if (sanitized.ok) {
      questionSet = { tripId, questions: sanitized.questions };
    }
  }

  const intro = questionSet
    ? "You need a quick preference check before building the itinerary (question card below). Introduce it in one friendly sentence — why you need their pick. Do not list every option; the card shows them."
    : "You tried to ask a question but it was filtered (duplicate, cooldown, or invalid). Reply briefly without re-asking.";

  const followupMessages = [
    ...messages,
    { role: "system", content: intro },
  ];

  const second = await streamCompletion(openai, followupMessages, { tools: null, onToken });

  return {
    ...emptyResult(tripId),
    text: second.content || (questionSet ? "Quick question for you:" : "How can I help with your trip?"),
    questionSet,
  };
}

async function finishWithAskUser(openai, messages, askCalls, { onToken, tripId, userId }) {
  const rawQuestions = askCalls[0]?.args?.questions || [];
  const db = getDb();
  let questionSet = null;

  if (db && tripId && userId && rawQuestions.length > 0) {
    const sanitized = await sanitizeQuestionSet(db, rawQuestions, { tripId, userId });
    if (sanitized.ok) {
      questionSet = { tripId, questions: sanitized.questions };
    }
  }

  const intro = questionSet
    ? "You asked the user a short multiple-choice question card (shown below your reply). Introduce it in one friendly sentence — why you need their pick, tied to the gap it closes. Do not list every option; the card shows them."
    : "You tried to ask a question but it was filtered (duplicate, cooldown, or invalid). Reply briefly without re-asking.";

  const followupMessages = [
    ...messages,
    {
      role: "system",
      content: intro,
    },
  ];

  const second = await streamCompletion(openai, followupMessages, { tools: null, onToken });

  return {
    ...emptyResult(tripId),
    text: second.content || (questionSet ? "Quick question for you:" : "How can I help with your trip?"),
    questionSet,
  };
}

const UNCONFIGURED_TEXT = "I lost my signal for a sec — try me again?";

/**
 * Run one assistant turn.
 *
 * @param {object} args
 * @param {object[]} args.history  prior messages [{ role, content }] (chronological)
 * @param {object[]} args.trips    the user's trips (full docs)
 * @param {object|null} args.profile  user memory/profile (Milestone 2)
 * @param {string|null} args.activeTripId  trip the user is viewing
 * @param {string|null} [args.userId]
 * @param {string} [args.userMessage]  latest user text (axis relevance)
 * @param {(delta: string) => void} [args.onToken]  streaming callback
 * @returns {Promise<{ text: string, operations: object[], summary: string, rationale: string, createsTrip: boolean, tripName: string, targetTripId: string|null, questionSet: object|null }>}
 */
export async function runAssistant({
  history = [],
  trips = [],
  profile = null,
  activeTripId = null,
  userId = null,
  userMessage = "",
  isGroupChat = false,
  groupParticipants = [],
  onToken,
}) {
  const openai = getOpenAI();
  if (!openai) {
    return {
      text: UNCONFIGURED_TEXT,
      operations: [],
      summary: "",
      rationale: "",
      createsTrip: false,
      tripName: "",
      targetTripId: null,
      questionSet: null,
    };
  }

  const db = getDb();
  let integrityBlock = "";
  let axisBlock = "";
  if (db && activeTripId && userId) {
    const activeTrip =
      trips.find((t) => (t.id || t._id?.toString()) === activeTripId) || null;
    const axes = await getAxes(db, activeTripId, userId, { trip: activeTrip });
    const readiness = activeTrip
      ? readinessForPrompt(computeTripReadiness(activeTrip))
      : null;
    const integrityAssessment = activeTrip
      ? assessTripIntegrity(activeTrip, { axes, now: new Date(), profile })
      : null;
    if (readiness && integrityAssessment?.findings?.length) {
      const integrityAxes = [
        ...new Set(integrityAssessment.findings.flatMap((f) => f.axisIds)),
      ].slice(0, 3);
      readiness.nextUp = [
        ...new Set([...(readiness.nextUp || []), ...integrityAxes]),
      ];
    }
    const { fullIds } = selectRelevantAxes(axes, { userMessage, readiness });
    const axisBlockRaw = buildAxisBrief(axes, {
      fullIds,
      charBudget: TRIP_ATTENTION_CHAR_BUDGET,
    });
    ({ integrityBlock, axisBlock } = buildTripAttentionContext({
      integrityAssessment,
      axisBlockRaw,
      charBudget: TRIP_ATTENTION_CHAR_BUDGET,
    }));
  }

  const system = buildSystemPrompt({
    trips,
    profile,
    activeTripId,
    isGroupChat,
    groupParticipants,
    axisBlock,
    integrityBlock,
  });
  let messages = [{ role: "system", content: system }, ...history];

  let last = await streamCompletion(openai, messages, {
    tools: TOOL_DEFINITIONS,
    onToken,
  });

  let searchesUsed = 0;
  let memoryUsed = 0;
  let webSearchResults = [];
  /** @type {object|null} */
  let deliberationOutcome = null;
  let thinkUsedThisTurn = false;

  for (let round = 0; round < MAX_READ_ROUNDS; round += 1) {
    const { reads, thinks, memory, asks } = splitToolCalls(last.toolCalls);
    if (asks.length > 0) {
      return finishWithAskUser(openai, messages, asks.slice(0, 1), {
        onToken,
        tripId: activeTripId,
        userId,
      });
    }
    if (reads.length === 0 && memory.length === 0 && thinks.length === 0) break;

    const readCalls = reads.map((call, i) => ({
      ...call,
      id: call.id || `call_r_${round}_${i}_${call.name || "tool"}`,
    }));
    const thinkCalls = thinks.map((call, i) => ({
      ...call,
      id: call.id || `call_t_${round}_${i}_${call.name || "tool"}`,
    }));
    const memCalls = memory.map((call, i) => ({
      ...call,
      id: call.id || `call_m_${round}_${i}_${call.name || "tool"}`,
    }));

    const apiCalls = toApiToolCalls([...readCalls, ...thinkCalls, ...memCalls]);
    messages = [
      ...messages,
      {
        role: "assistant",
        content: last.content || null,
        tool_calls: apiCalls,
      },
    ];

    const readExecuted = await runReadOnlyTools(readCalls, searchesUsed, {
      tripId: activeTripId,
      trips,
      userId,
      profile,
    });
    searchesUsed = readExecuted.searchesUsed;
    webSearchResults = webSearchResults.concat(readExecuted.webSearchResults || []);
    const thinkExecuted = await runThinkTools(thinkCalls, {
      tripId: activeTripId,
      trips,
      userId,
      profile,
      webSearchResults,
    });
    if (thinkExecuted.outcome) {
      deliberationOutcome = thinkExecuted.outcome;
      thinkUsedThisTurn = true;
    }
    if (deliberationOutcome?.deferred) {
      return finishWithDeferredResearch(openai, messages, deliberationOutcome, {
        onToken,
        tripId: activeTripId,
      });
    }
    if (deliberationOutcome?.questions?.length) {
      return finishWithDeliberationQuestion(
        openai,
        messages,
        deliberationOutcome.questions,
        deliberationOutcome,
        { onToken, tripId: activeTripId, userId },
      );
    }
    const memExecuted = await runMemoryTools(memCalls, {
      tripId: activeTripId,
      userId,
      memoryUsed,
    });
    memoryUsed = memExecuted.memoryUsed;
    messages = [
      ...messages,
      ...readExecuted.messages,
      ...thinkExecuted.messages,
      ...memExecuted.messages,
    ];

    last = await streamCompletion(openai, messages, {
      tools: TOOL_DEFINITIONS,
      onToken,
    });
  }

  const { asks, writes } = splitToolCalls(last.toolCalls);
  if (asks.length > 0) {
    return finishWithAskUser(openai, messages, asks.slice(0, 1), {
      onToken,
      tripId: activeTripId,
      userId,
    });
  }

  if (
    !thinkUsedThisTurn &&
    isBroadPlanningMessage(userMessage) &&
    isBroadItineraryWrite(writes) &&
    activeTripId
  ) {
    const activeTrip =
      trips.find((t) => (t.id || t._id?.toString()) === activeTripId) || null;
    if (activeTrip && db) {
      deliberationOutcome = await executeThinkItThrough(db, {
        tripId: activeTripId,
        userId,
        trip: activeTrip,
        profile,
        args: {
          tripId: activeTripId,
          decision: { intent: userMessage, limit: 4 },
        },
      });
      thinkUsedThisTurn = true;
      if (deliberationOutcome?.deferred) {
        return finishWithDeferredResearch(openai, messages, deliberationOutcome, {
          onToken,
          tripId: activeTripId,
        });
      }
      if (deliberationOutcome?.questions?.length) {
        return finishWithDeliberationQuestion(
          openai,
          messages,
          deliberationOutcome.questions,
          deliberationOutcome,
          { onToken, tripId: activeTripId, userId },
        );
      }
    }
  }

  if (deliberationOutcome?.questions?.length) {
    return finishWithDeliberationQuestion(
      openai,
      messages,
      deliberationOutcome.questions,
      deliberationOutcome,
      { onToken, tripId: activeTripId, userId },
    );
  }

  if (writes.length === 0) {
    if (deliberationOutcome?.operations?.length && !deliberationOutcome?.questions?.length) {
      const targetTrip =
        trips.find((t) => (t.id || t._id?.toString()) === activeTripId) || null;
      const gate = await runWriteGate(db, {
        operations: deliberationOutcome.operations,
        trip: targetTrip,
        tripId: activeTripId,
        userId,
        webSearchResults,
        fromSkeleton: false,
        userMessage,
      });
      if (gate.action === "ask") {
        return finishWithDeliberationQuestion(openai, messages, gate.questions, deliberationOutcome, {
          onToken,
          tripId: activeTripId,
          userId,
        });
      }
      const finalOperations = gate.operations;
      const followupMessages = [
        ...messages,
        {
          role: "system",
          content:
            "You deliberated and have a verified proposal ready (shown as a review card). Write 1-3 sentences: why this one, what you rejected and why. Conversational — not a report.",
        },
      ];
      const second = await streamCompletion(openai, followupMessages, { tools: null, onToken });
      return {
        text:
          second.content ||
          "Here's what actually fits — review the card when you're ready.",
        operations: finalOperations,
        summary: summarizeOperations(finalOperations),
        rationale: deliberationOutcome.decisions?.[0]?.reasoning || "",
        createsTrip: false,
        tripName: targetTrip?.name || "",
        targetTripId: activeTripId,
        questionSet: null,
        deliberation: deliberationOutcome,
        deferredResearch: false,
      };
    }
    return {
      text: last.content || "How can I help with your trip?",
      operations: [],
      summary: "",
      rationale: "",
      createsTrip: false,
      tripName: "",
      targetTripId: activeTripId,
      questionSet: null,
      deliberation: deliberationOutcome,
      deferredResearch: false,
    };
  }

  if (deliberationOutcome?.questions?.length) {
    return finishWithDeliberationQuestion(
      openai,
      messages,
      deliberationOutcome.questions,
      deliberationOutcome,
      { onToken, tripId: activeTripId, userId },
    );
  }

  const built = await buildOperations(writes, { trips, activeTripId, webSearchResults });
  let mergedOperations = attachDeliberationToOperations(
    built.operations,
    deliberationOutcome,
  );

  const targetTrip =
    trips.find((t) => (t.id || t._id?.toString()) === (built.targetTripId || activeTripId)) ||
    null;

  const gate = await runWriteGate(db, {
    operations: mergedOperations,
    trip: targetTrip,
    tripId: built.targetTripId || activeTripId,
    userId,
    webSearchResults,
    fromSkeleton: built.fromSkeleton,
    userMessage,
  });

  if (gate.action === "ask") {
    return finishWithProgrammaticAsk(openai, messages, gate.questions, {
      onToken,
      tripId: built.targetTripId || activeTripId,
      userId,
    });
  }

  const finalOperations = gate.operations;
  const downgradedOps = (gate.action === "downgrade" ? gate.operations : []).filter(
    (op) => op.provenance?.note?.startsWith("Couldn't confirm"),
  );

  const toolEcho = writes
    .map((c) => `${c.name}(${JSON.stringify(c.args)})`)
    .join("; ");

  const downgradeHint =
    gate.action === "downgrade"
      ? `Some specific venues could not be verified for their proposed date/time and were changed to open placeholder slots instead: ${downgradedOps.map((op) => op.after?.name || "slot").join(", ") || "see card"}. In your reply, name the check you ran (hours / availability) and say plainly what you could not confirm — do not imply confidence. `
      : deliberationOutcome
        ? "You deliberated before proposing. In your reply, briefly say why this pick and mention one thing you ruled out and why — conversational, not a report. "
        : "";

  const followupMessages = [
    ...messages,
    {
      role: "system",
      content:
        `You proposed these changes (they are now shown to the user as a reviewable card with Apply/Reject): ${toolEcho}. ` +
        (built.rationale ? `Card note: ${built.rationale} ` : "") +
        downgradeHint +
        `Write a short, friendly natural-language reply (1-3 sentences) describing what you proposed. ` +
        `One idea, with a because. If a time is a guess, say so. If you used a web page, name it so they can check. ` +
        `Do NOT ask for confirmation — the card handles that. Do not list every field; the card shows details.`,
    },
  ];

  const second = await streamCompletion(openai, followupMessages, { tools: null, onToken });

  return {
    text: second.content || "Here's what I'd change — review the card and apply when ready.",
    operations: finalOperations,
    summary: summarizeOperations(finalOperations),
    rationale: built.rationale || "",
    createsTrip: built.createsTrip,
    tripName: built.tripName,
    targetTripId: built.targetTripId,
    questionSet: null,
    deliberation: deliberationOutcome,
    deferredResearch: false,
  };
}

export { executeWhatsNeeded, executeThinkItThrough };
