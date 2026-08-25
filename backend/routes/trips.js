import express from "express";
import {
  randomUUID
} from "crypto";
import {
  memoryStore
} from "../config/memoryStore.js";
import {
  verifyGoogleToken
} from "../middleware/auth.js";
import * as tripService from "../services/trip.service.js";
import {
  buildPendingSnapshot,
  markTripTimelinePending,
  rebuildTripTimeline,
  ensureTripTimeline,
  scheduleTimelineRebuild,
  TIMELINE_SNAPSHOT_VERSION,
} from "../services/timeline/index.js";
import {
  detectAttractionConflicts,
  detectAttractionWarnings,
  findAttractionIndex,
} from "../services/timeline.service.js";
import {
  priceFlight,
  buildPriceResponse,
  findFlightById,
} from "../services/flightPriceTracker.js";
import {
  expenseCurrency,
  isSettlementExpense,
  persistResolvedSplits,
  resolveExpenseShares,
  round2,
} from "../utils/expenseMath.js";
import {
  hasPaidBy,
  isDraftExpenseInput,
  removeLinkedDraftExpense,
  upsertDraftItemExpense,
} from "../utils/draftItemExpense.js";

const router = express.Router();

router.use(verifyGoogleToken);

function getTripsCollection() {
  return tripService.getTripsCollection();
}

function tripIdOf(trip) {
  return trip?.id || trip?._id?.toString() || null;
}

function isValidPaidBy(paidBy) {
  if (typeof paidBy === "string") return paidBy.length > 0;
  if (!Array.isArray(paidBy) || paidBy.length === 0) return false;
  return paidBy.every(
    (payer) => payer && typeof payer.userId === "string" && payer.userId.length > 0
  );
}

function inferHotelExpenseCurrency(trip, hotel, existingExpense) {
  const fromHotel =
    typeof hotel?.currency === "string" && hotel.currency.trim();
  if (fromHotel) return fromHotel.trim().toUpperCase();
  if (existingExpense?.currency) {
    return String(existingExpense.currency).trim().toUpperCase();
  }
  const sibling = (trip.expenses || []).find((e) => e?.currency);
  if (sibling?.currency) return String(sibling.currency).trim().toUpperCase();
  return "USD";
}

/** Normalize and attach access flags before returning a trip from expense mutations. */
function formatTripForClient(trip, user) {
  if (!trip) return trip;
  tripService.normalizeDocument(trip);
  return tripService.filterChecklistsForResponse(
    tripService.attachAccessFlags(trip, user.id, user.email),
    user.id,
  );
}

/**
 * Attach a complete timeline snapshot for a trip read. When the stored snapshot
 * is already full (pending:false) it's returned instantly with no recompute.
 * When it's missing or still a cheap `pending` placeholder, compute the travel
 * times on the spot (coalescing with any in-flight background rebuild) so the
 * caller always gets legs + transfers — clients only ever hit GET /:id.
 */
async function withTimelineSnapshot(trip) {
  if (!trip) return trip;
  const snapshot = trip.timelineSnapshot;
  const needsRebuild =
    !snapshot ||
    snapshot.pending ||
    snapshot.version !== TIMELINE_SNAPSHOT_VERSION;
  if (!needsRebuild) return trip;

  const id = tripIdOf(trip);
  if (!id) return {
    ...trip,
    timelineSnapshot: buildPendingSnapshot(trip)
  };

  const rebuilt = await ensureTripTimeline(id);
  return {
    ...trip,
    timelineSnapshot: rebuilt || buildPendingSnapshot(trip)
  };
}

/**
 * Respond to a mutating request immediately, while travel times compute in the
 * background. We persist a fresh `pending` snapshot first so any read during
 * the rebuild window reflects the latest items (never stale) and is clearly
 * flagged as still calculating; clients re-fetch until `pending` is false.
 */
function respondWithTimeline(req, res, trip, status = 200, extra) {
  const id = tripIdOf(trip);
  const snapshot = buildPendingSnapshot(trip);
  if (id) {
    markTripTimelinePending(trip)
      .catch(() => {})
      .finally(() => scheduleTimelineRebuild(id));
  }
  const withAccess = tripService.attachAccessFlags(
    trip,
    req.user.id,
    req.user.email,
  );
  return res.status(status).json({
    ...withAccess,
    timelineSnapshot: snapshot,
    ...extra,
  });
}

const CLEARABLE_ATTRACTION_FIELDS = [
  "scheduledDate",
  "scheduledTime",
  "meetingPoint",
  "meetingPointPlaceId",
];

function mergeAttractionPatch(prev, patch) {
  const stored = {
    ...prev,
    ...patch,
    id: prev.id,
  };
  for (const key of CLEARABLE_ATTRACTION_FIELDS) {
    if (patch[key] === "") {
      delete stored[key];
    }
  }
  if (patch.scheduledDate === "" || patch.scheduledTime === "") {
    delete stored.scheduledDateTime;
  }
  return stored;
}

const MS_PER_DAY = 86400000;

/**
 * Return the first date value that falls outside the trip's date range
 * (with a one-day tolerance for red-eyes / travel days), or null if all are
 * within range. Validation is skipped when the trip has no start/end dates.
 */
function dateOutsideTripRange(trip, dateValues, toleranceDays = 1) {
  if (!trip?.startDate || !trip?.endDate) return null;
  const dayIndex = (v) => {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : Math.floor(t / MS_PER_DAY);
  };
  const startDay = dayIndex(trip.startDate);
  const endDay = dayIndex(trip.endDate);
  if (startDay == null || endDay == null) return null;

  for (const value of dateValues) {
    if (!value) continue;
    const day = dayIndex(value);
    if (day == null) continue;
    if (day < startDay - toleranceDays || day > endDay + toleranceDays) {
      return value;
    }
  }
  return null;
}

