import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import {
  QUESTION_SETS_COLLECTION,
  buildQuestionSetDocument,
} from "../../models/aiQuestionSet.helper.js";
import {
  axisHasDecisionForField,
  gapOnCooldown,
  getAxis,
  getAxes,
  markGapAsked,
  recordDecision,
  resolveGap,
  GAP_ASK_COOLDOWN_MS,
} from "./axisMemory.js";

const OTHER_OPTION_RE =
  /^(other|something else|something different|none of the above|לא משהו מהרשימה|אחר)$/i;
/** Client-only sentinel appended locally — never stored on question options. */
const SOMETHING_ELSE_OPTION_ID = "__something_else__";

/**
 * Compact form embedded on chat messages (mirrors embedChangeSet).
 * @param {object|null} qs
 */
export function embedQuestionSet(qs) {
  if (!qs) return null;
  return {
    _id: qs._id,
    status: qs.status,
    tripId: qs.tripId,
    source: qs.source,
    questions: (qs.questions || []).map((q) => ({
      id: q.id,
      question: q.question,
      header: q.header,
      axisId: q.axisId,
      gapId: q.gapId || null,
      multiSelect: !!q.multiSelect,
      options: (q.options || []).map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description || "",
      })),
    })),
    answers: qs.answers || null,
  };
}

/** @param {import("mongodb").Db} db @param {string} tripId */
export async function hasPendingQuestionSet(db, tripId) {
  const doc = await db.collection(QUESTION_SETS_COLLECTION).findOne({
    tripId,
    status: "pending",
  });
  return !!doc;
}

/**
 * @param {import("mongodb").Db} db
 * @param {object[]} rawQuestions
 * @param {object} ctx
 * @param {string} ctx.tripId
 * @param {string} ctx.userId
 */
export async function sanitizeQuestionSet(db, rawQuestions, { tripId, userId }) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return { ok: false, reason: "no questions", questions: [] };
  }

  if (await hasPendingQuestionSet(db, tripId)) {
    return { ok: false, reason: "pending set exists", questions: [] };
  }

  const axes = await getAxes(db, tripId, userId);
  const axisById = new Map(axes.map((a) => [a.axisId, a]));
  const now = new Date();
  const cleaned = [];

  for (const raw of rawQuestions.slice(0, 3)) {
    if (!raw || typeof raw !== "object") continue;
    const axisId = typeof raw.axisId === "string" ? raw.axisId.trim() : "";
    const axis = axisById.get(axisId);
    if (!axis) continue;

    const field = raw.field ? String(raw.field).trim() : null;
    if (field && axisHasDecisionForField(axis, field)) continue;

    const gapId = raw.gapId ? String(raw.gapId).trim() : null;
    if (gapId && gapOnCooldown(axis, gapId, now)) continue;

    const header = String(raw.header || "").trim().slice(0, 12);
    const question = String(raw.question || "").trim();
    if (!header || !question) continue;

    const options = (Array.isArray(raw.options) ? raw.options : [])
      .filter((o) => o && typeof o.label === "string")
      .filter((o) => !OTHER_OPTION_RE.test(o.label.trim()))
      .slice(0, 4)
      .map((o) => ({
        id: o.id && String(o.id).trim() ? String(o.id).trim() : randomUUID(),
        label: o.label.trim(),
        description: o.description ? String(o.description).trim() : "",
      }));

    if (options.length < 2) continue;

    cleaned.push({
      id: raw.id && String(raw.id).trim() ? String(raw.id).trim() : randomUUID(),
      question,
      header,
      axisId,
      gapId,
      field,
      multiSelect: !!raw.multiSelect,
      options,
    });
  }

  if (cleaned.length === 0) {
    return { ok: false, reason: "all questions filtered", questions: [] };
  }

  return { ok: true, questions: cleaned.slice(0, 3) };
}

/**
 * @param {import("mongodb").Db} db
 * @param {object} opts
 * @param {string} opts.tripId
 * @param {string} opts.userId
 * @param {string|null} [opts.chatId]
 * @param {string|null} [opts.messageId]
 * @param {string} [opts.source]
 * @param {object[]} opts.questions  already sanitized
 */
