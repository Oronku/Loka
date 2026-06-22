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

export { COLLECTION_NAME };

export function getTripsCollection() {
  const db = getDatabase();
  return db ? db.collection(COLLECTION_NAME) : null;
}

export function buildShareUrl(tripId) {
  const base =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5190";
  return `${base.replace(/\/$/, "")}/trips/${tripId}`;
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

export function sanitizeUpdatePayload(body, access) {
  const updateData = { ...body, updatedAt: new Date().toISOString() };
  delete updateData._id;

  const fieldsToStrip = access.isOwner
    ? ["_id", "userId", "userEmail", "createdAt", ...SERVER_MANAGED_FIELDS]
    : PROTECTED_UPDATE_FIELDS;

  for (const field of fieldsToStrip) {
    delete updateData[field];
  }

  return updateData;
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
    shareUrl: buildShareUrl(trip.id),
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

export async function createTrip(tripData, owner) {
  const document = buildTripDocument(tripData, owner);
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

export async function updateChecklist(tripId, userId, checklist) {
  const trip = normalizeDocument(await findById(tripId));
  if (!trip) return null;

  const userChecklists = trip.userChecklists || [];
  const index = userChecklists.findIndex((uc) => uc.userId === userId);

  let updatedUserChecklists;
  if (index >= 0) {
    updatedUserChecklists = [...userChecklists];
    updatedUserChecklists[index] = { userId, checklist };
  } else {
    updatedUserChecklists = [...userChecklists, { userId, checklist }];
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