/** Reject an item whose date(s) fall outside the trip range. Returns true if rejected. */
function rejectIfOutsideTripRange(res, trip, dateValues, label) {
  const offending = dateOutsideTripRange(trip, dateValues);
  if (!offending) return false;
  res.status(400).json({
    error: `${label} date is outside the trip dates`,
    message: `This ${label.toLowerCase()} is dated ${String(offending).slice(
      0,
      10
    )}, but the trip runs ${String(trip.startDate).slice(0, 10)} to ${String(
      trip.endDate
    ).slice(0, 10)}.`,
  });
  return true;
}

async function loadTrip(req, res, {
  requireEdit = true
} = {}) {
  const trip = await tripService.findById(req.params.id);

  if (!trip) {
    res.status(404).json({
      error: "Trip not found"
    });
    return null;
  }

  tripService.normalizeDocument(trip);
  const access = tripService.getAccess(trip, req.user.id);

  if (requireEdit && !access.canEdit) {
    res.status(403).json({
      error: "Access denied"
    });
    return null;
  }

  trip._access = access;
  return trip;
}

async function getTripOr404(req, res) {
  return loadTrip(req, res, {
    requireEdit: true
  });
}

// Get all trips for the authenticated user (owned + shared)
router.get("/", async (req, res) => {
  try {
    const collection = getTripsCollection();

    let trips;
    if (collection) {
      // Use MongoDB - get owned trips and trips shared with user
      const ownedTrips = await collection
        .find({
          userId: req.user.id
        })
        .sort({
          createdAt: -1
        })
        .toArray();
      const sharedTrips = await collection
        .find({
          "sharedWith.userId": req.user.id,
        })
        .sort({
          createdAt: -1
        })
        .toArray();

      // Mark shared trips with isShared flag
      sharedTrips.forEach((trip) => {
        trip.isShared = true;
        trip.isOwner = false;
        if (!trip.id) trip.id = trip._id.toString();
      });

      // Mark owned trips
      ownedTrips.forEach((trip) => {
        trip.isShared = false;
        trip.isOwner = true;
        if (!trip.id) trip.id = trip._id.toString();
      });

      trips = [...ownedTrips, ...sharedTrips];
    } else {
      // Fallback to memory store
      trips = memoryStore.trips
        .find()
        .filter(
          (t) =>
          t.userId === req.user.id ||
          (t.sharedWith && t.sharedWith.some((s) => s.userId === req.user.id))
        );
      trips.forEach((trip) => {
        trip.isOwner = trip.userId === req.user.id;
        trip.isShared = !trip.isOwner;
      });
    }

    res.json(trips);
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({
      error: "Failed to fetch trips"
    });
  }
});

// Get a single trip by ID (any authenticated user with the link can view)
router.get("/:id", async (req, res) => {
  try {
    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    const response = tripService.filterChecklistsForResponse(
      tripService.attachAccessFlags(trip, req.user.id, req.user.email),
      req.user.id
    );

    // Opening a trip returns the full snapshot; recomputes only when missing
    // or still pending, otherwise it's instant.
    res.json(await withTimelineSnapshot(response));
  } catch (error) {
    console.error("Error fetching trip:", error);
    res.status(500).json({
      error: "Failed to fetch trip"
    });
  }
});

// Return the trip's timeline snapshot (events + cached travel legs).
// Returns the stored snapshot as-is; rebuilds synchronously only when missing,
// stale (cheap placeholder), a different travel mode is requested, or
// ?refresh=true is passed.
router.get("/:id/timeline", async (req, res) => {
  try {
    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    const allowedModes = ["driving", "walking", "transit", "bicycling"];
    const mode = allowedModes.includes(req.query.mode) ?
      req.query.mode :
      "driving";

    const refresh = req.query.refresh === "true";
    const snapshot = trip.timelineSnapshot;
    const needsRebuild =
      refresh ||
      !snapshot ||
      snapshot.pending ||
      snapshot.version !== TIMELINE_SNAPSHOT_VERSION ||
      snapshot.mode !== mode;

    const timeline = needsRebuild ?
      await rebuildTripTimeline(trip.id, {
        mode
      }) :
      snapshot;

    res.json(timeline);
  } catch (error) {
    console.error("Error building trip timeline:", error);
    res
      .status(500)
      .json({
        error: "Failed to build timeline",
        message: error.message
      });
  }
});

// Create a new trip
router.post("/", async (req, res) => {
  try {
    const tripData = req.body;
    const collection = getTripsCollection();

    let createdTrip;
    if (collection) {
      const newTrip = await tripService.createTrip(tripData, req.user);
      createdTrip = newTrip;
      console.log(
        "✓ Trip saved to MongoDB:",
        createdTrip.id,
        "-",
        createdTrip.name,
        "for user:",
        req.user.email
      );
    } else {
      // Fallback to memory store
      createdTrip = await tripService.createTrip(tripData, req.user);
      console.log(
        "✓ Trip saved to memory:",
        createdTrip.id,
        "-",
        createdTrip.name,
        "for user:",
        req.user.email
      );
    }

    res.status(201).json(createdTrip);
  } catch (error) {
    console.error("Error creating trip:", error);
    res
      .status(500)
      .json({
        error: "Failed to create trip",
        message: error.message
      });
  }
});