export async function createQuestionSet(db, {
  tripId,
  userId,
  chatId = null,
  messageId = null,
  source = "turn",
  questions,
}) {
  if (!questions?.length) return null;
  if (await hasPendingQuestionSet(db, tripId)) return null;

  const doc = buildQuestionSetDocument({
    tripId,
    userId,
    chatId,
    messageId,
    source,
    questions,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const result = await db.collection(QUESTION_SETS_COLLECTION).insertOne(doc);
  const id = result.insertedId.toString();

  for (const q of questions) {
    if (q.gapId) {
      await markGapAsked(db, tripId, q.axisId, q.gapId);
    }
  }

  return { ...doc, _id: id };
}

/** @param {import("mongodb").Db} db @param {string} questionSetId @param {string} userId */
export async function getQuestionSetForUser(db, questionSetId, userId) {
  if (!ObjectId.isValid(questionSetId)) return null;
  return db.collection(QUESTION_SETS_COLLECTION).findOne({
    _id: new ObjectId(questionSetId),
    userId,
  });
}

/**
 * @param {import("mongodb").Db} db
 * @param {string} questionSetId
 * @param {string} userId
 * @param {object[]} answers
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, questionSet?: object, syntheticMessage?: string }>}
 */
export async function answerQuestionSet(db, questionSetId, userId, answers) {
  const qs = await getQuestionSetForUser(db, questionSetId, userId);
  if (!qs) return { ok: false, status: 404, error: "Question set not found" };
  if (qs.status !== "pending") {
    return { ok: false, status: 400, error: "Question set is no longer pending" };
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return { ok: false, status: 400, error: "answers required" };
  }

  const answerByQ = new Map(
    answers
      .filter((a) => a && a.questionId)
      .map((a) => [String(a.questionId), a]),
  );

  const storedAnswers = [];
  const decisionLines = [];

  for (const q of qs.questions || []) {
    const ans = answerByQ.get(q.id);
    if (!ans) continue;

    const optionIds = Array.isArray(ans.optionIds) ? ans.optionIds.map(String) : [];
    const customText = ans.customText ? String(ans.customText).trim() : null;
    const realOptionIds = optionIds.filter((id) => id !== SOMETHING_ELSE_OPTION_ID);
    const labelsFromClient =
      Array.isArray(ans.labels) && ans.labels.length
        ? ans.labels.map(String).filter((l) => !OTHER_OPTION_RE.test(l.trim()))
        : null;
    const labels = labelsFromClient?.length
      ? labelsFromClient
      : realOptionIds
          .map((oid) => q.options.find((o) => o.id === oid)?.label)
          .filter(Boolean);

    storedAnswers.push({
      questionId: q.id,
      optionIds,
      labels,
      customText,
    });

    const decisionText = customText || labels.join(", ") || "Answered";
    decisionLines.push(`${q.header}: ${decisionText}`);

    await recordDecision(db, {
      tripId: qs.tripId,
      userId,
      axisId: q.axisId,
      decision: decisionText,
      why: q.question,
      source: "user_answer",
      confidence: 0.95,
      field: q.field || q.gapId || null,
    });

    if (q.field === "savedIdeas") {
      for (const ideaId of realOptionIds) {
        if (ideaId === "skip-ideas") continue;
        const label = q.options.find((o) => o.id === ideaId)?.label || ideaId;
        await recordDecision(db, {
          tripId: qs.tripId,
          userId,
          axisId: q.axisId,
          decision: label,
          why: q.question,
          source: "user_answer",
          confidence: 0.95,
          field: `idea:${ideaId}`,
        });
      }
    }

    if (q.gapId) {
      await resolveGap(db, {
        tripId: qs.tripId,
        axisId: q.axisId,
        gapId: q.gapId,
        resolvedByQuestionId: questionSetId,
      });
    }
  }

  if (storedAnswers.length === 0) {
    return { ok: false, status: 400, error: "No matching answers" };
  }

  const now = new Date();
  await db.collection(QUESTION_SETS_COLLECTION).updateOne(
    { _id: qs._id },
    { $set: { status: "answered", answers: storedAnswers, answeredAt: now } },
  );

  const syntheticMessage = decisionLines.join("\n");
  const updated = await getQuestionSetForUser(db, questionSetId, userId);
  return {
    ok: true,
    questionSet: { ...updated, _id: updated._id.toString() },
    syntheticMessage,
  };
}

/** @param {import("mongodb").Db} db @param {string} questionSetId @param {string} userId */
export async function dismissQuestionSet(db, questionSetId, userId) {
  const qs = await getQuestionSetForUser(db, questionSetId, userId);
  if (!qs) return { ok: false, status: 404, error: "Question set not found" };
  if (qs.status !== "pending") {
    return { ok: false, status: 400, error: "Question set is no longer pending" };
  }

  await db.collection(QUESTION_SETS_COLLECTION).updateOne(
    { _id: qs._id },
    { $set: { status: "dismissed", answeredAt: new Date() } },
  );

  const updated = await getQuestionSetForUser(db, questionSetId, userId);
  return {
    ok: true,
    questionSet: { ...updated, _id: updated._id.toString() },
  };
}

/** Reflect question-set status onto the embedded copy in its chat message. */
export async function syncEmbeddedQuestionSetStatus(db, questionSetId, status, answers = null) {
  const patch = { "questionSet.status": status };
  if (answers) patch["questionSet.answers"] = answers;
  await db
    .collection("messages")
    .updateOne({ "questionSet._id": questionSetId }, { $set: patch });
}

export { GAP_ASK_COOLDOWN_MS };
