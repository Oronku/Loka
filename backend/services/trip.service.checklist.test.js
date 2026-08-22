import assert from "node:assert/strict";
import {
  normalizeSharedChecklist,
  sanitizeUpdatePayload,
} from "./trip.service.js";

const access = {
  isOwner: true,
  isParticipant: false,
  isShared: false,
  canView: true,
  canEdit: true,
  canShare: true,
  canDelete: true,
};

const written = [
  { id: "passport", text: "Passport / Visa", completed: true },
  {
    id: "documents:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    text: "buy adapter",
    completed: false,
    categoryId: "documents",
  },
];

const normalized = normalizeSharedChecklist(written);
const custom = normalized.find((item) => item.text === "buy adapter");
assert.equal(custom.categoryId, "documents");
assert.equal(custom.id, "documents:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
assert.equal(custom.text, "buy adapter");

const sanitized = sanitizeUpdatePayload({ checklist: written }, access);
assert.equal(Array.isArray(sanitized.checklist), true);
assert.equal(
  sanitized.checklist.find((item) => item.text === "buy adapter").categoryId,
  "documents",
);

const nested = normalizeSharedChecklist([
  {
    id: "documents",
    items: [{ id: "nested-1", text: "buy adapter", completed: false }],
  },
]);
assert.equal(nested[0].items[0].categoryId, "documents");

const fromPrefix = normalizeSharedChecklist([
  {
    id: "documents:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    text: "buy adapter",
    completed: false,
  },
]);
assert.equal(fromPrefix[0].categoryId, "documents");

console.log("trip.service.checklist.test.js passed");
