import { randomUUID } from "crypto";
import { assessTripIntegrity } from "./integrity/index.js";
import { deliberate } from "./deliberation/deliberate.js";
import { DEFAULT_SEARCH_BUDGET } from "./deliberation/constants.js";
import { resolveFindings } from "./resolution/resolveFindings.js";
import { getAxes } from "./axisMemory.js";
import { enrichPlace } from "./places.js";
import { webSearch } from "./webSearch.js";
import { newOperation } from "./changeset.js";
import { buildOperationProvenance } from "./writeGate.js";
import { isIdea } from "./prompt.js";
import { enumerateTripDays, dateOnly } from "../trip/readiness.js";
import { AGENT_RUNS_COLLECTION } from "./agents/locks.js";

function dayPrefixedLabel(dateStr, title) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(title);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  return `${weekday} ${month} ${day} — ${title}`;
}

export const ASYNC_SLOT_THRESHOLD = 4;
export const PENDING_DELIBERATION_KEY_PREFIX = "tripDeliberation:pending:";

/** @typedef {import('./deliberation/constants.js').DeliberationSlot} DeliberationSlot */

function dayHasScheduledPlan(trip, day) {
  return (trip?.attractions || []).some((a) => {
    if (dateOnly(a.scheduledDate) !== day) return false;
    if (a.status === "idea") return false;
    return Boolean(a.scheduledDate || a.status);
  });
}

/**
 * Stable deliberation payload attached to operation provenance for the client.
 * @param {object} decision
 */
export function buildDeliberationProvenance(decision) {
  const chosen = decision?.chosen;
  return {
    slotId: decision?.slotId || null,
    chosen: chosen ? { id: chosen.id, name: chosen.name } : null,
    shortlist: (decision?.shortlist || []).map((c) => ({ id: c.id, name: c.name })),
    rejected: (decision?.rejected || []).map((r) => ({
      option: r.option,
      why: r.why,
    })),
    confidence: decision?.confidence || "low",
    reasoning: decision?.reasoning || "",
  };
}

function mergeProvenance(base, decision) {
  return {
    ...base,
    deliberation: buildDeliberationProvenance(decision),
  };
}

function tripIdeas(trip) {
  return (trip?.attractions || []).filter(isIdea);
}

/**
 * @param {object} trip
 * @param {object} [decision]
 * @returns {DeliberationSlot[]}
 */
export function buildSlotsFromDecision(trip, decision = {}) {
  const limit = typeof decision.limit === "number" ? decision.limit : ASYNC_SLOT_THRESHOLD;
  const explicitDates = Array.isArray(decision.dates)
    ? decision.dates.map((d) => String(d).slice(0, 10)).filter(Boolean)
    : [];
  const emptyDates =
    explicitDates.length > 0
      ? explicitDates
      : enumerateTripDays(trip.startDate, trip.endDate).filter(
          (d) => !dayHasScheduledPlan(trip, d),
        );

  const ideas = tripIdeas(trip);
  const ideaIds = ideas.map((a) => a.id);
  const time =
    typeof decision.time === "string" && decision.time.trim()
      ? decision.time.trim()
      : "14:00";

  return emptyDates.slice(0, limit).map((date) => ({
    slotId: `empty-${date}-${time.replace(":", "")}`,
    axisId: "dayPlan",
    label: decision.intent || `Fill open time on ${date}`,
    query: decision.query || decision.intent || undefined,
    scheduledDate: date,
    scheduledTime: time,
    field: decision.field || "activityPreference",
    ideaIds,
  }));
}

function candidateToItem(chosen, slot) {
  const item = {
    id: randomUUID(),
    type: "activity",
    attractionType: "activity",
    name: chosen.name,
    scheduledDate: slot.scheduledDate || "",
    scheduledTime: slot.scheduledTime || "14:00",
    timeConfidence: chosen.openingHours ? "confirmed" : "guess",
    status: slot.scheduledDate ? "planned" : "idea",
    notes: "",
    rating: chosen.rating ?? null,
    placeId: chosen.placeId || null,
    createdAt: new Date(),
  };
  if (chosen.openingHours) item.openingHours = chosen.openingHours;
  if (chosen.website) item.website = chosen.website;
  if (chosen.bookingUrl) item.bookingUrl = chosen.bookingUrl;
  if (chosen.price != null) item.price = chosen.price;
  if (chosen.currency) item.currency = chosen.currency;
  if (chosen.lat != null) item.lat = chosen.lat;
  if (chosen.lng != null) item.lng = chosen.lng;
  return item;
}

/**
 * @param {object[]} decisions
 * @param {object} trip
 * @param {Set<string>} [citationUrls]
 */
