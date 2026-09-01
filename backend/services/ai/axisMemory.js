import { randomUUID } from "crypto";
import { getOpenAI, UTILITY_MODEL } from "./openaiClient.js";
import { CATEGORY_ORDER, computeTripReadiness } from "../trip/readiness.js";
import {
  TRIP_AXES_COLLECTION,
  buildTripAxisDocument,
  customAxisIdFromTitle,
  isCustomAxisId,
  isReadinessAxisId,
} from "../../models/aiTripAxis.helper.js";

export const GAP_ASK_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const READINESS_TITLES = {
  basics: "Basics",
  intent: "Intent",
  travel: "Travel",
  stay: "Stay",
  dayPlan: "Day plan",
  transport: "Transport",
  money: "Money",
  packing: "Packing",
  people: "People",
};

/** @param {import("mongodb").Db} db @param {string} tripId @param {string} userId */
export async function ensureReadinessAxes(db, tripId, userId) {
  const existing = await db
    .collection(TRIP_AXES_COLLECTION)
    .find({ tripId, axisId: { $in: [...CATEGORY_ORDER] } })
    .project({ axisId: 1 })
    .toArray();
  const have = new Set(existing.map((d) => d.axisId));
  const toInsert = CATEGORY_ORDER.filter((id) => !have.has(id)).map((axisId) =>
    buildTripAxisDocument({
      tripId,
      userId,
      axisId,
      kind: "readiness",
      title: READINESS_TITLES[axisId] || axisId,
    }),
  );
  if (toInsert.length > 0) {
    await db.collection(TRIP_AXES_COLLECTION).insertMany(toInsert);
  }
}

/**
 * @param {import("mongodb").Db} db
 * @param {string} tripId
 * @param {string} userId
 * @param {object} [opts]
 * @param {object|null} [opts.trip]  when provided, seed summaries from readiness
 */
