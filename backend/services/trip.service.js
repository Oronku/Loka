import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";
import { memoryStore } from "../config/memoryStore.js";
import {
  COLLECTION_NAME,
  PROTECTED_UPDATE_FIELDS,
  SERVER_MANAGED_FIELDS,
  buildParticipant,
  buildPendingInvite,
  buildTripDocument,
  normalizeDocument,
  normalizeEmail,
  isValidEmail,
  parseParticipantEmail,
} from "../models/trip.helper.js";
import { buildIntentPatchFromOnboarding } from "./trip/intentFromOnboarding.js";

export { COLLECTION_NAME };

const VALID_INTENT_PACE = new Set(["freedom", "relax", "optimize", "fullDayOfPlans"]);
const VALID_INTENT_COMPANIONS = new Set([
  "justMe",
  "spousePartner",
  "friendsFamily",
  "familyWithKids",
]);
const VALID_INTENT_BUDGET_LEVEL = new Set([
  "budget",
  "moderate",
  "comfortable",
  "splurge",
]);
const VALID_INTENT_SOURCE = new Set(["onboarding", "user", "loka"]);
const MAX_INTENT_LIST = 12;
const MAX_INTENT_STRING = 80;

/** @param {unknown} value @returns {string[]} */
function coerceIntentStringList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const entry of raw) {
    const trimmed = typeof entry === "string" ? entry.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed.slice(0, MAX_INTENT_STRING));
    if (out.length >= MAX_INTENT_LIST) break;
  }
  return out;
}

/** @param {unknown} value @returns {('justMe'|'spousePartner'|'friendsFamily'|'familyWithKids')[]} */
function coerceIntentCompanions(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const seen = new Set();
  /** @type {('justMe'|'spousePartner'|'friendsFamily'|'familyWithKids')[]} */
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!VALID_INTENT_COMPANIONS.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MAX_INTENT_LIST) break;
  }
  return out;
}

/**
 * Normalize a trip intent patch/object — strips unknown keys.
 * @param {unknown} raw
 * @param {{ source?: 'onboarding'|'user'|'loka', now?: string }} [options]
 * @returns {import('../models/trip.helper.js').TripIntent|undefined}
 */
export function normalizeTripIntent(raw, { source, now } = {}) {
  if (!raw || typeof raw !== "object") return undefined;

  /** @type {import('../models/trip.helper.js').TripIntent} */
  const intent = {};

  if (typeof raw.pace === "string" && VALID_INTENT_PACE.has(raw.pace)) {
    intent.pace = raw.pace;
  }

  const vibes = coerceIntentStringList(raw.vibes);
  if (vibes.length) intent.vibes = vibes;

  const priorities = coerceIntentStringList(raw.priorities);
  if (priorities.length) intent.priorities = priorities;

  if (typeof raw.budgetLevel === "string" && VALID_INTENT_BUDGET_LEVEL.has(raw.budgetLevel)) {
    intent.budgetLevel = raw.budgetLevel;
  }

  const companions = coerceIntentCompanions(raw.companions);
  if (companions.length) intent.companions = companions;

  if (typeof raw.notes === "string" && raw.notes.trim()) {
    intent.notes = raw.notes.trim().slice(0, 500);
  }

  const resolvedSource =
    typeof raw.source === "string" && VALID_INTENT_SOURCE.has(raw.source)
      ? raw.source
      : source;
  if (resolvedSource) intent.source = resolvedSource;

  if (
    !intent.pace &&
    !intent.vibes?.length &&
    !intent.priorities?.length &&
    !intent.notes &&
    !intent.companions?.length &&
    !intent.budgetLevel
  ) {
    return undefined;
  }

  intent.updatedAt = now || new Date().toISOString();
  return intent;
}

/**
 * Derive trip intent from user onboarding preferences.
 * @param {Record<string, unknown>|null|undefined} onboardingPreferences
 * @param {string} [now]
 * @returns {import('../models/trip.helper.js').TripIntent|undefined}
 */
export function intentFromOnboarding(onboardingPreferences, now) {
  const patch = buildIntentPatchFromOnboarding(onboardingPreferences);
  if (!patch) return undefined;
  return normalizeTripIntent(patch, { source: "onboarding", now });
}

/**
 * Merge-patch trip intent (unspecified subfields preserved).
 * @param {import('../models/trip.helper.js').TripIntent|undefined|null} existing
 * @param {unknown} patch
 * @param {{ source?: 'onboarding'|'user'|'loka' }} [options]
 * @returns {import('../models/trip.helper.js').TripIntent|undefined}
 */