export function operationsFromDecisions(decisions, trip, citationUrls = new Set()) {
  /** @type {object[]} */
  const operations = [];
  for (const decision of decisions) {
    if (!decision?.chosen) continue;
    const slot = decision.slotMeta || {};
    const item = candidateToItem(decision.chosen, slot);
    const matchedIdea = (trip?.attractions || []).find(
      (a) => isIdea(a) && a.id === decision.chosen.id,
    );
    const base = buildOperationProvenance({
      args: {
        name: item.name,
        date: item.scheduledDate,
        time: item.scheduledTime,
        sourceUrl: decision.chosen.sourceUrl,
        bookingUrl: decision.chosen.bookingUrl,
        openingHours: decision.chosen.openingHours,
      },
      place: decision.chosen,
      citationUrls,
      matchedIdea: matchedIdea || null,
      fromCache: !!decision.chosen.placeId,
    });
    operations.push(
      newOperation({
        op: "add",
        entity: "attraction",
        after: item,
        label: item.scheduledDate
          ? dayPrefixedLabel(item.scheduledDate, item.name)
          : item.name,
        groupKey: item.scheduledDate || null,
        provenance: mergeProvenance(base, decision),
      }),
    );
  }
  return operations;
}

function attachSlotMeta(decisions, slots) {
  const byId = new Map(slots.map((s) => [s.slotId, s]));
  return decisions.map((d) => ({
    ...d,
    slotMeta: byId.get(d.slotId) || null,
  }));
}

function serializeDecision(decision) {
  return {
    slotId: decision.slotId,
    chosen: decision.chosen
      ? { id: decision.chosen.id, name: decision.chosen.name }
      : null,
    shortlist: (decision.shortlist || []).map((c) => ({ id: c.id, name: c.name })),
    rejected: decision.rejected || [],
    confidence: decision.confidence,
    reasoning: decision.reasoning,
  };
}

function serializeResolution(resolution) {
  return {
    findingId: resolution.finding?.id,
    code: resolution.finding?.code,
    kind: resolution.kind,
    reasoning: resolution.reasoning,
    blockedWhy: resolution.blockedWhy,
    decision: resolution.decision ? serializeDecision(resolution.decision) : undefined,
    questions: resolution.questions,
    operations: resolution.operations?.length || 0,
  };
}

/**
 * @param {object} args
 * @param {object} trip
 */
export function shouldDeferDeliberation(args, trip) {
  if (args?.defer === true) return { defer: true, reason: "requested" };
  const decision = args?.decision || {};
  const explicitDates = Array.isArray(decision.dates) ? decision.dates.length : 0;
  const emptyCount = explicitDates
    || enumerateTripDays(trip.startDate, trip.endDate).filter((d) => !dayHasScheduledPlan(trip, d)).length;
  if (emptyCount > ASYNC_SLOT_THRESHOLD) {
    return { defer: true, reason: "many_slots" };
  }
  const findingCount =
    (args?.findingIds?.length || 0) + (args?.findingCodes?.length || 0);
  if (findingCount > ASYNC_SLOT_THRESHOLD) {
    return { defer: true, reason: "many_findings" };
  }
  return { defer: false, reason: null };
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} opts
 */
export async function registerDeliberationFollowUp(db, {
  userId,
  tripId,
  args,
  now = new Date(),
}) {
  if (!db || !userId || !tripId) return { ok: false, error: "missing context" };
  const key = `${PENDING_DELIBERATION_KEY_PREFIX}${tripId}`;
  const existing = await db.collection(AGENT_RUNS_COLLECTION).findOne({ userId, key });
  if (existing?.status === "pending" || existing?.status === "running") {
    return { ok: true, duplicate: true, key };
  }
  await db.collection(AGENT_RUNS_COLLECTION).updateOne(
    { userId, key },
    {
      $set: {
        userId,
        key,
        tripId,
        status: "pending",
        args,
        lastAt: now,
        createdAt: existing?.createdAt || now,
      },
    },
    { upsert: true },
  );
  return { ok: true, duplicate: false, key };
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} opts
 */
