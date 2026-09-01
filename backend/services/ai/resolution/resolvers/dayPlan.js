import {
  evidenceValue,
  entityItemId,
  findAttraction,
  questionFromFinding,
  syntheticCandidate,
} from "../helpers.js";
import { localDeliberate } from "../localDeliberate.js";
import { criterion } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const dayPlanResolver = {
  codes: [
    "impossible_transit",
    "venue_closed",
    "overlapping_items",
    "item_outside_trip_dates",
    "unreachable_booked_item",
  ],

  buildSlots(finding, ctx) {
    const slotId = `resolve-${finding.code}-${finding.id.slice(0, 8)}`;
    const itemId = entityItemId(finding, "attraction");
    const item = itemId ? findAttraction(ctx.trip, itemId) : null;

    if (finding.code === "impossible_transit") {
      const itemAId = finding.entities?.[0]?.itemId;
      const itemBId = finding.entities?.[1]?.itemId;
      return [{
        slotId,
        axisId: "dayPlan",
        label: "Fix impossible transit",
        scheduledDate: item?.scheduledDate || evidenceValue(finding, "date") || undefined,
        field: "transitFix",
        ideaIds: [
          `fix-move-${itemBId}`,
          `fix-drop-${itemBId}`,
          `fix-transport-${itemAId}-${itemBId}`,
        ],
      }];
    }

    if (finding.code === "venue_closed") {
      return [{
        slotId,
        axisId: "dayPlan",
        label: `Alternative for ${item?.name || "venue"}`,
        scheduledDate: item?.scheduledDate,
        query: item?.name ? `similar to ${item.name}` : undefined,
        field: "venueAlternative",
        ideaIds: itemId ? [`fix-reschedule-${itemId}`, `fix-equiv-${itemId}`, `fix-drop-${itemId}`] : [],
      }];
    }

    if (finding.code === "overlapping_items") {
      const itemBId = finding.entities?.[1]?.itemId;
      return [{
        slotId,
        axisId: "dayPlan",
        label: "Resolve overlap",
        scheduledDate: item?.scheduledDate,
        field: "overlapFix",
        ideaIds: [`fix-shift-a-${itemId}`, `fix-shift-b-${itemBId}`, `fix-drop-overlap-${itemBId}`],
      }];
    }

    if (finding.code === "item_outside_trip_dates") {
      return [{
        slotId,
        axisId: "dayPlan",
        label: "Move into trip range",
        scheduledDate: evidenceValue(finding, "tripRange")?.split("/")?.[0],
        field: "dateFix",
        ideaIds: [`fix-move-in-${itemId}`, `fix-remove-${itemId}`],
      }];
    }

    if (finding.code === "unreachable_booked_item") {
      return [{
        slotId,
        axisId: "dayPlan",
        label: "Reach booked item",
        scheduledDate: item?.scheduledDate,
        field: "reachFix",
        ideaIds: [`fix-add-transport-${itemId}`, `fix-relocate-${itemId}`, `fix-reschedule-${itemId}`],
      }];
    }

    return [];
  },

  resolveDirect(finding, ctx) {
    if (finding.code === "impossible_transit") {
      return interpretImpossibleTransit(finding, ctx);
    }
    return null;
  },

  interpret(finding, result, ctx) {
    if (finding.code === "impossible_transit") {
      return interpretImpossibleTransit(finding, ctx, result);
    }

    const decision = result.decisions[0];
    if (result.questions.length) {
      return {
        finding,
        kind: "question",
        questions: result.questions.map((q) => questionFromFinding(finding, q)),
        decision,
      };
    }

    if (result.blocked.length) {
      return {
        finding,
        kind: "blocked",
        blockedWhy: result.blocked[0].why,
        alternatives: decision?.shortlist,
      };
    }

    const chosen = decision?.chosen;
    if (!chosen) {
      return { finding, kind: "blocked", blockedWhy: "No viable day-plan fix" };
    }

    const fixType = chosen.attributes?.fixType;
    const itemId = entityItemId(finding, "attraction") || finding.entities?.[1]?.itemId;
    /** @type {object[]} */
    const operations = [];

    if (fixType === "move_later" && itemId) {
      operations.push({
        op: "update",
        entity: "attraction",
        itemId,
        after: { scheduledTime: chosen.attributes?.newTime || "15:00" },
        provenance: { origin: "model_guess", verified: false, sourceUrl: null, note: "Reschedule to fix conflict" },
      });
    } else if (fixType === "drop_item" && itemId) {
      operations.push({
        op: "remove",
        entity: "attraction",
        itemId,
        provenance: { origin: "model_guess", verified: false, sourceUrl: null, note: "Remove conflicting item" },
      });
    } else if (fixType === "add_transport") {
      operations.push({
        op: "add",
        entity: "attraction",
        after: {
          name: chosen.name,
          type: "travel",
          placeholder: false,
          scheduledDate: decision?.slotId ? undefined : findAttraction(ctx.trip, itemId)?.scheduledDate,
        },
        provenance: { origin: "model_guess", verified: false, sourceUrl: null, note: "Add transport leg" },
      });
    }

    return {
      finding,
      kind: "proposed",
      operations,
      decision,
      reasoning: decision?.reasoning,
      alternatives: decision?.shortlist?.filter((c) => c.id !== chosen?.id),
    };
  },
};