export function mergeTripIntent(existing, patch, options = {}) {
  if (patch === undefined) return existing || undefined;
  if (patch === null) return undefined;

  const merged = {
    ...(existing && typeof existing === "object" ? existing : {}),
    ...(patch && typeof patch === "object" ? patch : {}),
    source:
      options.source ||
      (patch && typeof patch === "object" && patch.source) ||
      existing?.source ||
      "user",
  };

  return normalizeTripIntent(merged, {
    source: merged.source,
  });
}

/**
 * Resolve intent for a new trip — explicit intent wins, else onboarding prefill.
 * @param {object} tripData
 * @param {Record<string, unknown>|null|undefined} onboardingPreferences
 * @param {string} [now]
 */
export function resolveIntentForCreate(tripData, onboardingPreferences, now) {
  const timestamp = now || new Date().toISOString();
  if (tripData?.intent !== undefined) {
    return normalizeTripIntent(tripData.intent, {
      source: "user",
      now: timestamp,
    });
  }
  return intentFromOnboarding(onboardingPreferences, timestamp);
}

export function getTripsCollection() {
  const db = getDatabase();
  return db ? db.collection(COLLECTION_NAME) : null;
}

export function buildIdQuery(tripId) {
  const query = [{ id: tripId }];
  if (ObjectId.isValid(tripId)) {
    query.push({ _id: new ObjectId(tripId) });
  }
  return { $or: query };
}

export async function findById(tripId) {
  const collection = getTripsCollection();
  if (collection) {
    return collection.findOne(buildIdQuery(tripId));
  }
  return memoryStore.trips.findById(tripId);
}

export function isOwner(trip, userId) {
  return trip.userId === userId;
}

export function isParticipant(trip, userId) {
  return trip.sharedWith?.some((s) => s.userId === userId) ?? false;
}

export function getAccess(trip, userId) {
  const owner = isOwner(trip, userId);
  const participant = isParticipant(trip, userId);

  return {
    isOwner: owner,
    isParticipant: participant,
    isShared: participant && !owner,
    canView: true,
    canEdit: owner || participant,
    canShare: owner,
    canDelete: owner,
  };
}

export function canEdit(trip, userId) {
  return getAccess(trip, userId).canEdit;
}

export function getMemberIds(trip) {
  const participantIds = (trip.sharedWith || [])
    .map((s) => s.userId)
    .filter(Boolean);
  return [trip.userId, ...participantIds];
}

export function getMyChecklist(trip, userId) {
  const entry = (trip.userChecklists || []).find((uc) => uc.userId === userId);
  return entry?.checklist || [];
}

export function filterChecklistsForResponse(trip, userId) {
  const myChecklist = getMyChecklist(trip, userId);
  const response = { ...trip, myChecklist };
  delete response.userChecklists;
  return response;
}

function namedChecklistCategoryId(value) {
  if (typeof value !== "string") return undefined;
  const categoryId = value.trim();
  if (!categoryId || categoryId === "custom") return undefined;
  return categoryId;
}

function categoryIdFromItemId(id) {
  if (typeof id !== "string") return undefined;
  const sep = id.indexOf(":");
  if (sep <= 0) return undefined;
  return namedChecklistCategoryId(id.slice(0, sep));
}

/** Keep categoryId on the same object so PUT /trips/:id { checklist } survives as-is. */
function persistChecklistCategoryId(item, fallbackCategoryId) {
  if (!item || typeof item !== "object") return item;
  const categoryId =
    namedChecklistCategoryId(item.categoryId) ||
    namedChecklistCategoryId(fallbackCategoryId) ||
    categoryIdFromItemId(item.id);
  if (!categoryId) return item;
  return { ...item, categoryId };
}

export function sanitizeUpdatePayload(body, access) {
  const updateData = { ...body, updatedAt: new Date().toISOString() };
  delete updateData._id;

  const fieldsToStrip = access.isOwner
    ? ["_id", "userId", "userEmail", "createdAt", ...SERVER_MANAGED_FIELDS]
    : PROTECTED_UPDATE_FIELDS;

  for (const field of fieldsToStrip) {
    delete updateData[field];
  }

  if (Array.isArray(updateData.checklist)) {
    updateData.checklist = normalizeSharedChecklist(updateData.checklist);
  }

  if (Object.prototype.hasOwnProperty.call(updateData, "intent")) {
    updateData.intent = normalizeTripIntent(updateData.intent, {
      source: "user",
    });
  }

  return updateData;
}