export async function getAxes(db, tripId, userId, { trip = null } = {}) {
  if (!db || !tripId || !userId) return [];
  await ensureReadinessAxes(db, tripId, userId);

  if (trip) {
    const readiness = computeTripReadiness(trip);
    for (const cat of readiness.categories || []) {
      if (!cat?.id || !cat.summary) continue;
      await db.collection(TRIP_AXES_COLLECTION).updateOne(
        { tripId, axisId: cat.id, summary: "" },
        {
          $set: {
            summary: cat.summary,
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  return db
    .collection(TRIP_AXES_COLLECTION)
    .find({ tripId, userId })
    .sort({ lastTouchedAt: -1 })
    .toArray();
}

/** @param {import("mongodb").Db} db @param {string} tripId @param {string} axisId */
export async function getAxis(db, tripId, axisId) {
  if (!db || !tripId || !axisId) return null;
  return db.collection(TRIP_AXES_COLLECTION).findOne({ tripId, axisId });
}

/**
 * @param {import("mongodb").Db} db
 * @param {object} params
 * @param {string} params.tripId
 * @param {string} params.userId
 * @param {string} params.axisId
 * @param {string} [params.title]
 * @param {string} [params.note]
 * @param {string} [params.summary]
 * @param {import("../../models/aiTripAxis.helper.js").AxisStatus} [params.status]
 */
export async function upsertAxisNote(db, {
  tripId,
  userId,
  axisId,
  title,
  note,
  summary,
  status,
}) {
  const now = new Date();
  let doc = await getAxis(db, tripId, axisId);

  if (!doc) {
    if (!isReadinessAxisId(axisId) && !isCustomAxisId(axisId)) {
      if (!title) return null;
      axisId = customAxisIdFromTitle(title);
    }
    doc = buildTripAxisDocument({
      tripId,
      userId,
      axisId,
      kind: isCustomAxisId(axisId) ? "custom" : "readiness",
      title: title || READINESS_TITLES[axisId] || axisId,
      note: "",
      summary: summary || "",
      status: status || "working",
    });
    if (typeof note === "string" && note.trim()) {
      doc.note = await trimNoteToBudget(note.trim(), doc.charLimit);
    }
    await db.collection(TRIP_AXES_COLLECTION).insertOne(doc);
    return doc;
  }

  const set = { updatedAt: now, lastTouchedAt: now };
  if (typeof title === "string" && title.trim()) set.title = title.trim();
  if (typeof summary === "string") set.summary = summary.trim();
  if (typeof status === "string") set.status = status;
  if (typeof note === "string" && note.trim()) {
    const trimmed = await trimNoteToBudget(note.trim(), doc.charLimit);
    set.note = trimmed;
  }

  await db.collection(TRIP_AXES_COLLECTION).updateOne(
    { tripId, axisId },
    { $set: set, $inc: { version: 1 } },
  );
  return getAxis(db, tripId, axisId);
}

/**
 * @param {import("mongodb").Db} db
 * @param {object} params
 * @param {string} params.tripId
 * @param {string} params.userId
 * @param {string} params.axisId
 * @param {string} params.decision
 * @param {string} [params.why]
 * @param {{ option: string, why: string }[]} [params.rejected]
 * @param {import("../../models/aiTripAxis.helper.js").DecisionSource} params.source
 * @param {number} [params.confidence]
 * @param {string} [params.field]
 */
export async function recordDecision(db, {
  tripId,
  userId,
  axisId,
  decision,
  why = "",
  rejected = [],
  source,
  confidence = 0.8,
  field = null,
}) {
  const now = new Date();
  await ensureReadinessAxes(db, tripId, userId);

  const entry = {
    id: randomUUID(),
    decision: String(decision).trim(),
    why: why ? String(why).trim() : "",
    rejected: Array.isArray(rejected)
      ? rejected
          .filter((r) => r && r.option)
          .map((r) => ({
            option: String(r.option).trim(),
            why: r.why ? String(r.why).trim() : "",
          }))
      : [],
    source,
    confidence,
    at: now,
    ...(field ? { field: String(field).trim() } : {}),
  };

  const res = await db.collection(TRIP_AXES_COLLECTION).findOneAndUpdate(
    { tripId, axisId },
    {
      $push: { decisions: entry },
      $set: { updatedAt: now, lastTouchedAt: now, status: "settled" },
      $inc: { version: 1 },
      $setOnInsert: buildTripAxisDocument({
        tripId,
        userId,
        axisId,
        title: READINESS_TITLES[axisId] || axisId,
      }),
    },
    { upsert: true, returnDocument: "after" },
  );

  return { axis: res, decision: entry };
}

/**
 * @param {import("mongodb").Db} db
 * @param {object} params
 * @param {string} params.tripId
 * @param {string} params.userId
 * @param {string} params.axisId
 * @param {string} params.field
 * @param {1|2|3} params.severity
 * @param {string[]} [params.blocks]
 * @param {string} [params.evidence]
 * @param {import("../../models/aiTripAxis.helper.js").GapKind} [params.kind]
 */
export async function openGap(db, {
  tripId,
  userId,
  axisId,
  field,
  severity,
  blocks = [],
  evidence = "",
  kind = "other",
}) {
  const now = new Date();
  await ensureReadinessAxes(db, tripId, userId);
  const axis = await getAxis(db, tripId, axisId);
  const gaps = axis?.gaps || [];
  const existing = gaps.find(
    (g) => g.field === field && g.status === "open",
  );
  if (existing) return existing;

  const gap = {
    id: randomUUID(),
    field: String(field).trim(),
    severity,
    kind,
    blocks: Array.isArray(blocks) ? blocks.filter(Boolean) : [],
    evidence: evidence ? String(evidence).trim() : "",
    status: "open",
    askedCount: 0,
    lastAskedAt: null,
    resolvedByQuestionId: null,
  };

  await db.collection(TRIP_AXES_COLLECTION).updateOne(
    { tripId, axisId },
    {
      $push: { gaps: gap },
      $set: { updatedAt: now, lastTouchedAt: now, status: "blocked" },
      $inc: { version: 1 },
      $setOnInsert: buildTripAxisDocument({ tripId, userId, axisId }),
    },
    { upsert: true },
  );

  return gap;
}

/**
 * @param {import("mongodb").Db} db
 * @param {object} params
 * @param {string} params.tripId
 * @param {string} params.axisId
 * @param {string} params.gapId
 * @param {string|null} [params.resolvedByQuestionId]
 */
export async function resolveGap(db, { tripId, axisId, gapId, resolvedByQuestionId = null }) {
  const now = new Date();
  await db.collection(TRIP_AXES_COLLECTION).updateOne(
    { tripId, axisId, "gaps.id": gapId },
    {
      $set: {
        "gaps.$.status": "resolved",
        "gaps.$.resolvedByQuestionId": resolvedByQuestionId,
        updatedAt: now,
        lastTouchedAt: now,
      },
      $inc: { version: 1 },
    },
  );
}

/** @param {import("mongodb").Db} db @param {string} tripId @param {string} axisId @param {string} gapId */
export async function markGapAsked(db, tripId, axisId, gapId) {
  const now = new Date();
  await db.collection(TRIP_AXES_COLLECTION).updateOne(
    { tripId, axisId, "gaps.id": gapId },
    {
      $set: { "gaps.$.lastAskedAt": now },
      $inc: { "gaps.$.askedCount": 1, version: 1 },
    },
  );
}

/** @param {object} axis @param {string|null} field */
export function axisHasDecisionForField(axis, field) {
  if (!axis || !field) return false;
  return (axis.decisions || []).some(
    (d) => d.field === field || d.decision === field,
  );
}

/** @param {object} axis @param {string|null} gapId @param {Date} [now] */
export function gapOnCooldown(axis, gapId, now = new Date()) {
  if (!axis || !gapId) return false;
  const gap = (axis.gaps || []).find((g) => g.id === gapId);
  if (!gap?.lastAskedAt) return false;
  return now.getTime() - new Date(gap.lastAskedAt).getTime() < GAP_ASK_COOLDOWN_MS;
}

/**
 * @param {object[]} axes
 * @param {object} [opts]
 * @param {string} [opts.userMessage]
 * @param {object|null} [opts.readiness]
 * @param {number} [opts.maxFull]
 */
export function selectRelevantAxes(axes, { userMessage = "", readiness = null, maxFull = 3 } = {}) {
  const msg = String(userMessage || "").toLowerCase();
  const nextUp = new Set(readiness?.nextUp || []);
  const scored = axes.map((axis) => {
    let score = 0;
    if (axis.status === "working" || axis.status === "blocked") score += 3;
    if (nextUp.has(axis.axisId)) score += 2;
    if (msg && (msg.includes(axis.axisId.toLowerCase()) || msg.includes(String(axis.title || "").toLowerCase()))) {
      score += 4;
    }
    const openHigh = (axis.gaps || []).filter((g) => g.status === "open" && g.severity >= 2).length;
    score += openHigh;
    return { axis, score };
  });

  scored.sort((a, b) => b.score - a.score || String(a.axis.axisId).localeCompare(b.axis.axisId));
  const fullIds = new Set(scored.slice(0, maxFull).filter((s) => s.score > 0).map((s) => s.axis.axisId));
  if (fullIds.size === 0 && scored.length > 0) {
    for (const s of scored.slice(0, Math.min(maxFull, scored.length))) {
      fullIds.add(s.axis.axisId);
    }
  }
  return { fullIds, all: axes };
}

/**
 * @param {object[]} axes
 * @param {object} [opts]
 * @param {Set<string>} [opts.fullIds]
 * @param {number} [opts.charBudget]
 */
export function buildAxisBrief(axes, { fullIds = new Set(), charBudget = 2400 } = {}) {
  const lines = ["=== LOKA WORK AXES ==="];
  let used = lines[0].length;

  for (const axis of axes) {
    const openGaps = (axis.gaps || [])
      .filter((g) => g.status === "open" && g.severity >= 2)
      .map((g) => `${g.field}(sev${g.severity})`)
      .join(", ");
    const brief = `- ${axis.axisId} [${axis.status}] ${axis.summary || "(no summary)"}${openGaps ? ` | gaps: ${openGaps}` : ""}`;
    if (used + brief.length + 1 > charBudget) break;
    lines.push(brief);
    used += brief.length + 1;
  }

  for (const axis of axes) {
    if (!fullIds.has(axis.axisId)) continue;
    const header = `\n## ${axis.axisId} — ${axis.title}`;
    const body = axis.note ? `\n${axis.note}` : "";
    const block = `${header}${body}`;
    if (used + block.length + 1 > charBudget) {
      const room = charBudget - used - header.length - 10;
      if (room > 40 && axis.note) {
        lines.push(`${header}\n${axis.note.slice(0, room)}…`);
        used = charBudget;
      }
      break;
    }
    lines.push(block);
    used += block.length + 1;
  }

  if (used >= charBudget) {
    lines.push("\n(More axis detail available via recall(axisId).)");
  }

  return lines.join("\n").slice(0, charBudget);
}

/** @param {string} note @param {number} charLimit */
export async function trimNoteToBudget(note, charLimit) {
  if (!note || note.length <= charLimit) return note || "";
  const openai = getOpenAI();
  if (!openai) return `${note.slice(0, charLimit - 1)}…`;

  try {
    const completion = await openai.chat.completions.create({
      model: UTILITY_MODEL,
      messages: [
        {
          role: "system",
          content:
            `Trim the following markdown note to at most ${charLimit} characters while preserving the most important facts, decisions, and open questions. Return only the trimmed note.`,
        },
        { role: "user", content: note },
      ],
      temperature: 0,
      max_tokens: Math.ceil(charLimit / 3),
    });
    const trimmed = completion.choices[0]?.message?.content?.trim() || "";
    if (trimmed && trimmed.length <= charLimit) return trimmed;
  } catch (err) {
    console.error("[axisMemory] trimNoteToBudget failed:", err.message);
  }
  return `${note.slice(0, charLimit - 1)}…`;
}

/**
 * Apply a remember() tool call payload.
 * @param {import("mongodb").Db} db
 * @param {object} params
 * @param {string} params.tripId
 * @param {string} params.userId
 * @param {object} args
 */
export async function applyRemember(db, { tripId, userId, args }) {
  let axisId = args?.axisId;
  if (!tripId || !userId || !axisId) {
    return { ok: false, error: "missing trip or axisId" };
  }

  let axis = await getAxis(db, tripId, axisId);
  if (!axis && args.title) {
    if (!isReadinessAxisId(axisId) && !isCustomAxisId(axisId)) {
      axisId = customAxisIdFromTitle(args.title);
    }
    axis = await upsertAxisNote(db, {
      tripId,
      userId,
      axisId,
      title: args.title,
      note: args.note || "",
      summary: args.summary || "",
      status: "working",
    });
  } else if (args.note || args.summary || args.title) {
    axis = await upsertAxisNote(db, {
      tripId,
      userId,
      axisId,
      title: args.title,
      note: args.note,
      summary: args.summary,
      status: "working",
    });
  }

  if (args.decision) {
    await recordDecision(db, {
      tripId,
      userId,
      axisId,
      decision: args.decision,
      why: args.why || "",
      rejected: args.rejected,
      source: "agent_inference",
      confidence: args.confidence ?? 0.7,
      field: args.field || null,
    });
  }

  if (Array.isArray(args.gaps)) {
    for (const g of args.gaps) {
      if (!g?.field || !g.severity) continue;
      await openGap(db, {
        tripId,
        userId,
        axisId,
        field: g.field,
        severity: g.severity,
        blocks: g.blocks,
        evidence: g.evidence,
        kind: g.kind,
      });
    }
  }

  const updated = await getAxis(db, tripId, axisId);
  return { ok: true, axisId, summary: updated?.summary || "", status: updated?.status || "idle" };
}

/** @param {import("mongodb").Db} db @param {string} tripId @param {string} axisId */
export async function recallAxis(db, tripId, axisId) {
  const axis = await getAxis(db, tripId, axisId);
  if (!axis) return { ok: false, error: "axis not found" };
  return {
    ok: true,
    axisId: axis.axisId,
    title: axis.title,
    note: axis.note,
    summary: axis.summary,
    status: axis.status,
    decisions: axis.decisions || [],
    openGaps: (axis.gaps || []).filter((g) => g.status === "open"),
  };
}

/** Client-safe axis list for the memory panel. */
export function publicAxes(axes) {
  return (axes || []).map((a) => ({
    axisId: a.axisId,
    kind: a.kind,
    title: a.title,
    summary: a.summary,
    note: a.note,
    status: a.status,
    decisions: (a.decisions || []).map((d) => ({
      id: d.id,
      decision: d.decision,
      why: d.why,
      source: d.source,
      at: d.at,
    })),
    gaps: (a.gaps || [])
      .filter((g) => g.status === "open")
      .map((g) => ({
        id: g.id,
        field: g.field,
        severity: g.severity,
        blocks: g.blocks,
      })),
    lastTouchedAt: a.lastTouchedAt,
    updatedAt: a.updatedAt,
  }));
}