// Update a trip
router.put("/:id", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const existingTrip = await loadTrip(req, res, {
      requireEdit: true
    });
    if (!existingTrip) return;

    const updateData = tripService.sanitizeUpdatePayload(
      req.body,
      existingTrip._access
    );

    let updated;
    if (collection) {
      const result = await collection.findOneAndUpdate(
        tripService.buildIdQuery(existingTrip.id), {
          $set: updateData
        }, {
          returnDocument: "after"
        }
      );

      if (!result) {
        return res.status(404).json({
          error: "Trip not found"
        });
      }
      updated = result;
      console.log("✓ Trip updated in MongoDB:", existingTrip.id);
    } else {
      updated = memoryStore.trips.update(existingTrip.id, updateData);
      if (!updated) {
        return res.status(404).json({
          error: "Trip not found"
        });
      }
      console.log("✓ Trip updated in memory:", existingTrip.id);
    }

    const bodyKeys = Object.keys(req.body || {}).filter(
      (key) => key !== "_id" && key !== "updatedAt"
    );
    const checklistOnly =
      bodyKeys.length === 0 ||
      (bodyKeys.length === 1 && bodyKeys[0] === "checklist");
    if (!checklistOnly) {
      scheduleTimelineRebuild(existingTrip.id);
    }
    res.json(tripService.normalizeDocument(updated));
  } catch (error) {
    console.error("Error updating trip:", error);
    res
      .status(500)
      .json({
        error: "Failed to update trip",
        message: error.message
      });
  }
});

// Update trip checklist (owner + participants). Flat
// {id,text,completed,categoryId?} items are the shared packing list;
// category-shaped payloads stay personal.
router.put("/:id/checklist", async (req, res) => {
  try {
    const { checklist } = req.body;
    if (!Array.isArray(checklist)) {
      return res.status(400).json({
        error: "Checklist must be an array",
      });
    }

    const existingTrip = await loadTrip(req, res, {
      requireEdit: true
    });
    if (!existingTrip) return;

    const withIds = tripService.ensureChecklistIds(checklist);
    const updated = tripService.isFlatChecklist(withIds)
      ? await tripService.updateSharedChecklist(existingTrip.id, withIds)
      : await tripService.updateChecklist(
          existingTrip.id,
          req.user.id,
          withIds
        );

    if (!updated) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    res.json(formatTripForClient(updated, req.user));
  } catch (error) {
    console.error("Error updating user checklist:", error);
    res
      .status(500)
      .json({
        error: "Failed to update checklist",
        message: error.message
      });
  }
});

// Delete a trip
router.delete("/:id", async (req, res) => {
  try {
    const collection = getTripsCollection();

    const existingTrip = await tripService.findById(req.params.id);

    if (!existingTrip) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    if (!tripService.isOwner(existingTrip, req.user.id)) {
      return res.status(403).json({
        error: "Only trip owner can delete"
      });
    }

    let deleted;
    if (collection) {
      deleted = await tripService.deleteById(existingTrip.id);
      if (deleted) {
        console.log("✓ Trip deleted from MongoDB:", req.params.id);
      }
    } else {
      // Fallback to memory store
      deleted = memoryStore.trips.delete(req.params.id);
      if (deleted) {
        console.log("✓ Trip deleted from memory:", req.params.id);
      }
    }

    if (!deleted) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    res.json({
      success: true,
      message: "Trip deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting trip:", error);
    res
      .status(500)
      .json({
        error: "Failed to delete trip",
        message: error.message
      });
  }
});

// Share trip with users by email (registered → sharedWith, unregistered → pendingInvites)
router.post("/:id/share", async (req, res) => {
  try {
    const {
      emails
    } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        error: "emails array is required"
      });
    }

    const collection = getTripsCollection();
    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    if (!trip._access.canShare) {
      return res.status(403).json({
        error: "Only trip owner can share"
      });
    }

    const db = collection ? collection.s.db : null;
    if (!db) {
      return res.status(500).json({
        error: "Database not available"
      });
    }

    const normalizedEmails = emails
      .map(tripService.parseParticipantEmail)
      .filter(Boolean);

    if (normalizedEmails.length === 0) {
      return res.status(400).json({
        error: "No valid email addresses provided",
        skipped: emails.map((email) => ({
          email: tripService.normalizeEmail(email) || String(email || "").trim(),
          reason: "invalid_email",
        })),
      });
    }

    const users = await db
      .collection("users")
      .find({
        email: {
          $in: normalizedEmails
        }
      })
      .toArray();

    const usersByEmail = new Map(
      users.map((user) => [tripService.normalizeEmail(user.email), user])
    );

    const {
      newParticipants,
      newPendingInvites,
      skipped
    } =
    tripService.processShareInvites(trip, emails, usersByEmail, req.user.id);

    if (newParticipants.length === 0 && newPendingInvites.length === 0) {
      const allInvalid = skipped.every((s) => s.reason === "invalid_email");
      return res.status(400).json({
        error: allInvalid ?
          "No valid email addresses provided" :
          "No new invitations created",
        skipped,
      });
    }

    const pushUpdates = {};
    if (newParticipants.length > 0) {
      pushUpdates.sharedWith = {
        $each: newParticipants
      };
    }
    if (newPendingInvites.length > 0) {
      pushUpdates.pendingInvites = {
        $each: newPendingInvites
      };
    }

    const update = {
      $set: {
        updatedAt: new Date().toISOString()
      }
    };
    if (Object.keys(pushUpdates).length > 0) {
      update.$push = pushUpdates;
    }

    await collection.updateOne(tripService.buildIdQuery(trip.id), update);

    const updatedTrip = await tripService.findById(trip.id);

    // TODO: send invitation email

    res.json({
      message: `Invited ${newParticipants.length + newPendingInvites.length} user(s)`,
      sharedWith: updatedTrip.sharedWith,
      pendingInvites: updatedTrip.pendingInvites || [],
      addedParticipants: newParticipants.length,
      addedPendingInvites: newPendingInvites.length,
      skipped,
    });
  } catch (error) {
    console.error("Error sharing trip:", error);
    res
      .status(500)
      .json({
        error: "Failed to share trip",
        message: error.message
      });
  }
});

