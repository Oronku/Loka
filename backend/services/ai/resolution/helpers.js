import { randomUUID } from "crypto";
import { buildOperationProvenance } from "../writeGate.js";
import { UNKNOWN } from "../deliberation/constants.js";

/**
 * @param {import('../integrity/types.js').Finding} finding
 * @param {string} what
 */
export function evidenceValue(finding, what) {
  const row = (finding.evidence || []).find((e) => e.what === what);
  return row?.value ?? null;
}

/**
 * @param {import('../integrity/types.js').Finding} finding
 * @param {string} what
 */
export function evidenceValues(finding, what) {
  return (finding.evidence || []).filter((e) => e.what === what).map((e) => e.value);
}

/**
 * @param {import('../integrity/types.js').Finding} finding
 */
export function entityItemId(finding, entity) {
  const row = (finding.entities || []).find((e) => e.entity === entity);
  return row?.itemId ?? null;
}

/**
 * @param {object} trip
 * @param {string} itemId
 */
export function findAttraction(trip, itemId) {
  return (trip?.attractions || []).find((a) => a.id === itemId) || null;
}

/**
 * @param {object} trip
 * @param {string} itemId
 */
export function findHotel(trip, itemId) {
  return (trip?.hotels || []).find((h) => h.id === itemId) || null;
}

/**
 * @param {object} params
 */
export function buildQuestion({
  axisId,
  field,
  header,
  question,
  options,
  gapId = null,
}) {
  return {
    id: randomUUID(),
    axisId,
    field: field || null,
    gapId,
    header: String(header || "").trim().slice(0, 12),
    question: String(question || "").trim(),
    options: (options || []).slice(0, 4).map((o) => ({
      id: o.id || randomUUID(),
      label: String(o.label || "").trim(),
      description: o.description ? String(o.description).trim() : "",
    })),
  };
}

/**
 * @param {import('../integrity/types.js').Finding} finding
 * @param {object} q
 */
export function questionFromFinding(finding, q) {
  const axisId = finding.axisIds[0] || "basics";
  return buildQuestion({ ...q, axisId, gapId: finding.id });
}

/**
 * @param {object} args
 * @param {object} [opts]
 */
export function hotelAddOperation(args, opts = {}) {
  return {
    op: "add",
    entity: "hotel",
    after: args,
    provenance: buildOperationProvenance({
      args,
      place: opts.place || null,
      citationUrls: opts.citationUrls || new Set(),
      matchedIdea: opts.matchedIdea || null,
      fromCache: opts.fromCache || false,
    }),
  };
}

/**
 * @param {string} itemId
 * @param {object} changes
 * @param {object} [opts]
 */
export function attractionUpdateOperation(itemId, changes, opts = {}) {
  return {
    op: "update",
    entity: "attraction",
    itemId,
    after: changes,
    provenance: buildOperationProvenance({
      args: changes,
      place: opts.place || null,
      citationUrls: opts.citationUrls || new Set(),
      matchedIdea: opts.matchedIdea || null,
    }),
  };
}

/**
 * @param {object} args
 * @param {object} [opts]
 */
export function attractionAddOperation(args, opts = {}) {
  return {
    op: "add",
    entity: "attraction",
    after: args,
    provenance: buildOperationProvenance({
      args,
      place: opts.place || null,
      citationUrls: opts.citationUrls || new Set(),
      matchedIdea: opts.matchedIdea || null,
    }),
  };
}

/**
 * @param {string} itemId
 */
export function attractionRemoveOperation(itemId) {
  return {
    op: "remove",
    entity: "attraction",
    itemId,
    provenance: buildOperationProvenance({
      args: {},
      citationUrls: new Set(),
      matchedIdea: null,
    }),
  };
}

/**
 * Inject synthetic resolution candidates into a trip clone for deliberation.
 * @param {object} trip
 * @param {import('../deliberation/constants.js').Candidate[]} candidates
 */
export function tripWithSyntheticIdeas(trip, candidates) {
  const ideas = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    status: "idea",
    price: c.price,
    currency: c.currency,
    rating: c.rating,
    reviewCount: c.reviewCount,
    attributes: { ...(c.attributes || {}), _resolutionSynthetic: true },
    scheduledDate: c.scheduledDate,
    notes: c.notes,
  }));
  return {
    ...trip,
    attractions: [...(trip.attractions || []), ...ideas],
  };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {object} [attrs]
 */
export function syntheticCandidate(id, name, attrs = {}) {
  return {
    id,
    name,
    attributes: attrs,
    origin: /** @type {const} */ ("user_idea"),
    price: attrs.price,
    rating: attrs.rating,
    reviewCount: attrs.reviewCount,
  };
}

/**
 * @param {import('../deliberation/constants.js').Criterion} criterion
 * @param {unknown} value
 * @param {import('../deliberation/constants.js').CriterionSource} source
 * @param {import('../deliberation/constants.js').CriterionKind} [kind]
 * @param {number} [weight]
 */
export function criterion(id, label, value, source, kind = "soft", weight = 1) {
  return { id, label, kind, weight, value, source };
}

/**
 * Pull trip intent priorities for money scoring.
 * @param {object} trip
 */
export function tripPriorities(trip) {
  const priorities = trip?.intent?.priorities;
  return Array.isArray(priorities) ? priorities.map(String) : [];
}

export { UNKNOWN };