export async function executeThinkItThrough(db, {
  tripId,
  userId,
  trip,
  profile = null,
  args = {},
  axes: axesIn = null,
  search = webSearch,
  places = enrichPlace,
  llm = null,
  now = () => new Date(),
  searchBudget = DEFAULT_SEARCH_BUDGET,
  skipDefer = false,
}) {
  if (!tripId || !trip) {
    return { ok: false, error: "no trip" };
  }

  const deferCheck = skipDefer ? { defer: false } : shouldDeferDeliberation(args, trip);
  if (deferCheck.defer) {
    if (db && userId) {
      await registerDeliberationFollowUp(db, { userId, tripId, args, now: now() });
    }
    return {
      ok: true,
      deferred: true,
      deferReason: deferCheck.reason,
      decisions: [],
      questions: [],
      blocked: [],
      operations: [],
      resolutions: [],
      searchesUsed: 0,
    };
  }

  const axes =
    axesIn || (db && userId ? await getAxes(db, tripId, userId, { trip }) : []);

  const hasFindings =
    (Array.isArray(args.findingIds) && args.findingIds.length > 0) ||
    (Array.isArray(args.findingCodes) && args.findingCodes.length > 0);

  if (hasFindings) {
    const assessment = assessTripIntegrity(trip, { axes, now: now(), profile });
    let findings = assessment.findings;
    if (args.findingIds?.length) {
      const ids = new Set(args.findingIds);
      findings = findings.filter((f) => ids.has(f.id));
    }
    if (args.findingCodes?.length) {
      const codes = new Set(args.findingCodes);
      findings = findings.filter((f) => codes.has(f.code));
    }

    const resolved = await resolveFindings(db, {
      trip,
      tripId,
      userId,
      axes,
      profile,
      findings,
      limit: args.limit,
      search,
      places,
      llm,
      now,
      searchBudget,
    });

    const questions = resolved.questions || [];
    const resolutions = resolved.resolutions || [];
    /** @type {object[]} */
    const resolutionOps = [];
    for (const resolution of resolutions) {
      for (const op of resolution.operations || []) {
        if (resolution.decision) {
          op.provenance = mergeProvenance(
            op.provenance || {
              origin: "model_guess",
              verified: false,
              sourceUrl: null,
              note: "Deliberated fix",
            },
            resolution.decision,
          );
        }
        resolutionOps.push(op);
      }
    }

    return {
      ok: true,
      mode: "resolve",
      deferred: false,
      decisions: [],
      resolutions: resolutions.map(serializeResolution),
      questions,
      blocked: resolved.blocked || [],
      operations: resolutionOps,
      searchesUsed: resolved.searchesUsed || 0,
      unhandled: (resolved.unhandled || []).map((f) => f.id),
    };
  }

  const slots = buildSlotsFromDecision(trip, args.decision || {});
  if (!slots.length) {
    return { ok: false, error: "no slots to deliberate" };
  }

  const result = await deliberate(db, {
    tripId,
    userId,
    trip,
    axes,
    profile,
    slots,
    search,
    places,
    llm,
    now,
    searchBudget,
    skipCache: true,
  });

  const decisions = attachSlotMeta(result.decisions || [], slots);
  const questions = result.questions || [];
  const operations =
    questions.length > 0 ? [] : operationsFromDecisions(decisions, trip);

  const budgetExhausted =
    (result.searchesUsed || 0) >= searchBudget &&
    decisions.some((d) => !d.chosen && !questions.length);

  if (budgetExhausted && db && userId) {
    await registerDeliberationFollowUp(db, { userId, tripId, args, now: now() });
    return {
      ok: true,
      mode: "deliberate",
      deferred: true,
      deferReason: "search_budget",
      decisions: decisions.map(serializeDecision),
      questions: [],
      blocked: result.blocked || [],
      operations: [],
      searchesUsed: result.searchesUsed || 0,
    };
  }

  return {
    ok: true,
    mode: "deliberate",
    deferred: false,
    decisions: decisions.map(serializeDecision),
    questions,
    blocked: result.blocked || [],
    operations,
    resolutions: [],
    searchesUsed: result.searchesUsed || 0,
  };
}

/**
 * @param {object[]} operations
 * @param {object|null} deliberationOutcome
 */
export function attachDeliberationToOperations(operations, deliberationOutcome) {
  if (!deliberationOutcome?.decisions?.length) return operations;
  const bySlot = new Map(
    deliberationOutcome.decisions.map((d) => [d.slotId, d]),
  );
  return operations.map((op) => {
    if (op.entity !== "attraction" || !op.after?.scheduledDate) return op;
    const slotKey = `empty-${op.after.scheduledDate}-${String(op.after.scheduledTime || "1400").replace(":", "")}`;
    const decision = bySlot.get(slotKey);
    if (!decision || !op.provenance) return op;
    return {
      ...op,
      provenance: mergeProvenance(op.provenance, decision),
    };
  });
}

export function isBroadItineraryWrite(toolCalls) {
  for (const call of toolCalls) {
    if (call.name === "plan_trip_skeleton") return true;
    if (call.name === "add_activities") {
      const count = call.args?.activities?.length || 0;
      if (count >= 2) return true;
    }
  }
  return false;
}

export function isBroadPlanningMessage(message) {
  if (typeof message !== "string" || !message.trim()) return false;
  return /\b(empty|free time|what should we do|fill (the |my )?(afternoon|afternoons|day|days|time|times|slot|slots)|plan (my |the |this )?(trip|days|itinerary|stretch))\b/i.test(
    message,
  );
}