// Remove pending invite by email (owner only) — must be before /:userId route
router.delete("/:id/share/pending/:email", async (req, res) => {
  try {
    const trip = await tripService.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    if (!tripService.isOwner(trip, req.user.id)) {
      return res
        .status(403)
        .json({
          error: "Only trip owner can remove participants"
        });
    }

    const result = await tripService.removePendingInvite(
      req.params.id,
      req.params.email
    );

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error
      });
    }

    res.json({
      message: "Pending invite removed successfully",
      sharedWith: result.sharedWith,
      pendingInvites: result.pendingInvites,
    });
  } catch (error) {
    console.error("Error removing pending invite:", error);
    res.status(500).json({
      error: "Failed to remove pending invite",
      message: error.message,
    });
  }
});

// Remove participant by userId (owner only)
router.delete("/:id/share/:userId", async (req, res) => {
  try {
    const {
      id,
      userId
    } = req.params;

    const trip = await tripService.findById(id);

    if (!trip) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    if (!tripService.isOwner(trip, req.user.id)) {
      return res
        .status(403)
        .json({
          error: "Only trip owner can remove participants"
        });
    }

    if (userId === trip.userId) {
      return res.status(400).json({
        error: "Cannot remove trip owner"
      });
    }

    const result = await tripService.removeParticipant(id, userId);

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error
      });
    }

    res.json({
      message: "Participant removed successfully",
      sharedWith: result.sharedWith,
      pendingInvites: result.pendingInvites,
    });
  } catch (error) {
    console.error("Error removing participant:", error);
    res.status(500).json({
      error: "Failed to remove participant",
      message: error.message,
    });
  }
});

// Accept a trip invitation (the invited user promotes themselves to participant)
router.post("/:id/invitations/accept", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const trip = await tripService.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    const email = req.user.email;
    const normalized = tripService.normalizeEmail(email);
    const hasPending = (trip.pendingInvites || []).some(
      (p) => tripService.normalizeEmail(p.email) === normalized && p.status === "pending"
    );

    if (!hasPending) {
      return res
        .status(404)
        .json({
          error: "No pending invitation for this trip"
        });
    }

    const {
      sharedWith,
      pendingInvites,
      linked
    } =
    tripService.promotePendingInvitesForEmail(trip, email, req.user);

    if (!linked) {
      return res.status(400).json({
        error: "Could not accept invitation"
      });
    }

    if (collection) {
      await collection.updateOne(tripService.buildIdQuery(trip.id), {
        $set: {
          sharedWith,
          pendingInvites,
          updatedAt: new Date().toISOString()
        },
      });
    } else {
      memoryStore.trips.update(trip.id, {
        sharedWith,
        pendingInvites
      });
    }

    const updated = await tripService.findById(trip.id);
    tripService.normalizeDocument(updated);
    res.json(tripService.attachAccessFlags(updated, req.user.id, req.user.email));
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({
      error: "Failed to accept invitation"
    });
  }
});

// Decline a trip invitation (removes the pending invite for the current user)
router.post("/:id/invitations/decline", async (req, res) => {
  try {
    const trip = await tripService.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    const result = await tripService.removePendingInvite(trip.id, req.user.email);

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error
      });
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error("Error declining invitation:", error);
    res.status(500).json({
      error: "Failed to decline invitation"
    });
  }
});

// Leave a trip (owner or participant; requires at least one other member)
router.post("/:id/leave", async (req, res) => {
  try {
    const result = await tripService.leaveTrip(req.params.id, req.user.id);

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error
      });
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error("Error leaving trip:", error);
    res.status(500).json({
      error: "Failed to leave trip"
    });
  }
});

export default router;

/**
 * Trip Sub-resources API
 * --------------------------------------
 * POST /api/trips/:id/flights       -> add a flight segment
 * POST /api/trips/:id/hotels        -> add a hotel booking
 * POST /api/trips/:id/rides         -> add a ride leg
 * POST /api/trips/:id/attractions              -> add an attraction visit
 * PATCH /api/trips/:id/attractions/:itemId     -> partial-update an attraction by id
 * DELETE /api/trips/:id/:type/:idx             -> remove by index (type in flights|hotels|rides|attractions)
 */

router.post("/:id/flights", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const flight = req.body || {};
  // minimal validation
  if (
    !flight.flightNumber ||
    !flight.departureDateTime ||
    !flight.arrivalDateTime
  ) {
    return res.status(400).json({
      error: "flightNumber, departureDateTime and arrivalDateTime are required",
    });
  }
  if (
    rejectIfOutsideTripRange(
      res,
      trip,
      [flight.departureDateTime, flight.arrivalDateTime],
      "Flight"
    )
  )
    return;
  // Optional departureAirport/arrivalAirport (IATA code or name, stored as-is)
  // let the timeline route travel to/from the correct airports.
  if (!flight.id) flight.id = randomUUID();
  trip.flights.push(flight);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne({
      id: trip.id
    }, {
      $set: {
        flights: trip.flights,
        updatedAt: new Date().toISOString(),
      },
    });
    updated = await collection.findOne({
      id: trip.id
    });
  } else {
    updated = memoryStore.trips.update(trip.id, {
      flights: trip.flights,
    });
  }

  respondWithTimeline(req, res, updated, 201);
});

