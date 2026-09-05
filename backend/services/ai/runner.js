import { randomUUID } from "crypto";
import { getDb } from "../../config/database.js";
import { getOpenAI, CHAT_MODEL } from "./openaiClient.js";
import { READ_ONLY_TOOLS, TOOL_DEFINITIONS } from "./tools.js";
import { buildSystemPrompt } from "./prompt.js";
import { newOperation, summarizeOperations, NEW_TRIP_REF } from "./changeset.js";
import { enrichPlace, normalizeOpeningHours } from "./places.js";
import { MAX_WEB_SEARCHES_PER_TURN, webSearch } from "./webSearch.js";
import { claimsCompletedWrite, honestNoProposalText } from "./replyGuard.js";

const ENTITY_FIELD = {
  flight: "flights",
  hotel: "hotels",
  ride: "rides",
  attraction: "attractions",
};

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

/**
 * Convert the model's tool calls into a single ChangeSet's operations.
 * Enriches attractions with Google Places. Returns the resolved target trip
 * metadata so the caller can persist the proposal.
 */
async function buildOperations(toolCalls, { trips, activeTripId }) {
  const operations = [];
  let createsTrip = false;
  let tripName = "";
  let targetTripId = null;
  let createDestination = null;

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
      case "web_search":
        break;
      default: {
        const _exhaustive = call.name;
        void _exhaustive;
        break;
      }
    }
  }

  return {
    operations,
    createsTrip,
    tripName,
    targetTripId,
    rationale: rationaleFromOperations(operations, firstSourceUrl(toolCalls)),
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

async function runReadOnlyTools(toolCalls, searchesUsed) {
  const messages = [];
  let used = searchesUsed;

  for (const call of toolCalls) {
    const id = call.id || `call_${used}_${call.name || "tool"}`;
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
    }

    messages.push({
      role: "tool",
      tool_call_id: id,
      content: JSON.stringify(payload),
    });
  }

  return { messages, searchesUsed: used };
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
  const writes = [];
  for (const call of toolCalls) {
    if (READ_ONLY_TOOLS.has(call.name)) reads.push(call);
    else writes.push(call);
  }
  return { reads, writes };
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
 * @param {(delta: string) => void} [args.onToken]  streaming callback
 * @returns {Promise<{ text: string, operations: object[], summary: string, rationale: string, createsTrip: boolean, tripName: string, targetTripId: string|null }>}
 */
export async function runAssistant({
  history = [],
  trips = [],
  profile = null,
  activeTripId = null,
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
    };
  }

  const system = buildSystemPrompt({
    trips,
    profile,
    activeTripId,
    isGroupChat,
    groupParticipants,
  });
  let messages = [{ role: "system", content: system }, ...history];

  let last = await streamCompletion(openai, messages, {
    tools: TOOL_DEFINITIONS,
  });

  let searchesUsed = 0;
  for (let round = 0; round < MAX_READ_ROUNDS; round += 1) {
    const { reads } = splitToolCalls(last.toolCalls);
    if (reads.length === 0) break;

    const apiCalls = toApiToolCalls(reads);
    messages = [
      ...messages,
      {
        role: "assistant",
        content: last.content || null,
        tool_calls: apiCalls,
      },
    ];

    const executed = await runReadOnlyTools(
      reads.map((call, i) => ({ ...call, id: apiCalls[i].id })),
      searchesUsed,
    );
    searchesUsed = executed.searchesUsed;
    messages = [...messages, ...executed.messages];

    last = await streamCompletion(openai, messages, {
      tools: TOOL_DEFINITIONS,
    });
  }

  const { writes } = splitToolCalls(last.toolCalls);
  if (writes.length === 0) {
    let text = last.content || "How can I help with your trip?";
    if (claimsCompletedWrite(text)) text = honestNoProposalText(text);
    if (onToken && text) onToken(text);
    return {
      text,
      operations: [],
      summary: "",
      rationale: "",
      createsTrip: false,
      tripName: "",
      targetTripId: activeTripId,
    };
  }

  const built = await buildOperations(writes, { trips, activeTripId });

  if (built.operations.length === 0) {
    let text = last.content || "How can I help with your trip?";
    if (claimsCompletedWrite(text)) text = honestNoProposalText(text);
    if (onToken && text) onToken(text);
    return {
      text,
      operations: [],
      summary: "",
      rationale: "",
      createsTrip: false,
      tripName: built.tripName || "",
      targetTripId: built.targetTripId || activeTripId,
    };
  }

  const toolEcho = writes
    .map((c) => `${c.name}(${JSON.stringify(c.args)})`)
    .join("; ");

  const followupMessages = [
    ...messages,
    {
      role: "system",
      content:
        `You proposed these changes. They are NOT on the trip yet. The app is showing a reviewable card with Apply/Reject: ${toolEcho}. ` +
        (built.rationale ? `Card note: ${built.rationale} ` : "") +
        `Write a short, friendly natural-language reply (1-3 sentences) describing the proposal. ` +
        `Speak as a proposal, not a done deal. Banned phrasing: "I set this up", "I booked", "I scheduled", "I added it", "it's done", "all set", "סידרתי", "קבעתי", "הוספתי", "הזמנתי" as if the trip already changed. ` +
        `One idea, with a because. If a time is a guess, say so. If you used a web page, name it so they can check. ` +
        `Do NOT ask for confirmation — the card is the confirmation. Do not list every field; the card shows details.`,
    },
  ];

  const second = await streamCompletion(openai, followupMessages, { tools: null, onToken });

  return {
    text: second.content || "Here's what I'd change — review the card and apply when ready.",
    operations: built.operations,
    summary: summarizeOperations(built.operations),
    rationale: built.rationale || "",
    createsTrip: built.createsTrip,
    tripName: built.tripName,
    targetTripId: built.targetTripId,
  };
}
