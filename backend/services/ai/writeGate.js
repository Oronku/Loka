import { randomUUID } from "crypto";
import { resolveGapKind } from "../../models/aiTripAxis.helper.js";
import { normalizeTripIntent } from "../trip.service.js";
import {
  axisHasDecisionForField,
  getAxes,
  openGap,
  recordDecision,
} from "./axisMemory.js";
import { isIdea } from "./prompt.js";

const PLACEHOLDER_KINDS = new Set(["meal", "activity", "travel", "rest", "other"]);

function formatDayLabelPrefix(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  return `${weekday} ${month} ${day}`;
}

function dayPrefixedLabel(dateStr, title) {
  return `${formatDayLabelPrefix(dateStr)} — ${title}`;
}

/** @typedef {'user_idea'|'web_search'|'places_cache'|'user_decision'|'model_guess'} ProvenanceOrigin */

/**
 * @typedef {Object} OperationProvenance
 * @property {ProvenanceOrigin} origin
 * @property {boolean} verified
 * @property {string|null} sourceUrl
 * @property {string} note
 */

function normalizeName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function scheduledDatesFromOps(operations) {
  const dates = new Set();
  for (const op of operations) {
    const date = op.after?.scheduledDate || op.after?.date;
    if (typeof date === "string" && date) dates.add(date.slice(0, 10));
  }
  return dates;
}

function isItineraryWriteOp(op) {
  if (op.entity !== "attraction") return false;
  if (op.op === "add") return !op.after?.placeholder;
  if (op.op === "update") {
    const changes = op.after || {};
    return !!(changes.scheduledDate || changes.scheduledTime || changes.name);
  }
  return false;
}

function isSpecificScheduledVenue(op) {
  if (!isItineraryWriteOp(op)) return false;
  const after = op.after;
  if (!after || after.placeholder) return false;
  const name = typeof after.name === "string" ? after.name.trim() : "";
  const date = after.scheduledDate || after.date;
  const time = after.scheduledTime || after.time;
  return !!(name && date && time);
}