router.get("/:id/flights/:flightId/price", async (req, res) => {
  try {
    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    const {
      flight,
      flightId
    } = findFlightById(trip, req.params.flightId);
    if (!flight || !flightId) {
      return res.status(404).json({
        error: "Flight not found"
      });
    }

    const tripId = tripIdOf(trip);
    const payload = await buildPriceResponse(
      tripId,
      flightId,
      flight.departureDateTime,
    );
    res.json(payload);
  } catch (error) {
    console.error("Error fetching flight price:", error);
    res.status(500).json({
      error: "Failed to fetch flight price"
    });
  }
});

router.post("/:id/flights/:flightId/price/refresh", async (req, res) => {
  try {
    const trip = await getTripOr404(req, res);
    if (!trip) return;

    const {
      flight,
      flightId
    } = findFlightById(trip, req.params.flightId);
    if (!flight || !flightId) {
      return res.status(404).json({
        error: "Flight not found"
      });
    }

    const tripId = tripIdOf(trip);
    await priceFlight(trip, flight, flightId);

    const payload = await buildPriceResponse(
      tripId,
      flightId,
      flight.departureDateTime,
    );
    res.json(payload);
  } catch (error) {
    console.error("Error refreshing flight price:", error);
    res.status(500).json({
      error: "Failed to refresh flight price"
    });
  }
});

router.post("/:id/hotels", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const hotel = req.body || {};

  if (!hotel.name || !hotel.checkIn || !hotel.checkOut) {
    return res
      .status(400)
      .json({
        error: "name, checkIn and checkOut are required"
      });

  }

  if (hotel.isIdea) {
    trip.hotels.push({
      ...hotel,
      isIdea: true,
      checkIn: hotel.checkIn || "",
      checkOut: hotel.checkOut || "",
    });
  } else {
    if (!hotel.checkIn || !hotel.checkOut) {
      return res
        .status(400)
        .json({ error: "name, checkIn and checkOut are required" });
    }
    if (
      rejectIfOutsideTripRange(
        res,
        trip,
        [hotel.checkIn, hotel.checkOut],
        "Hotel"
      )
    )
      return;
  }

  // Generate hotel ID for linking with expenses
  if (!hotel.id) hotel.id = `hotel-${Date.now()}`;


  // If hotel has a cost, create a corresponding expense
  const expenses = trip.expenses || [];
  const costAmount = parseFloat(hotel.cost);
  
  if (hotel.cost && costAmount > 0) {
    const hotelExpense = persistResolvedSplits({
      id: `expense-${Date.now()}`,
      title: hotel.name,
      description: "Hotel booking",
      amount: costAmount,
      currency: inferHotelExpenseCurrency(trip, hotel),
      category: "hotel",
      date: hotel.checkIn,
      paidBy: req.user.id,
      splits: [{
        userId: req.user.id,
        amount: costAmount,
      }],
      splitMethod: "equal",
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      linkedHotelId: hotel.id,
    });
    expenses.push(hotelExpense);
  }

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      tripService.buildIdQuery(trip.id), {
        $set: {
          hotels: trip.hotels,
          expenses: expenses,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    updated = await tripService.findById(trip.id);
  } else {
    updated = memoryStore.trips.update(trip.id, {
      hotels: trip.hotels,
      expenses: expenses,
    });
  }

  respondWithTimeline(req, res, updated, 201);
});

router.put("/:id/hotels/:idx", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const {
    idx
  } = req.params;
  const hotel = req.body || {};

  const i = parseInt(idx, 10);
  if (Number.isNaN(i) || i < 0 || i >= trip.hotels.length) {
    return res.status(400).json({
      error: "Invalid hotel index"
    });
  }

  if (!hotel.name || !hotel.checkIn || !hotel.checkOut) {
    return res
      .status(400)
      .json({
        error: "name, checkIn and checkOut are required"
      });
  }

  if (
    rejectIfOutsideTripRange(
      res,
      trip,
      [hotel.checkIn, hotel.checkOut],
      "Hotel"
    )
  )
    return;

  const oldHotel = trip.hotels[i];
  const hotelId = oldHotel.id || `hotel-${Date.now()}`;

  // Update hotel
  trip.hotels[i] = {
    ...hotel,
    id: hotelId
  };

  // Update or create/delete corresponding expense
  const expenses = trip.expenses || [];
  const expenseIndex = expenses.findIndex(e => e.linkedHotelId === hotelId);

  const costAmount = parseFloat(hotel.cost);
  if (hotel.cost && costAmount > 0) {
    // Hotel has cost - update or create expense
    const existingHotelExpense =
      expenseIndex >= 0 ? expenses[expenseIndex] : null;
    const hotelExpense = persistResolvedSplits({
      id: existingHotelExpense?.id || `expense-${Date.now()}`,
      title: hotel.name,
      description: "Hotel booking",
      amount: costAmount,
      currency: inferHotelExpenseCurrency(trip, hotel, existingHotelExpense),
      category: ["food", "hotel", "flight", "ride", "activity", "shopping", "other"].includes(
        existingHotelExpense?.category,
      )
        ? existingHotelExpense.category
        : "hotel",
      date: hotel.checkIn,
      paidBy: existingHotelExpense?.paidBy || req.user.id,
      splits: existingHotelExpense?.splits || [{
        userId: req.user.id,
        amount: costAmount,
      }],
      splitMethod: existingHotelExpense?.splitMethod || "equal",
      createdBy: existingHotelExpense?.createdBy || req.user.id,
      createdAt: existingHotelExpense?.createdAt || new Date().toISOString(),
      linkedHotelId: hotelId,
    });

    if (expenseIndex >= 0) {
      expenses[expenseIndex] = hotelExpense;
    } else {
      expenses.push(hotelExpense);
    }
  } else if (expenseIndex >= 0) {
    // Hotel has no cost but expense exists - remove it
    expenses.splice(expenseIndex, 1);
  }

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      tripService.buildIdQuery(trip.id), {
        $set: {
          hotels: trip.hotels,
          expenses: expenses,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    updated = await tripService.findById(trip.id);
  } else {
    updated = memoryStore.trips.update(trip.id, {
      hotels: trip.hotels,
      expenses: expenses,
    });
  }

  respondWithTimeline(req, res, updated, 200);
});

