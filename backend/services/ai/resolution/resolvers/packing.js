import { evidenceValue } from "../helpers.js";

/** @type {import('../types.js').Resolver} */
export const packingResolver = {
  codes: ["missing_essential"],

  buildSlots(finding, ctx) {
    const item = evidenceValue(finding, "item") || evidenceValue(finding, "essential");
    return [{
      slotId: `resolve-${finding.code}-${finding.id.slice(0, 8)}`,
      axisId: "packing",
      label: `Pack ${item || "essentials"}`,
      field: "packingChecklist",
    }];
  },

  interpret(finding, result, ctx) {
    const missing = evidenceValue(finding, "item")
      || evidenceValue(finding, "essential")
      || finding.detailParams?.item
      || "essential item";

    return {
      finding,
      kind: "proposed",
      operations: [{
        op: "add",
        entity: "checklist",
        after: {
          item: missing,
          category: "essential",
          packed: false,
        },
        provenance: {
          origin: "model_guess",
          verified: false,
          sourceUrl: null,
          note: "Add to packing checklist",
        },
      }],
      reasoning: `Add ${missing} to your packing checklist — low risk, easy win`,
    };
  },
};