export function ensureChecklistIds(checklist) {
  if (!Array.isArray(checklist)) return [];
  return checklist.map((item) => {
    if (!item || typeof item !== "object") return item;
    if (Array.isArray(item.items)) {
      return {
        ...item,
        id: item.id || randomUUID(),
        items: item.items.map((sub) =>
          sub && typeof sub === "object" && !sub.id
            ? { ...sub, id: randomUUID() }
            : sub,
        ),
      };
    }
    if (!item.id) return { ...item, id: randomUUID() };
    return item;
  });
}

/** Shared packing list: keep extra fields (including categoryId) on each item. */
export function normalizeSharedChecklist(checklist) {
  return ensureChecklistIds(checklist).map((item) => {
    if (!item || typeof item !== "object") return item;
    if (Array.isArray(item.items)) {
      return {
        ...item,
        items: item.items.map((sub) => persistChecklistCategoryId(sub, item.id)),
      };
    }
    return persistChecklistCategoryId(item);
  });
}

export function isFlatChecklist(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) return false;
  return checklist.every(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item.items),
  );
}

export function hasPendingInvite(trip, email) {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return (trip.pendingInvites || []).some(
    (p) => normalizeEmail(p.email) === normalized && p.status === "pending"
  );
}

export function attachAccessFlags(trip, userId, userEmail) {
  const access = getAccess(trip, userId);
  const invited =
    !access.isOwner && !access.isParticipant && hasPendingInvite(trip, userEmail);
  return {
    ...trip,
    isOwner: access.isOwner,
    isShared: access.isShared,
    isParticipant: access.isParticipant,
    isInvited: invited,
    canEdit: access.canEdit,
  };
}

export function processShareInvites(trip, emails, usersByEmail, invitedBy) {
  const ownerEmail = normalizeEmail(trip.userEmail);
  const existingSharedEmails = new Set(
    (trip.sharedWith || []).map((s) => normalizeEmail(s.email))
  );
  const existingPendingEmails = new Set(
    (trip.pendingInvites || [])
      .filter((p) => p.status === "pending")
      .map((p) => normalizeEmail(p.email))
  );

  const newParticipants = [];
  const newPendingInvites = [];
  const skipped = [];
  const seen = new Set();

  for (const rawEmail of emails) {
    const parsed = parseParticipantEmail(rawEmail);

    if (!parsed) {
      skipped.push({
        email: normalizeEmail(rawEmail) || String(rawEmail || "").trim(),
        reason: "invalid_email",
      });
      continue;
    }

    if (seen.has(parsed)) {
      skipped.push({ email: parsed, reason: "duplicate" });
      continue;
    }
    seen.add(parsed);

    if (parsed === ownerEmail) {
      skipped.push({ email: parsed, reason: "owner" });
      continue;
    }
    if (existingSharedEmails.has(parsed)) {
      skipped.push({ email: parsed, reason: "already_shared" });
      continue;
    }
    if (existingPendingEmails.has(parsed)) {
      skipped.push({ email: parsed, reason: "already_pending" });
      continue;
    }

    const user = usersByEmail.get(parsed);
    if (user && user.id === trip.userId) {
      skipped.push({ email: parsed, reason: "owner" });
      continue;
    }

    newPendingInvites.push(buildPendingInvite(parsed, invitedBy, user?.name || null));
    existingPendingEmails.add(parsed);
  }

  return { newParticipants, newPendingInvites, skipped };
}

export function promotePendingInvitesForEmail(trip, email, user) {
  const normalized = normalizeEmail(email);
  const pendingInvites = [...(trip.pendingInvites || [])];
  const sharedWith = [...(trip.sharedWith || [])];

  const matching = pendingInvites.filter(
    (p) => normalizeEmail(p.email) === normalized && p.status === "pending"
  );

  if (matching.length === 0) {
    return { sharedWith, pendingInvites, linked: false };
  }

  const alreadyShared = sharedWith.some(
    (s) => s.userId === user.id || normalizeEmail(s.email) === normalized
  );

  if (!alreadyShared) {
    sharedWith.push(buildParticipant(user, matching[0].invitedBy));
  }

  const updatedPending = pendingInvites.filter(
    (p) => normalizeEmail(p.email) !== normalized || p.status !== "pending"
  );

  return { sharedWith, pendingInvites: updatedPending, linked: true };
}

