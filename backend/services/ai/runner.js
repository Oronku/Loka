import { randomUUID } from "crypto";
import { getOpenAI, CHAT_MODEL } from "./openaiClient.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { buildSystemPrompt } from "./prompt.js";
import { newOperation, summarizeOperations, NEW_TRIP_REF } from "./changeset.js";
import { enrichPlace } from "./places.js";

const ENTITY_FIELD = {
  flight: "flights",
  hotel: "hotels",
  ride: "rides",
  attraction: "attractions",
};

function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const n = Math.ceil((b - a) / (1000 * 60 * 60 * 24));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function attractionItem(args, place) {
  return {
    id: randomUUID(),
    type: args.type,
    attractionType: args.type,
    name: place?.name || args.name,
    location: place?.address || args.location || "",
    address: place?.address || args.location || "",
    scheduledDate: args.date || "",
    scheduledTime: args.time || (args.type === "restaurant" ? "20:00" : "10:00"),
    notes: args.notes || "",
    rating: place?.rating ?? null,
    placeId: place?.placeId || null,
    photoReference: place?.photoReference || null,
    createdAt: new Date(),
  };
}

function findItem(trip, entity, itemId) {
  const field = ENTITY_FIELD[entity];
  return (trip?.[field] || []).find((it) => it.id === itemId) || null;
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

  // Resolve the target trip id (a create_trip op makes it "new").
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
        const place = await enrichPlace(a.name, city);
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
          const place = await enrichPlace(act.name, city);
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
        operations.push(
          newOperation({
            op: "update",
            entity: a.entity,
            itemId: a.itemId,
            before,
            after: a.changes || {},
            label: `Update ${a.entity}: ${Object.entries(a.changes || {})
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
      default:
        break;
    }
  }

  return { operations, createsTrip, tripName, targetTripId };
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
  const toolAcc = []; // index -> { name, arguments }

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
        if (!toolAcc[idx]) toolAcc[idx] = { name: "", arguments: "" };
        if (tc.function?.name) toolAcc[idx].name = tc.function.name;
        if (tc.function?.arguments) toolAcc[idx].arguments += tc.function.arguments;
      }
    }
  }

  const toolCalls = toolAcc
    .filter(Boolean)
    .map((t) => {
      try {
        return { name: t.name, args: JSON.parse(t.arguments || "{}") };
      } catch {
        return { name: t.name, args: {} };
      }
    });

  return { content, toolCalls };
}

/**
 * Run one assistant turn.
 *
 * @param {object} args
 * @param {object[]} args.history  prior messages [{ role, content }] (chronological)
 * @param {object[]} args.trips    the user's trips (full docs)
 * @param {object|null} args.profile  user memory/profile (Milestone 2)
 * @param {string|null} args.activeTripId  trip the user is viewing
 * @param {(delta: string) => void} [args.onToken]  streaming callback
 * @returns {Promise<{ text: string, operations: object[], summary: string, createsTrip: boolean, tripName: string, targetTripId: string|null }>}
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
      text: "AI is not configured right now. Please add an OpenAI API key.",
      operations: [],
      summary: "",
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
  const baseMessages = [{ role: "system", content: system }, ...history];

  // First pass: stream with tools. Text streams live; tool calls accumulate.
  const first = await streamCompletion(openai, baseMessages, {
    tools: TOOL_DEFINITIONS,
    onToken,
  });

  if (first.toolCalls.length === 0) {
    return {
      text: first.content || "How can I help with your trip?",
      operations: [],
      summary: "",
      createsTrip: false,
      tripName: "",
      targetTripId: activeTripId,
    };
  }

  // Tools were called: build the proposed changeset, then produce a natural
  // language reply that references the proposal (second streaming pass).
  const built = await buildOperations(first.toolCalls, { trips, activeTripId });

  const toolEcho = first.toolCalls
    .map((c) => `${c.name}(${JSON.stringify(c.args)})`)
    .join("; ");

  const followupMessages = [
    ...baseMessages,
    {
      role: "system",
      content:
        `You proposed these changes (they are now shown to the user as a reviewable diff card with Apply/Reject): ${toolEcho}. ` +
        `Write a short, friendly natural-language reply (1-3 sentences) describing what you proposed. ` +
        `Do NOT ask for confirmation — the diff card handles that. Do not list every field; the card shows details.`,
    },
  ];

  const second = await streamCompletion(openai, followupMessages, { tools: null, onToken });

  return {
    text: second.content || "Here's what I'd change — review the diff and apply when ready.",
    operations: built.operations,
    summary: summarizeOperations(built.operations),
    createsTrip: built.createsTrip,
    tripName: built.tripName,
    targetTripId: built.targetTripId,
  };
}
