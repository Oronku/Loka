import { randomUUID } from "crypto";

/** MongoDB collection name */
export const COLLECTION_NAME = "trips";

/** Fields participants must not overwrite on trip update */
export const PROTECTED_UPDATE_FIELDS = [
  "_id",
  "userId",
  "userEmail",
  "userName",
  "createdAt",
  "sharedWith",
  "pendingInvites",
  "userChecklists",
  "timelineSnapshot",
];

/** Server-managed fields no client (even the owner) may set directly */
export const SERVER_MANAGED_FIELDS = ["timelineSnapshot"];

/**
 * @typedef {Object} TripParticipant
 * @property {string} userId
 * @property {string} email
 * @property {string} name
 * @property {string} role
 * @property {string} sharedAt
 * @property {string} expensePermission
 * @property {string} [invitedBy]
 */

/**
 * @typedef {Object} PendingInvite
 * @property {string} email
 * @property {string|null} [name]
 * @property {string} invitedAt
 * @property {string} invitedBy
 * @property {string} status
 */

/**
 * @typedef {Object} TripDocument
 * @property {string} id
 * @property {string} userId
 * @property {string} userEmail
 * @property {string} userName
 * @property {string} name
 * @property {TripParticipant[]} sharedWith
 * @property {PendingInvite[]} pendingInvites
 * @property {Array<{ userId: string, checklist: unknown[] }>} userChecklists
 */

export function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

/** Basic RFC-style check — good enough for invite validation */
export function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

/** @param {string} email @returns {string|null} normalized email or null if invalid */
export function parseParticipantEmail(email) {
  const normalized = normalizeEmail(email);
  return isValidEmail(normalized) ? normalized : null;
}

/** @param {{ id: string, email: string, name?: string }} user @param {string} invitedBy */
export function buildParticipant(user, invitedBy) {
  return {
    userId: user.id,
    email: normalizeEmail(user.email),
    name: user.name || user.email,
    role: "participant",
    sharedAt: new Date().toISOString(),
    expensePermission: "edit",
    invitedBy,
  };
}

/** @param {string} email @param {string} invitedBy @param {string|null} [name] */
export function buildPendingInvite(email, invitedBy, name = null) {
  return {
    email: normalizeEmail(email),
    name: name || null,
    invitedAt: new Date().toISOString(),
    invitedBy,
    status: "pending",
  };
}

/** @param {object} tripData @param {{ id: string, email: string, name?: string }} owner */
export function buildTripDocument(tripData, owner) {
  const now = new Date().toISOString();
  return {
    ...tripData,
    id: tripData.id || randomUUID(),
    userId: owner.id,
    userEmail: owner.email,
    userName: owner.name || null,
    destinations: tripData.destinations || [],
    flights: tripData.flights || [],
    hotels: tripData.hotels || [],
    rides: tripData.rides || [],
    attractions: tripData.attractions || [],
    sharedWith: tripData.sharedWith || [],
    pendingInvites: tripData.pendingInvites || [],
    userChecklists: tripData.userChecklists || [],
    timelineSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Ensure document has expected defaults (in-memory only). @param {TripDocument|null} trip */
export function normalizeDocument(trip) {
  if (!trip) return trip;

  if (!trip.id && trip._id) {
    trip.id = trip._id.toString();
  }

  trip.destinations = Array.isArray(trip.destinations) ? trip.destinations : [];
  trip.flights = Array.isArray(trip.flights) ? trip.flights : [];
  trip.hotels = Array.isArray(trip.hotels) ? trip.hotels : [];
  trip.rides = Array.isArray(trip.rides) ? trip.rides : [];
  trip.attractions = Array.isArray(trip.attractions) ? trip.attractions : [];
  trip.sharedWith = Array.isArray(trip.sharedWith) ? trip.sharedWith : [];
  trip.pendingInvites = Array.isArray(trip.pendingInvites)
    ? trip.pendingInvites
    : [];
  trip.userChecklists = Array.isArray(trip.userChecklists)
    ? trip.userChecklists
    : [];

  trip.userName = trip.userName || null;

  trip.sharedWith = trip.sharedWith.map((entry) => ({
    ...entry,
    role: entry.role || "participant",
    expensePermission: entry.expensePermission || "edit",
  }));

  return trip;
}
