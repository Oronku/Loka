/**
 * Axis Interviewer agent.
 *
 * Surfaces grounded multiple-choice questions for severity-3 blocking gaps only.
 * Respects the 14-day ask cooldown and one-pending-set-per-trip rule.
 * Emits with chatId null into the notification feed (trip screen), not chat.
 */

import { randomUUID } from "crypto";
import {
  gapOnCooldown,
  getAxes,
} from "../axisMemory.js";
import {
  createQuestionSet,
  embedQuestionSet,
  hasPendingQuestionSet,
  sanitizeQuestionSet,
} from "../questions.js";
import { createNotification } from "../notifications.js";

const AGENT_SOURCE = "agent:axisInterviewer";
const RUN_KEY_PREFIX = "axisInterviewer:";
const MAX_QUESTIONS_PER_RUN = 1;

function tripLabel(trip) {
  return trip.name || trip.destination || "your trip";
}

function defaultOptionsForGap(gap) {
  const field = gap.field || "this";
  return [
    { id: randomUUID(), label: "Yes, let's do that", description: "" },
    { id: randomUUID(), label: "No, skip for now", description: "" },
    { id: randomUUID(), label: "Need more info first", description: "" },
  ];
}

async function buildQuestionFromGap(tools, { trip, axis, gap }) {
  const blocks = (gap.blocks || []).join(", ");
  const prompt = [
    `Trip: ${tripLabel(trip)}`,
    `Axis: ${axis.axisId}`,
    `Gap field: ${gap.field}`,
    `Blocks: ${blocks || "unknown action"}`,
    gap.evidence ? `Evidence: ${gap.evidence}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await tools.summarize(
    "Return strict JSON: { \"question\": string, \"header\": string (max 12 chars), \"options\": [{ \"label\": string, \"description\": string }] } with 2-4 concrete options. No Other/Something else option.",
    prompt,
    { maxTokens: 280, temperature: 0.2 },
  );

  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
    if (parsed?.question && parsed?.header && Array.isArray(parsed.options)) {
      return {
        question: String(parsed.question).trim(),
        header: String(parsed.header).trim().slice(0, 12),
        options: parsed.options
          .filter((o) => o?.label)
          .slice(0, 4)
          .map((o) => ({
            id: randomUUID(),
            label: String(o.label).trim(),
            description: o.description ? String(o.description).trim() : "",
          })),
      };
    }
  } catch {
    /* fall through */
  }

  return {
    question: `I need your call on ${gap.field} before I can ${blocks || "move forward"}.`,
    header: String(gap.field || "Decision").slice(0, 12),
    options: defaultOptionsForGap(gap),
  };
}

export default {
  name: "axisInterviewer",
  label: "Axis Interviewer",

  /** @param {import("./runner.js").AgentContext} ctx */
  async run(ctx) {
    const { db, user, trips, now, tools } = ctx;
    const effects = [];

    for (const trip of trips) {
      const tripId = trip.id || trip._id?.toString();
      if (!tripId) continue;

      const runKey = `${RUN_KEY_PREFIX}${tripId}`;
      if (await tools.hasRecentRun(runKey, 6 * 60 * 60 * 1000)) continue;
      if (await hasPendingQuestionSet(db, tripId)) continue;

      const axes = await getAxes(db, tripId, user.id, { trip });
      let emitted = false;

      for (const axis of axes) {
        if (emitted) break;
        const blocking = (axis.gaps || []).filter(
          (g) =>
            g.status === "open" &&
            g.severity === 3 &&
            Array.isArray(g.blocks) &&
            g.blocks.length > 0,
        );

        for (const gap of blocking) {
          if (gapOnCooldown(axis, gap.id, now)) continue;

          const built = await buildQuestionFromGap(tools, { trip, axis, gap });
          const sanitized = await sanitizeQuestionSet(
            db,
            [
              {
                ...built,
                axisId: axis.axisId,
                gapId: gap.id,
                field: gap.field,
              },
            ],
            { tripId, userId: user.id },
          );

          if (!sanitized.ok || sanitized.questions.length === 0) continue;

          const questionSet = await createQuestionSet(db, {
            tripId,
            userId: user.id,
            chatId: null,
            source: AGENT_SOURCE,
            questions: sanitized.questions.slice(0, MAX_QUESTIONS_PER_RUN),
          });

          if (!questionSet) continue;

          await createNotification(db, {
            userId: user.id,
            type: "heads_up",
            title: `Quick question — ${tripLabel(trip)}`,
            body: sanitized.questions[0].question,
            tripId,
            source: AGENT_SOURCE,
            data: {
              questionSetId: questionSet._id,
              questionSet: embedQuestionSet(questionSet),
            },
          });

          await tools.recordRun(runKey, { tripId, gapId: gap.id });
          effects.push({ tripId, questionSetId: questionSet._id });
          emitted = true;
          break;
        }
      }
    }

    return effects;
  },
};