function parseMinutesHHMM(time) {
  if (typeof time !== "string" || !time.includes(":")) return null;
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function googleDayIndex(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

/**
 * @param {{ weekdayText?: string[], periods?: unknown[] }|null|undefined} openingHours
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} timeStr HH:MM
 */
export function openingHoursCover(openingHours, dateStr, timeStr) {
  if (!openingHours || !dateStr || !timeStr) return false;
  const day = googleDayIndex(dateStr);
  const minutes = parseMinutesHHMM(timeStr);
  if (day == null || minutes == null) return false;

  const periods = openingHours.periods;
  if (Array.isArray(periods) && periods.length) {
    for (const period of periods) {
      if (!period?.open) continue;
      const openDay = period.open.day;
      const closeDay = period.close?.day ?? openDay;
      const openMin =
        parseInt(String(period.open.time || "0").slice(0, 2), 10) * 60 +
        parseInt(String(period.open.time || "0").slice(2, 4), 10);
      const closeMin = period.close
        ? parseInt(String(period.close.time).slice(0, 2), 10) * 60 +
          parseInt(String(period.close.time).slice(2, 4), 10)
        : 24 * 60;
      if (openDay === day && closeDay === day && minutes >= openMin && minutes < closeMin) {
        return true;
      }
    }
    return false;
  }

  const weekdayText = openingHours.weekdayText;
  if (Array.isArray(weekdayText) && weekdayText.length) {
    const weekday = new Date(`${dateStr.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
    });
    const line = weekdayText.find((row) => String(row).startsWith(weekday));
    if (!line || /closed/i.test(line)) return false;
    const match = line.match(
      /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?[^0-9–-]+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i,
    );
    if (!match) return true;
    const toMinutes = (hour, min, ampm) => {
      let h = parseInt(hour, 10);
      const m = parseInt(min || "0", 10);
      if (ampm) {
        const upper = ampm.toUpperCase();
        if (upper === "PM" && h < 12) h += 12;
        if (upper === "AM" && h === 12) h = 0;
      }
      return h * 60 + m;
    };
    const openMin = toMinutes(match[1], match[2], match[3]);
    const closeMin = toMinutes(match[4], match[5], match[6]);
    return minutes >= openMin && minutes < closeMin;
  }

  return false;
}

function collectCitationUrls(webSearchResults) {
  const urls = new Set();
  for (const result of webSearchResults || []) {
    for (const cite of result?.citations || []) {
      if (cite?.url) urls.add(String(cite.url).trim());
    }
  }
  return urls;
}

function webSearchBacksUrl(url, citationUrls) {
  if (!url || citationUrls.size === 0) return false;
  return citationUrls.has(String(url).trim());
}

function hasOpenPreferenceGap(axis) {
  return (axis?.gaps || []).some((g) => {
    if (g.status !== "open" || g.severity < 2) return false;
    return resolveGapKind(g) === "preference";
  });
}

function hasPreferencePace(intent, dayPlanAxis) {
  return !!(
    intent.pace ||
    axisHasDecisionForField(dayPlanAxis, "pace") ||
    axisHasDecisionForField(dayPlanAxis, "anchorsPerDay")
  );
}

function hasPreferenceVibes(intent, dayPlanAxis) {
  return !!(intent.vibes?.length || axisHasDecisionForField(dayPlanAxis, "vibes"));
}

function hasPreferenceBudget(intent, moneyAxis) {
  return !!(intent.budgetLevel || axisHasDecisionForField(moneyAxis, "budgetLevel"));
}

/**
 * @param {object} trip
 * @param {object|null} dayPlanAxis
 */
export function tripPreferencesKnown(trip, dayPlanAxis) {
  const intent = normalizeTripIntent(trip?.intent) || trip?.intent || {};
  if (!hasPreferencePace(intent, dayPlanAxis) || !hasPreferenceVibes(intent, dayPlanAxis)) {
    return false;
  }
  if (hasOpenPreferenceGap(dayPlanAxis)) return false;
  return true;
}

function isBroadBatch(operations, { fromSkeleton = false, trip = null } = {}) {
  if (fromSkeleton) return true;

  const itineraryOps = operations.filter(isItineraryWriteOp);
  if (itineraryOps.length >= 4) return true;
  const dates = scheduledDatesFromOps(itineraryOps);
  if (dates.size >= 2) return true;

  if (trip && itineraryOps.length > 0) {
    const filledEmptyDays = countPreviouslyEmptyDaysFilled(trip, itineraryOps);
    if (filledEmptyDays >= 2) return true;
  }

  return false;
}

function countPreviouslyEmptyDaysFilled(trip, itineraryOps) {
  const scheduledByDay = new Map();
  for (const a of trip?.attractions || []) {
    if (isIdea(a)) continue;
    const d = a.scheduledDate;
    if (!d) continue;
    scheduledByDay.set(d, (scheduledByDay.get(d) || 0) + 1);
  }

  const newlyFilled = new Set();
  for (const op of itineraryOps) {
    if (op.op !== "add") continue;
    const date = op.after?.scheduledDate;
    if (!date) continue;
    if ((scheduledByDay.get(date) || 0) === 0) newlyFilled.add(date);
  }
  return newlyFilled.size;
}

function findMatchingIdea(trip, name) {
  const needle = normalizeName(name);
  if (!needle) return null;
  return (trip?.attractions || []).find(
    (a) => isIdea(a) && normalizeName(a.name) === needle,
  );
}

function hasIdeaSchedulingConsent(dayPlanAxis, idea) {
  if (!dayPlanAxis || !idea) return false;
  return (dayPlanAxis.decisions || []).some((d) => d.field === `idea:${idea.id}`);
}

function ideasScheduledWithoutConsent(operations, trip, dayPlanAxis) {
  const ideas = [];
  for (const op of operations) {
    if (!isItineraryWriteOp(op) || op.op !== "add") continue;
    const idea = findMatchingIdea(trip, op.after?.name);
    if (idea && !hasIdeaSchedulingConsent(dayPlanAxis, idea)) {
      ideas.push(idea);
    }
  }
  const seen = new Set();
  return ideas.filter((idea) => {
    if (seen.has(idea.id)) return false;
    seen.add(idea.id);
    return true;
  });
}

function normalizeForMentionMatch(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ideaMentionedInMessage(idea, userMessage) {
  const msg = normalizeForMentionMatch(userMessage);
  const name = normalizeForMentionMatch(idea.name);
  if (!msg || !name || name.length < 2) return false;
  if (msg.includes(name)) return true;
  const words = name.split(" ").filter((w) => w.length > 2);
  if (words.length >= 2 && words.every((w) => msg.includes(w))) return true;
  return false;
}

async function recordIdeaConsentsFromMessage(db, {
  tripId,
  userId,
  trip,
  dayPlanAxis,
  userMessage,
  operations,
}) {
  if (!db || !tripId || !userId || !userMessage?.trim()) return dayPlanAxis;

  for (const op of operations) {
    if (!isItineraryWriteOp(op) || op.op !== "add") continue;
    const idea = findMatchingIdea(trip, op.after?.name);
    if (!idea || hasIdeaSchedulingConsent(dayPlanAxis, idea)) continue;
    if (!ideaMentionedInMessage(idea, userMessage)) continue;

    const { axis } = await recordDecision(db, {
      tripId,
      userId,
      axisId: "dayPlan",
      decision: idea.name,
      why: "Explicitly requested in user message",
      source: "user_message",
      confidence: 0.95,
      field: `idea:${idea.id}`,
    });
    if (axis) dayPlanAxis = axis;
  }

  return dayPlanAxis;
}

function defaultPreferenceQuestions(trip, { dayPlanAxis = null, moneyAxis = null } = {}) {
  const intent = normalizeTripIntent(trip?.intent) || trip?.intent || {};
  const questions = [];

  if (!hasPreferencePace(intent, dayPlanAxis)) {
    questions.push({
      id: randomUUID(),
      question: "What pace feels right for this trip?",
      header: "Pace",
      axisId: "dayPlan",
      field: "pace",
      gapId: "pref-pace",
      multiSelect: false,
      options: [
        { id: "relax", label: "Relaxed", description: "Room to wander" },
        { id: "optimize", label: "Balanced", description: "Highlights without rush" },
        { id: "fullDayOfPlans", label: "Packed", description: "See as much as possible" },
        { id: "freedom", label: "Flexible", description: "Loose structure" },
      ],
    });
  }

  if (!hasPreferenceVibes(intent, dayPlanAxis)) {
    questions.push({
      id: randomUUID(),
      question: "What vibe should I plan around?",
      header: "Vibe",
      axisId: "dayPlan",
      field: "vibes",
      gapId: "pref-vibes",
      multiSelect: true,
      options: [
        { id: "food", label: "Food & wine", description: "" },
        { id: "culture", label: "Culture", description: "" },
        { id: "nature", label: "Outdoors", description: "" },
        { id: "nightlife", label: "Nightlife", description: "" },
      ],
    });
  }

  if (!hasPreferenceBudget(intent, moneyAxis)) {
    questions.push({
      id: randomUUID(),
      question: "What's your budget comfort zone?",
      header: "Budget",
      axisId: "money",
      field: "budgetLevel",
      gapId: "pref-budget",
      multiSelect: false,
      options: [
        { id: "budget", label: "Budget", description: "" },
        { id: "moderate", label: "Moderate", description: "" },
        { id: "comfort", label: "Comfort", description: "" },
        { id: "luxury", label: "Luxury", description: "" },
      ],
    });
  }

  if (questions.length === 0 && hasOpenPreferenceGap(dayPlanAxis)) {
    questions.push({
      id: randomUUID(),
      question: "How many anchors per day feels right?",
      header: "Anchors",
      axisId: "dayPlan",
      field: "anchorsPerDay",
      gapId: "pref-anchors",
      multiSelect: false,
      options: [
        { id: "1-2", label: "1–2 things", description: "Mostly open time" },
        { id: "3", label: "About 3", description: "A few highlights" },
        { id: "4+", label: "4 or more", description: "Full days" },
      ],
    });
  }

  return questions.slice(0, 3);
}

function buildIdeaScheduleQuestion(ideas) {
  const picked = ideas.slice(0, 4);
  let question = "Which saved ideas should I put on the calendar?";
  if (ideas.length > 4) {
    question += ` (Showing 4 of ${ideas.length} — pick what fits.)`;
  }
  const options = picked.map((idea) => ({
    id: idea.id,
    label: idea.name,
    description: idea.location || idea.address || "",
  }));
  if (options.length === 1) {
    options.push({
      id: "skip-ideas",
      label: "Leave as ideas for now",
      description: "Keep them saved, not scheduled",
    });
  }
  return {
    id: randomUUID(),
    question,
    header: "Ideas",
    axisId: "dayPlan",
    field: "savedIdeas",
    gapId: "schedule-saved-ideas",
    multiSelect: true,
    options,
  };
}

function normalizePlaceholderKind(type) {
  if (type === "restaurant") return "meal";
  if (typeof type === "string" && PLACEHOLDER_KINDS.has(type)) return type;
  return "activity";
}

function placeholderFromVenue(op) {
  const after = op.after || {};
  const name = after.name || "this spot";
  const date = after.scheduledDate || "";
  const time = after.scheduledTime || "10:00";
  const kind = normalizePlaceholderKind(after.type || after.attractionType);
  const area = after.location || after.address || "";
  const title = area
    ? `${kind === "meal" ? "Meal" : "Activity"} near ${area}`
    : `Open slot — ${name} unverified`;

  return {
    id: randomUUID(),
    type: "event",
    attractionType: "event",
    name: title,
    placeholder: true,
    placeholderKind: kind,
    scheduledDate: date,
    scheduledTime: time,
    timeConfidence: "guess",
    status: date ? "planned" : "idea",
    notes: "",
    createdAt: new Date(),
    ...(after.durationMinutes != null ? { durationMinutes: after.durationMinutes } : {}),
  };
}

function isVerifiedVenue(op, citationUrls) {
  if (op.provenance?.verified) return true;
  const after = op.after || {};
  const sourceUrl = op.provenance?.sourceUrl || after.bookingUrl || after.website || null;
  if (webSearchBacksUrl(sourceUrl, citationUrls)) return true;
  if (after.openingHours && after.scheduledDate && after.scheduledTime) {
    return openingHoursCover(after.openingHours, after.scheduledDate, after.scheduledTime);
  }
  return false;
}

/**
 * @param {import("mongodb").Db} db
 * @param {object} params
 * @param {object[]} params.operations
 * @param {object|null} params.trip
 * @param {string|null} params.tripId
 * @param {string|null} params.userId
 * @param {object[]} [params.axes]
 * @param {object[]} [params.webSearchResults]
 * @param {boolean} [params.fromSkeleton]
 * @param {string} [params.userMessage]
 */
export async function runWriteGate(db, {
  operations,
  trip,
  tripId,
  userId,
  axes = null,
  webSearchResults = [],
  fromSkeleton = false,
  userMessage = "",
}) {
  if (!operations?.length) {
    return { action: "allow", operations: [] };
  }

  const resolvedAxes =
    axes ||
    (db && tripId && userId ? await getAxes(db, tripId, userId, { trip }) : []);
  let dayPlanAxis = resolvedAxes.find((a) => a.axisId === "dayPlan") || null;
  const moneyAxis = resolvedAxes.find((a) => a.axisId === "money") || null;
  const citationUrls = collectCitationUrls(webSearchResults);
  const itineraryOps = operations.filter(isItineraryWriteOp);

  dayPlanAxis = await recordIdeaConsentsFromMessage(db, {
    tripId,
    userId,
    trip,
    dayPlanAxis,
    userMessage,
    operations,
  });

  const unconsentedIdeas = ideasScheduledWithoutConsent(operations, trip, dayPlanAxis);
  if (unconsentedIdeas.length > 0) {
    return {
      action: "ask",
      questions: [buildIdeaScheduleQuestion(unconsentedIdeas)],
    };
  }

  const broad = isBroadBatch(operations, { fromSkeleton, trip });
  const knowsEnough = tripPreferencesKnown(trip, dayPlanAxis);
  if (broad && !knowsEnough && itineraryOps.length > 0) {
    return {
      action: "ask",
      questions: defaultPreferenceQuestions(trip, { dayPlanAxis, moneyAxis }),
    };
  }

  const gaps = [];
  let downgraded = false;
  const rewritten = [];

  for (const op of operations) {
    if (!isSpecificScheduledVenue(op)) {
      rewritten.push(op);
      continue;
    }

    if (isVerifiedVenue(op, citationUrls)) {
      rewritten.push(op);
      continue;
    }

    downgraded = true;
    const venueName = op.after.name;
    const date = op.after.scheduledDate;
    const gapField = `verify:${venueName}@${date}`;

    if (db && tripId && userId && dayPlanAxis) {
      const alreadyOpen = (dayPlanAxis.gaps || []).some(
        (g) => g.field === gapField && g.status === "open",
      );
      if (!alreadyOpen) {
        const gap = await openGap(db, {
          tripId,
          userId,
          axisId: "dayPlan",
          field: gapField,
          severity: 2,
          kind: "verification",
          blocks: [`schedule ${venueName}`],
          evidence: `Could not confirm hours for ${date}`,
        });
        gaps.push(gap);
      }
    }

    const placeholderAfter = placeholderFromVenue(op);
    rewritten.push({
      ...op,
      after: placeholderAfter,
      label: date ? dayPrefixedLabel(date, placeholderAfter.name) : placeholderAfter.name,
      groupKey: op.groupKey || date || null,
      provenance: {
        origin: "model_guess",
        verified: false,
        sourceUrl: null,
        note: `Couldn't confirm ${venueName}`.slice(0, 40),
      },
    });
  }

  if (downgraded) {
    return { action: "downgrade", operations: rewritten, gaps };
  }

  return { action: "allow", operations };
}