router.post("/:id/rides", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const ride = req.body || {};
  if (!ride.pickup || !ride.dropoff) {
    return res.status(400).json({
      error: "pickup and dropoff are required"
    });
  }
  if (
    rejectIfOutsideTripRange(
      res,
      trip,
      [ride.pickupDateTime, ride.dropoffDateTime],
      "Ride"
    )
  )
    return;
  // Optional pickupDateTime/dropoffDateTime (stored as-is) let the ride be
  // ordered in the timeline; without them it falls into the unscheduled bucket.
  if (!ride.id) ride.id = randomUUID();
  trip.rides.push(ride);

  const rideDraft = upsertDraftItemExpense(trip, {
    item: ride,
    itemType: "ride",
    category: "ride",
    createdBy: req.user.id,
  });
  trip.expenses = rideDraft.expenses;

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne({
      id: trip.id
    }, {
      $set: {
        rides: trip.rides,
        expenses: trip.expenses,
        updatedAt: new Date().toISOString()
      }
    });
    updated = await collection.findOne({
      id: trip.id
    });
  } else {
    updated = memoryStore.trips.update(trip.id, {
      rides: trip.rides,
      expenses: trip.expenses,
    });
  }

  respondWithTimeline(req, res, updated, 201);
});

router.post("/:id/attractions", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const attraction = req.body || {};
  if (!attraction.name) {
    return res.status(400).json({
      error: "name is required"
    });
  }

  // When scheduled, block overlaps with flights / other attractions unless the
  // client explicitly forces the save (?force=true or body.force).
  const force = req.query.force === "true" || attraction.force === true;
  delete attraction.force;
  if (!attraction.id) attraction.id = randomUUID();

  // Upsert: if the same place (or name) is already on the trip, update it in
  // place instead of creating a duplicate.
  const existingIndex = findAttractionIndex(trip, attraction);

  if (!force) {
    const conflicts = detectAttractionConflicts(trip, attraction, {
      excludeIndex: existingIndex,
    });
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: "Schedule conflict",
        code: "SCHEDULE_CONFLICT",
        conflicts,
      });
    }
  }

  if (
    rejectIfOutsideTripRange(
      res,
      trip,
      [attraction.scheduledDateTime, attraction.scheduledDate],
      "Attraction"
    )
  )
    return;

  let stored = attraction;
  if (existingIndex >= 0) {
    const prev = trip.attractions[existingIndex];
    stored = {
      ...prev,
      ...attraction,
      id: prev.id || attraction.id,
    };
    trip.attractions[existingIndex] = stored;
  } else {
    trip.attractions.push(attraction);
  }

  const attractionDraft = upsertDraftItemExpense(trip, {
    item: stored,
    itemType: "attraction",
    category: "activity",
    createdBy: req.user.id,
  });
  trip.expenses = attractionDraft.expenses;

  const warnings = detectAttractionWarnings(trip, stored);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne({
      id: trip.id
    }, {
      $set: {
        attractions: trip.attractions,
        expenses: trip.expenses,
        updatedAt: new Date().toISOString(),
      },
    });
    updated = await collection.findOne({
      id: trip.id
    });
  } else {
    updated = memoryStore.trips.update(trip.id, {
      attractions: trip.attractions,
      expenses: trip.expenses,
    });
  }

  respondWithTimeline(req, res, updated, 201, {
    warnings
  });
});

router.patch("/:id/attractions/:itemId", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;

  const itemId = req.params.itemId;
  const existingIndex = (trip.attractions || []).findIndex(
    (a) => a && a.id === itemId
  );
  if (existingIndex < 0) {
    return res.status(404).json({
      error: "Attraction not found"
    });
  }

  const patch = {
    ...(req.body || {})
  };
  const force = req.query.force === "true" || patch.force === true;
  delete patch.force;
  delete patch.id;
  delete patch._id;

  const prev = trip.attractions[existingIndex];
  const stored = mergeAttractionPatch(prev, patch);

  if (!force) {
    const conflicts = detectAttractionConflicts(trip, stored, {
      excludeId: itemId,
      excludeIndex: existingIndex,
    });
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: "Schedule conflict",
        code: "SCHEDULE_CONFLICT",
        conflicts,
      });
    }
  }

  if (
    rejectIfOutsideTripRange(
      res,
      trip,
      [stored.scheduledDateTime, stored.scheduledDate],
      "Attraction"
    )
  )
    return;

  trip.attractions[existingIndex] = stored;

  const attractionDraft = upsertDraftItemExpense(trip, {
    item: stored,
    itemType: "attraction",
    category: "activity",
    createdBy: req.user.id,
  });
  trip.expenses = attractionDraft.expenses;

  const warnings = detectAttractionWarnings(trip, stored);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne({
      id: trip.id
    }, {
      $set: {
        attractions: trip.attractions,
        expenses: trip.expenses,
        updatedAt: new Date().toISOString(),
      },
    });
    updated = await collection.findOne({
      id: trip.id
    });
  } else {
    updated = memoryStore.trips.update(trip.id, {
      attractions: trip.attractions,
      expenses: trip.expenses,
    });
  }

  const snapshotTrip = updated || trip;
  const id = tripIdOf(snapshotTrip);
  const snapshot = buildPendingSnapshot(snapshotTrip);
  if (id) {
    markTripTimelinePending(snapshotTrip)
      .catch(() => {})
      .finally(() => scheduleTimelineRebuild(id));
  }
  return res.status(200).json({
    trip: {
      ...snapshotTrip,
      timelineSnapshot: snapshot,
    },
    warnings,
  });
});