function interpretImpossibleTransit(finding, ctx, result = null) {
  const itemAId = finding.entities?.[0]?.itemId;
  const itemBId = finding.entities?.[1]?.itemId;
  const itemB = itemBId ? findAttraction(ctx.trip, itemBId) : null;
  const requiredMinutes = evidenceValue(finding, "requiredMinutes") || finding.detailParams?.requiredMinutes;
  const gapMinutes = evidenceValue(finding, "gapMinutes") || finding.detailParams?.gapMinutes;

  const candidates = [
    syntheticCandidate(`fix-move-${itemBId}`, `Move ${itemB?.name || "later item"} later`, {
      fixType: "move_later",
      bufferMinutes: 30,
      newTime: "15:00",
      tieBreak: 3,
    }),
    syntheticCandidate(`fix-drop-${itemBId}`, `Drop ${itemB?.name || "later item"}`, {
      fixType: "drop_item",
      tieBreak: 1,
    }),
    syntheticCandidate(`fix-transport-${itemAId}-${itemBId}`, "Add taxi between stops", {
      fixType: "add_transport",
      travelMinutes: typeof requiredMinutes === "number" ? Math.min(requiredMinutes, gapMinutes || requiredMinutes) : 25,
      tieBreak: 2,
    }),
  ];

  const slot = {
    slotId: `fix-transit-${finding.id.slice(0, 8)}`,
    axisId: "dayPlan",
    label: "Fix impossible transit",
    scheduledDate: itemB?.scheduledDate,
    field: "transitFix",
  };

  const extraCriteria = [
    criterion("transit_viability", "Fix makes transit possible", {
      requiredMinutes: typeof requiredMinutes === "number" ? requiredMinutes : 30,
      gapMinutes: typeof gapMinutes === "number" ? gapMinutes : 15,
    }, "trip_data", "hard", 4),
    criterion("plan_preservation", "Keep both items if possible", true, "intent", "soft", 2),
  ];

  const local = result || localDeliberate({
    slot,
    candidates,
    trip: ctx.trip,
    profile: ctx.profile,
    axes: ctx.axes,
    extraCriteria,
    useResolutionScoring: true,
    now: ctx.now,
  });

  const decision = local.decisions[0];

  if (local.questions.length) {
    return {
      finding,
      kind: "question",
      questions: local.questions.map((q) => questionFromFinding(finding, q)),
      decision,
    };
  }

  return {
    finding,
    kind: "proposed",
    decision,
    reasoning: decision?.reasoning || "Ranked transit fixes",
    alternatives: decision?.shortlist || candidates,
  };
}