/**
 * Build provenance for a new attraction operation.
 * @param {object} params
 * @param {object} params.args tool args for the attraction
 * @param {object|null} params.place enriched place
 * @param {Set<string>} params.citationUrls
 * @param {object|null} params.matchedIdea
 * @param {boolean} [params.fromCache]
 * @returns {OperationProvenance}
 */
export function buildOperationProvenance({
  args,
  place,
  citationUrls,
  matchedIdea,
  fromCache = false,
}) {
  const sourceUrl =
    (typeof args.sourceUrl === "string" && args.sourceUrl.trim()) ||
    (typeof args.bookingUrl === "string" && args.bookingUrl.trim()) ||
    null;

  /** @type {OperationProvenance} */
  let provenance = {
    origin: "model_guess",
    verified: false,
    sourceUrl,
    note: "My best guess for now",
  };

  if (matchedIdea) {
    provenance = {
      origin: "user_idea",
      verified: false,
      sourceUrl,
      note: "From your saved ideas",
    };
  }

  if (fromCache || place?.placeId) {
    provenance.origin = "places_cache";
    provenance.note = "From our place library";
  }

  const date = args.date || args.scheduledDate;
  const time = args.time || args.scheduledTime;
  const hours = place?.openingHours || args.openingHours;

  if (hours && date && time && openingHoursCover(hours, date, time)) {
    provenance.origin = "places_cache";
    provenance.verified = true;
    provenance.note = "Hours confirmed on site";
  }

  if (sourceUrl && webSearchBacksUrl(sourceUrl, citationUrls)) {
    provenance.origin = "web_search";
    provenance.verified = true;
    provenance.note = "Checked on the web today";
  }

  if (provenance.note.length > 40) {
    provenance.note = provenance.note.slice(0, 40);
  }

  return provenance;
}