router.delete("/:id/:type/:idx", async (req, res) => {
  const trip = await getTripOr404(req, res);
  if (!trip) return;
  const {
    type,
    idx
  } = req.params;
  const valid = ["flights", "hotels", "rides", "attractions"];
  if (!valid.includes(type))
    return res.status(400).json({
      error: "Invalid type"
    });
  const i = parseInt(idx, 10);
  if (Number.isNaN(i) || i < 0 || i >= trip[type].length)
    return res.status(400).json({
      error: "Invalid index"
    });

  // If deleting a hotel, also remove its linked expense
  let expenses = trip.expenses || [];
  if (type === "hotels" && trip.hotels[i].id) {
    const hotelId = trip.hotels[i].id;
    const expenseIndex = expenses.findIndex(e => e.linkedHotelId === hotelId);
    if (expenseIndex >= 0) {
      expenses.splice(expenseIndex, 1);
    }
  }
  if (type === "attractions" && trip.attractions[i]?.id) {
    expenses = removeLinkedDraftExpense(
      expenses,
      "attraction",
      trip.attractions[i].id,
    );
  }
  if (type === "rides" && trip.rides[i]?.id) {
    expenses = removeLinkedDraftExpense(expenses, "ride", trip.rides[i].id);
  }

  trip[type].splice(i, 1);

  const collection = getTripsCollection();
  let updated;
  if (collection) {
    await collection.updateOne(
      tripService.buildIdQuery(trip.id), {
        $set: {
          [type]: trip[type],
          expenses: expenses,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    updated = await tripService.findById(trip.id);
  } else {
    updated = memoryStore.trips.update(trip.id, {
      [type]: trip[type],
      expenses: expenses,
    });
  }

  respondWithTimeline(req, res, updated, 200);
});

// ============= EXPENSE MANAGEMENT ENDPOINTS =============

// Add expense to trip
router.post("/:id/expenses", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const {
      expense
    } = req.body;

    const trip = await loadTrip(req, res, {
      requireEdit: true
    });
    if (!trip) return;

    if (!expense) {
      return res.status(400).json({
        error: "expense is required"
      });
    }
    if (!hasPaidBy(expense.paidBy) && !isDraftExpenseInput(expense)) {
      return res.status(400).json({
        error: "paidBy is required"
      });
    }

    const { paidBy: incomingPaidBy, ...expenseRest } = expense;

    // Add expense with metadata. Drafts omit paidBy (payment not recorded yet).
    const newExpense = persistResolvedSplits({
      ...expenseRest,
      ...(hasPaidBy(incomingPaidBy) ? { paidBy: incomingPaidBy } : {}),
      id: `expense-${randomUUID()}`,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    });

    const expenses = trip.expenses || [];
    expenses.push(newExpense);

    let updated;
    if (collection) {
      const result = await collection.updateOne(tripService.buildIdQuery(trip.id), {
        $set: {
          expenses,
          updatedAt: new Date().toISOString()
        },
      });
      if (result.matchedCount === 0) {
        return res.status(404).json({
          error: "Trip not found"
        });
      }
      updated = await tripService.findById(trip.id);
    } else {
      updated = memoryStore.trips.update(trip.id, {
        expenses
      });
    }

    if (!updated) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    res.json(formatTripForClient(updated, req.user));
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({
      error: "Failed to add expense"
    });
  }
});

// Update expense
router.put("/:id/expenses/:expenseId", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const {
      expense
    } = req.body;

    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    // Find the expense
    const expenses = trip.expenses || [];
    const expenseIndex = expenses.findIndex(
      (e) => e.id === req.params.expenseId
    );

    if (expenseIndex === -1) {
      return res.status(404).json({
        error: "Expense not found"
      });
    }

    const isCreator = expenses[expenseIndex].createdBy === req.user.id;

    if (!trip._access.canEdit && !isCreator) {
      return res
        .status(403)
        .json({
          error: "No permission to edit this expense"
        });
    }

    if (
      expense &&
      Object.prototype.hasOwnProperty.call(expense, "paidBy") &&
      !isValidPaidBy(expense.paidBy)
    ) {
      return res.status(400).json({
        error: "paidBy is required"
      });
    }

    expenses[expenseIndex] = persistResolvedSplits({
      ...expenses[expenseIndex],
      ...expense,
      paidBy: Object.prototype.hasOwnProperty.call(expense || {}, "paidBy")
        ? expense.paidBy
        : expenses[expenseIndex].paidBy,
      id: req.params.expenseId,
    });

    let updated;
    if (collection) {
      await collection.updateOne(tripService.buildIdQuery(trip.id), {
        $set: {
          expenses,
          updatedAt: new Date().toISOString()
        },
      });
      updated = await tripService.findById(trip.id);
    } else {
      updated = memoryStore.trips.update(trip.id, {
        expenses
      });
    }

    if (!updated) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    res.json(formatTripForClient(updated, req.user));
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({
      error: "Failed to update expense"
    });
  }
});