export async function linkPendingInvitesForUser(user) {
  const collection = getTripsCollection();
  if (!collection || !user?.email) {
    return 0;
  }

  const normalizedEmail = normalizeEmail(user.email);
  const trips = await collection
    .find({
      pendingInvites: {
        $elemMatch: { email: normalizedEmail, status: "pending" },
      },
    })
    .toArray();

  let linkedCount = 0;

  for (const trip of trips) {
    const { sharedWith, pendingInvites, linked } = promotePendingInvitesForEmail(
      trip,
      normalizedEmail,
      user
    );

    if (linked) {
      await collection.updateOne(
        buildIdQuery(trip.id || trip._id.toString()),
        {
          $set: {
            sharedWith,
            pendingInvites,
            updatedAt: new Date().toISOString(),
          },
        }
      );
      linkedCount += 1;
    }
  }

  return linkedCount;
}

export async function getPendingInvites(email) {
  const collection = getTripsCollection();
  if (!collection || !email) return [];

  const normalizedEmail = normalizeEmail(email);
  const trips = await collection
    .find({
      pendingInvites: {
        $elemMatch: { email: normalizedEmail, status: "pending" },
      },
    })
    .toArray();

  return trips.map((trip) => {
    const invite = trip.pendingInvites.find(
      (p) =>
        normalizeEmail(p.email) === normalizedEmail && p.status === "pending"
    );
    return {
      tripId: trip.id || trip._id?.toString(),
      tripName: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      imageUrl: trip.imageUrl,
      color: trip.color,
      ownerName: trip.userName || null,
      ownerEmail: trip.userEmail || null,
      invitedAt: invite?.invitedAt,
      invitedBy: invite?.invitedBy,
    };
  });
}

export async function createTrip(tripData, owner, { onboardingPreferences } = {}) {
  let intent;
  try {
    intent = resolveIntentForCreate(tripData, onboardingPreferences);
  } catch (error) {
    console.error("Failed to prefill trip intent from onboarding:", error);
    intent = undefined;
  }
  const document = buildTripDocument(tripData, owner, { intent });
  const collection = getTripsCollection();

  if (collection) {
    await collection.insertOne(document);
    return document;
  }

  return memoryStore.trips.create(document);
}

export async function updateById(tripId, updateData) {
  const collection = getTripsCollection();

  if (collection) {
    const result = await collection.findOneAndUpdate(
      buildIdQuery(tripId),
      { $set: updateData },
      { returnDocument: "after" }
    );
    return result;
  }

  return memoryStore.trips.update(tripId, updateData);
}

export async function deleteById(tripId) {
  const collection = getTripsCollection();

  if (collection) {
    const result = await collection.deleteOne(buildIdQuery(tripId));
    return result.deletedCount > 0;
  }

  return memoryStore.trips.delete(tripId);
}

export async function updateSharedChecklist(tripId, checklist) {
  const trip = normalizeDocument(await findById(tripId));
  if (!trip) return null;

  return updateById(trip.id, {
    checklist: normalizeSharedChecklist(checklist),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateChecklist(tripId, userId, checklist) {
  const trip = normalizeDocument(await findById(tripId));
  if (!trip) return null;

  const withIds = ensureChecklistIds(checklist);
  const userChecklists = trip.userChecklists || [];
  const index = userChecklists.findIndex((uc) => uc.userId === userId);

  let updatedUserChecklists;
  if (index >= 0) {
    updatedUserChecklists = [...userChecklists];
    updatedUserChecklists[index] = { userId, checklist: withIds };
  } else {
    updatedUserChecklists = [...userChecklists, { userId, checklist: withIds }];
  }

  return updateById(trip.id, {
    userChecklists: updatedUserChecklists,
    updatedAt: new Date().toISOString(),
  });
}

export async function applyShareInvites(trip, newParticipants, newPendingInvites) {
  const collection = getTripsCollection();
  if (!collection) {
    throw new Error("Database not available");
  }

  const pushUpdates = {};
  if (newParticipants.length > 0) {
    pushUpdates.sharedWith = { $each: newParticipants };
  }
  if (newPendingInvites.length > 0) {
    pushUpdates.pendingInvites = { $each: newPendingInvites };
  }

  const update = { $set: { updatedAt: new Date().toISOString() } };
  if (Object.keys(pushUpdates).length > 0) {
    update.$push = pushUpdates;
  }

  await collection.updateOne(buildIdQuery(trip.id), update);
  return findById(trip.id);
}

export async function revokeShare(tripId, userId) {
  const trip = await findById(tripId);
  if (!trip) return null;

  const sharedWith = (trip.sharedWith || []).filter((s) => s.userId !== userId);
  const collection = getTripsCollection();

  if (collection) {
    await collection.updateOne(buildIdQuery(trip.id), {
      $set: {
        sharedWith,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return sharedWith;
}

/**
 * Remove a participant from sharedWith (owner only — enforced in route).
 * Also removes their personal checklist entry.
 */
export async function removeParticipant(tripId, participantUserId) {
  const trip = normalizeDocument(await findById(tripId));
  if (!trip) {
    return { ok: false, status: 404, error: "Trip not found" };
  }

  const sharedWith = trip.sharedWith || [];
  const nextSharedWith = sharedWith.filter((s) => s.userId !== participantUserId);

  if (nextSharedWith.length === sharedWith.length) {
    return { ok: false, status: 404, error: "Participant not found" };
  }

  const userChecklists = (trip.userChecklists || []).filter(
    (uc) => uc.userId !== participantUserId
  );

  const collection = getTripsCollection();
  if (collection) {
    await collection.updateOne(buildIdQuery(trip.id), {
      $set: {
        sharedWith: nextSharedWith,
        userChecklists,
        updatedAt: new Date().toISOString(),
      },
    });
  } else {
    memoryStore.trips.update(trip.id, { sharedWith: nextSharedWith, userChecklists });
  }

  return {
    ok: true,
    sharedWith: nextSharedWith,
    pendingInvites: trip.pendingInvites || [],
  };
}

/**
 * Leave a trip (owner or participant). Solo trips cannot be left — use delete instead.
 * Owner leaving transfers ownership to the first sharedWith participant.
 */
export async function leaveTrip(tripId, userId) {
  const trip = normalizeDocument(await findById(tripId));
  if (!trip) {
    return { ok: false, status: 404, error: "Trip not found" };
  }

  const sharedWith = trip.sharedWith || [];
  const totalParticipants = 1 + sharedWith.length;
  if (totalParticipants <= 1) {
    return { ok: false, status: 400, error: "Cannot leave a solo trip" };
  }

  const owner = isOwner(trip, userId);
  const participant = isParticipant(trip, userId);
  if (!owner && !participant) {
    return { ok: false, status: 403, error: "Not a trip member" };
  }

  let nextUserId = trip.userId;
  let nextSharedWith = sharedWith;
  let userChecklists = trip.userChecklists || [];

  if (owner) {
    const newOwner = sharedWith[0];
    nextUserId = newOwner.userId;
    nextSharedWith = sharedWith.slice(1);
    userChecklists = userChecklists.filter((uc) => uc.userId !== userId);
  } else {
    nextSharedWith = sharedWith.filter((s) => s.userId !== userId);
    userChecklists = userChecklists.filter((uc) => uc.userId !== userId);
  }

  const collection = getTripsCollection();
  const updatePayload = {
    userId: nextUserId,
    sharedWith: nextSharedWith,
    userChecklists,
    updatedAt: new Date().toISOString(),
  };

  if (collection) {
    await collection.updateOne(buildIdQuery(trip.id), { $set: updatePayload });

    const db = getDatabase();
    if (db) {
      await db.collection("chats").updateMany(
        { contextType: "trip", contextId: trip.id },
        {
          $pull: { participants: { userId } },
          $set: { updatedAt: new Date() },
        },
      );
    }
  } else {
    memoryStore.trips.update(trip.id, updatePayload);
  }

  return { ok: true };
}

/**
 * Remove a pending email invite (owner only — enforced in route).
 */
export async function removePendingInvite(tripId, email) {
  const trip = normalizeDocument(await findById(tripId));
  if (!trip) {
    return { ok: false, status: 404, error: "Trip not found" };
  }

  const normalizedTarget = normalizeEmail(decodeURIComponent(email || ""));
  if (!normalizedTarget || !isValidEmail(normalizedTarget)) {
    return { ok: false, status: 400, error: "Invalid email address" };
  }

  const pendingInvites = trip.pendingInvites || [];
  const nextPendingInvites = pendingInvites.filter(
    (invite) =>
      !(
        normalizeEmail(invite.email) === normalizedTarget &&
        invite.status === "pending"
      )
  );

  if (nextPendingInvites.length === pendingInvites.length) {
    return { ok: false, status: 404, error: "Pending invite not found" };
  }

  const collection = getTripsCollection();
  if (collection) {
    await collection.updateOne(buildIdQuery(trip.id), {
      $set: {
        pendingInvites: nextPendingInvites,
        updatedAt: new Date().toISOString(),
      },
    });
  } else {
    memoryStore.trips.update(trip.id, { pendingInvites: nextPendingInvites });
  }

  return {
    ok: true,
    sharedWith: trip.sharedWith || [],
    pendingInvites: nextPendingInvites,
  };
}

export { buildTripDocument, normalizeDocument, normalizeEmail, isValidEmail, parseParticipantEmail };