// Delete expense
router.delete("/:id/expenses/:expenseId", async (req, res) => {
  try {
    console.log("DELETE expense request:", {
      tripId: req.params.id,
      expenseId: req.params.expenseId,
      userId: req.user?.id,
      hasUser: !!req.user,
    });

    if (!req.user) {
      console.log("No user found in request");
      return res.status(401).json({
        error: "Authentication required"
      });
    }

    const collection = getTripsCollection();

    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    const expenses = trip.expenses || [];
    console.log("Found expenses:", expenses.length);
    const expenseIndex = expenses.findIndex(
      (e) => e.id === req.params.expenseId
    );

    if (expenseIndex === -1) {
      console.log("Expense not found:", req.params.expenseId);
      console.log(
        "Available expense IDs:",
        expenses.map((e) => e.id)
      );
      return res.status(404).json({
        error: "Expense not found"
      });
    }

    const isCreator = expenses[expenseIndex].createdBy === req.user.id;

    console.log("Permission check:", {
      canEdit: trip._access.canEdit,
      isCreator,
      tripUserId: trip.userId,
      reqUserId: req.user.id,
      expenseCreatedBy: expenses[expenseIndex].createdBy,
    });

    if (!trip._access.canEdit && !isCreator) {
      return res
        .status(403)
        .json({
          error: "No permission to delete this expense"
        });
    }

    expenses.splice(expenseIndex, 1);

    let updated;
    if (collection) {
      await collection.updateOne(tripService.buildIdQuery(trip.id), {
        $set: {
          expenses,
          updatedAt: new Date().toISOString()
        },
      });
      updated = await tripService.findById(trip.id);
    } else {
      updated = memoryStore.trips.update(trip.id, {
        expenses
      });
    }

    if (!updated) {
      return res.status(404).json({
        error: "Trip not found"
      });
    }

    res.json(formatTripForClient(updated, req.user));
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({
      error: "Failed to delete expense"
    });
  }
});

// Update participant expense permission
router.put("/:id/participants/:userId/permission", async (req, res) => {
  try {
    const collection = getTripsCollection();
    const {
      permission
    } = req.body;

    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    if (!trip._access.canShare) {
      return res
        .status(403)
        .json({
          error: "Only trip owner can update permissions"
        });
    }

    // Update shared user permission
    const sharedWith = trip.sharedWith || [];
    const userIndex = sharedWith.findIndex(
      (s) => s.userId === req.params.userId
    );

    if (userIndex === -1) {
      return res.status(404).json({
        error: "User not found in shared list"
      });
    }

    sharedWith[userIndex].expensePermission = permission;

    let updated;
    if (collection) {
      await collection.updateOne(tripService.buildIdQuery(trip.id), {
        $set: {
          sharedWith,
          updatedAt: new Date().toISOString()
        },
      });
      updated = await tripService.findById(trip.id);
    } else {
      updated = memoryStore.trips.update(trip.id, {
        sharedWith
      });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating permission:", error);
    res.status(500).json({
      error: "Failed to update permission"
    });
  }
});

// Calculate balances
router.get("/:id/expenses/balances", async (req, res) => {
  try {
    const trip = await loadTrip(req, res, {
      requireEdit: false
    });
    if (!trip) return;

    if (!trip._access.canEdit) {
      return res.status(403).json({
        error: "No access to expenses"
      });
    }

    const expenses = trip.expenses || [];

    const emptyParticipants = () => {
      const participants = {};
      participants[trip.userId] = {
        userId: trip.userId,
        name: trip.userName || "Owner",
        email: trip.userEmail || "",
        totalPaid: 0,
        totalOwed: 0,
        balance: 0,
      };
      trip.sharedWith?.forEach((user) => {
        if (user.expensePermission && user.expensePermission !== "disable") {
          participants[user.userId] = {
            userId: user.userId,
            name: user.name,
            email: user.email,
            totalPaid: 0,
            totalOwed: 0,
            balance: 0,
          };
        }
      });
      return participants;
    };

    const byCurrency = {};
    expenses.forEach((expense) => {
      const currency = expenseCurrency(expense);
      if (!byCurrency[currency]) {
        byCurrency[currency] = {
          currency,
          participants: emptyParticipants(),
          totalExpenses: 0,
        };
      }
      const bucket = byCurrency[currency];
      if (!isSettlementExpense(expense)) {
        bucket.totalExpenses = round2(bucket.totalExpenses + (expense.amount || 0));
      }

      if (!hasPaidBy(expense.paidBy)) {
        return;
      }

      if (typeof expense.paidBy === "string") {
        if (bucket.participants[expense.paidBy]) {
          bucket.participants[expense.paidBy].totalPaid = round2(
            bucket.participants[expense.paidBy].totalPaid + expense.amount,
          );
        }
      } else if (Array.isArray(expense.paidBy)) {
        expense.paidBy.forEach((payer) => {
          if (bucket.participants[payer.userId]) {
            bucket.participants[payer.userId].totalPaid = round2(
              bucket.participants[payer.userId].totalPaid + (payer.amount || 0),
            );
          }
        });
      }

      resolveExpenseShares(expense).forEach((share) => {
        if (!bucket.participants[share.userId]) return;
        bucket.participants[share.userId].totalOwed = round2(
          bucket.participants[share.userId].totalOwed + share.amount,
        );
      });
    });

    const currencies = Object.values(byCurrency)
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((bucket) => {
        Object.values(bucket.participants).forEach((p) => {
          p.balance = round2(p.totalPaid - p.totalOwed);
        });
        return {
          currency: bucket.currency,
          participants: Object.values(bucket.participants),
          totalExpenses: bucket.totalExpenses,
        };
      });

    res.json({
      currencies,
      participants: currencies[0]?.participants ?? [],
      totalExpenses: currencies.length === 1 ? currencies[0].totalExpenses : 0,
    });
  } catch (error) {
    console.error("Error calculating balances:", error);
    res.status(500).json({
      error: "Failed to calculate balances"
    });
  }
});