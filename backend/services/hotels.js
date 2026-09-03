import { memoryStore } from "../config/memoryStore.js";
import * as tripService from "./trip.service.js";
import { persistResolvedSplits } from "../utils/expenseMath.js";
import {
  DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS,
  POST_FLIGHT_BUFFER_SECONDS,
} from "./timeline/shared/constants.js";
import { extractLocation } from "./timeline/shared/location.js";
import {
  addSecondsWallClock,
  combineDateAndTime,
  dayKey,
  toTime,
  wallClockMs,
} from "./timeline/shared/wallClock.js";

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** Industry-standard afternoon check-in when the user/API omits a time of day. */
const DEFAULT_CHECK_IN_TIME = "15:00";

/** Industry-standard late-morning check-out when the user/API omits a time of day. */
const DEFAULT_CHECK_OUT_TIME = "11:00";

// ---------------------------------------------------------------------------
// Validation and normalization
// ---------------------------------------------------------------------------

/**
 * Validate hotel create/update input.
 * @param {object} input
 * @returns {{ ok: true } | { ok: false, error: string, message?: string }}
 */
export function validateHotelInput(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "name is required" };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { ok: false, error: "name is required" };
  }

  const isIdea = Boolean(input.isIdea);
  if (!isIdea) {
    if (!input.checkIn || !input.checkOut) {
      return {
        ok: false,
        error: "name, checkIn and checkOut are required",
      };
    }
  }

  if (input.checkIn && input.checkOut) {
    const inDay = String(input.checkIn).slice(0, 10);
    const outDay = String(input.checkOut).slice(0, 10);
    if (outDay < inDay) {
      return {
        ok: false,
        error: "checkOut must be on or after checkIn",
        message: `Check-out (${outDay}) is before check-in (${inDay}).`,
      };
    }
  }

  return { ok: true };
}

function shortIdSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Normalize a hotel payload into the stored shape.
 * @param {object} input
 * @param {{ existing?: object|null }} [opts]
 */
export function normalizeHotel(input, { existing = null } = {}) {
  const isIdea = Boolean(input.isIdea);
  const costAmount = parseFloat(input.cost);
  const cost =
    Number.isFinite(costAmount) && costAmount > 0 ? costAmount : null;

  // On create, ignore client/search ids (e.g. Google place ids) — duplicates
  // would make arrayFilters/$pull hit every hotel sharing that id.
  const id = existing?.id || `hotel-${Date.now()}-${shortIdSuffix()}`;

  const hotel = {
    ...input,
    id,
    name: String(input.name || "").trim(),
    cost,
    isIdea,
  };

  if (isIdea) {
    hotel.checkIn = "";
    hotel.checkOut = "";
  } else {
    // Always persist an explicit time of day so timeline sort never sees a
    // date-only string (parsed as UTC midnight) and jumps ahead of same-day flights.
    hotel.arrivalTime =
      input.arrivalTime || input.checkInTime || DEFAULT_CHECK_IN_TIME;
    hotel.checkOutTime =
      input.checkOutTime || input.departureTime || DEFAULT_CHECK_OUT_TIME;
  }

  return hotel;
}

/**
 * Whole nights between check-in and check-out dates, or 0.
 * @param {object} hotel
 * @returns {number}
 */
export function countNights(hotel) {
  if (!hotel?.checkIn || !hotel?.checkOut) return 0;
  const inDay = String(hotel.checkIn).slice(0, 10);
  const outDay = String(hotel.checkOut).slice(0, 10);
  const inMs = new Date(`${inDay}T00:00:00`).getTime();
  const outMs = new Date(`${outDay}T00:00:00`).getTime();
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs < inMs) return 0;
  return Math.round((outMs - inMs) / 86400000);
}

// ---------------------------------------------------------------------------
// Timeline events
// ---------------------------------------------------------------------------

/**
 * Build check-in / check-out timeline events for a hotel.
 * @param {object} hotel
 * @param {number} sourceIndex
 * @returns {object[]}
 */
export function buildHotelEvents(hotel, sourceIndex) {
  if (!hotel || hotel.isIdea || !hotel.checkIn || !hotel.checkOut) return [];

  const checkInTimeOfDay =
    hotel.arrivalTime || hotel.checkInTime || DEFAULT_CHECK_IN_TIME;
  const checkOutTimeOfDay =
    hotel.checkOutTime || hotel.departureTime || DEFAULT_CHECK_OUT_TIME;

  const checkInAt = combineDateAndTime(hotel.checkIn, checkInTimeOfDay);
  const checkOutAt = combineDateAndTime(hotel.checkOut, checkOutTimeOfDay);
  // Geocodable for routing generators — may be "lat,lng".
  const hotelLocation = extractLocation(hotel) || hotel.name || null;
  // Human-readable card line — never coordinates, never the hotel name.
  const displayLocation =
    (typeof hotel.address === "string" && hotel.address.trim()) ||
    (typeof hotel.formatted_address === "string" &&
      hotel.formatted_address.trim()) ||
    (typeof hotel.vicinity === "string" && hotel.vicinity.trim()) ||
    null;
  const hotelId = hotel.id || `hotel-${sourceIndex}`;
  const nights = countNights(hotel);
  const checkInDate = String(hotel.checkIn).slice(0, 10);
  const checkOutDate = String(hotel.checkOut).slice(0, 10);

  return [
    {
      id: `${hotelId}-checkin`,
      hotelId,
      type: "hotel-checkin",
      sourceIndex,
      title: hotel.name ? `Check in: ${hotel.name}` : "Hotel check-in",
      subtitle: null,
      // The bare name, because `title` is prefixed and `subtitle` is dropped.
      hotelName: hotel.name || null,
      start: checkInAt,
      end: checkInAt,
      arrival: checkInAt,
      plannedStart: checkInAt,
      adjusted: false,
      adjustmentReason: null,
      checkInDate,
      checkOutDate,
      nights,
      location: hotelLocation,
      displayLocation,
      sortKey: toTime(checkInAt),
      raw: hotel,
    },
    {
      id: `${hotelId}-checkout`,
      hotelId,
      type: "hotel-checkout",
      sourceIndex,
      title: hotel.name ? `Check out: ${hotel.name}` : "Hotel check-out",
      subtitle: null,
      hotelName: hotel.name || null,
      start: checkOutAt,
      end: checkOutAt,
      arrival: checkOutAt,
      plannedStart: checkOutAt,
      adjusted: false,
      adjustmentReason: null,
      checkInDate,
      checkOutDate,
      nights,
      location: hotelLocation,
      displayLocation,
      sortKey: toTime(checkOutAt),
      raw: hotel,
    },
  ];
}

/**
 * Clamp hotel check-in/out against same-day flights without network calls.
 * Never moves a check-in earlier or a check-out later than planned.
 * @param {object[]} events
 * @param {{ airportArrivalBufferSeconds: number }} opts
 * @returns {object[]}
 */
export function applyHotelOrdering(events, { airportArrivalBufferSeconds } = {}) {
  if (!Array.isArray(events) || events.length === 0) return events;

  // A zero buffer would clamp check-out to the exact departure time, so an
  // absent override must fall back to the real airport-arrival allowance.
  const bufferSec =
    Number.isFinite(airportArrivalBufferSeconds) && airportArrivalBufferSeconds >= 0
      ? airportArrivalBufferSeconds
      : DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS;

  for (const event of events) {
    if (event.type === "hotel-checkin") {
      const checkInDay = dayKey(event.start);
      if (!checkInDay) continue;

      let latestArrivalMs = null;
      let latestArrivalValue = null;
      for (const f of events) {
        if (f.type !== "flight") continue;
        const arrivalValue = f.arrival || f.end;
        if (dayKey(arrivalValue) !== checkInDay) continue;
        // Compare wall clocks — the UI renders literal T-digits and ignores zones.
        const ms = wallClockMs(arrivalValue);
        if (Number.isNaN(ms)) continue;
        if (latestArrivalMs == null || ms > latestArrivalMs) {
          latestArrivalMs = ms;
          latestArrivalValue = arrivalValue;
        }
      }

      if (latestArrivalValue == null) continue;

      const earliest = addSecondsWallClock(
        latestArrivalValue,
        POST_FLIGHT_BUFFER_SECONDS
      );
      const earliestMs = wallClockMs(earliest);
      const currentMs = wallClockMs(event.start);
      // Only clamp forward — never schedule check-in before you land + buffer.
      if (!Number.isNaN(earliestMs) && !Number.isNaN(currentMs) && currentMs < earliestMs) {
        event.start = earliest;
        event.end = earliest;
        event.arrival = earliest;
        // `start` is a display wall clock; `sortKey` must follow the flight's
        // absolute instant so a western-zone arrival still sorts after the flight.
        event.sortKey =
          toTime(latestArrivalValue) + POST_FLIGHT_BUFFER_SECONDS * 1000;
        event.adjusted = true;
        event.adjustmentReason = "after-flight-arrival";
      }
    }

    if (event.type === "hotel-checkout") {
      const checkOutDay = dayKey(event.start);
      if (!checkOutDay) continue;

      let earliestDepartMs = null;
      let earliestDepartValue = null;
      for (const f of events) {
        if (f.type !== "flight") continue;
        const departValue = f.start;
        if (dayKey(departValue) !== checkOutDay) continue;
        const ms = wallClockMs(departValue);
        if (Number.isNaN(ms)) continue;
        if (earliestDepartMs == null || ms < earliestDepartMs) {
          earliestDepartMs = ms;
          earliestDepartValue = departValue;
        }
      }

      if (earliestDepartValue == null) continue;

      const latestCheckout = addSecondsWallClock(earliestDepartValue, -bufferSec);
      const latestMs = wallClockMs(latestCheckout);
      const currentMs = wallClockMs(event.start);
      // Only clamp backward — traveller must reach the airport before departure.
      if (!Number.isNaN(latestMs) && !Number.isNaN(currentMs) && currentMs > latestMs) {
        event.start = latestCheckout;
        event.end = latestCheckout;
        event.arrival = latestCheckout;
        // Same dual-clock rule as check-in: wall `start`, instant-based `sortKey`.
        event.sortKey = toTime(earliestDepartValue) - bufferSec * 1000;
        event.adjusted = true;
        event.adjustmentReason = "before-flight-departure";
      }
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function getTripsCollection() {
  return tripService.getTripsCollection();
}

async function reloadTrip(tripId) {
  return tripService.findById(tripId);
}

/**
 * Resolve a hotel by numeric index string or stable hotel id.
 * @param {object} trip
 * @param {string|number} idxOrId
 * @returns {{ index: number, hotel: object } | null}
 */
export function findHotelRef(trip, idxOrId) {
  const hotels = trip?.hotels || [];
  if (!hotels.length) return null;

  const asString = idxOrId == null ? "" : String(idxOrId);
  const byId = hotels.findIndex((h) => h?.id && h.id === asString);
  if (byId >= 0) return { index: byId, hotel: hotels[byId] };

  const i = parseInt(asString, 10);
  if (!Number.isNaN(i) && String(i) === asString && i >= 0 && i < hotels.length) {
    return { index: i, hotel: hotels[i] };
  }

  return null;
}

const HOTEL_EXPENSE_CATEGORIES = [
  "food",
  "hotel",
  "flight",
  "ride",
  "activity",
  "shopping",
  "other",
];

/**
 * Infer the expense currency: hotel.currency, else the existing expense, else a
 * sibling trip expense, else USD.
 * @param {object} trip
 * @param {object} hotel
 * @param {object} [existingExpense]
 * @returns {string}
 */
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

/**
 * Build (or clear) the linked hotel expense for a hotel without writing.
 * Expense exists only while cost > 0. On update, preserve id/paidBy/splits/etc.
 * @param {object} trip
 * @param {object} hotel
 * @param {{ userId: string }} opts
 * @returns {object|null}
 */
export function syncHotelExpense(trip, hotel, { userId } = {}) {
  const costAmount = parseFloat(hotel?.cost);
  const hasCost = hotel?.cost != null && Number.isFinite(costAmount) && costAmount > 0;
  const existing = (trip.expenses || []).find((e) => e.linkedHotelId === hotel.id);

  if (!hasCost) return null;

  return persistResolvedSplits({
    id: existing?.id || `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: hotel.name,
    description: "Hotel booking",
    amount: costAmount,
    currency: inferHotelExpenseCurrency(trip, hotel, existing),
    category: HOTEL_EXPENSE_CATEGORIES.includes(existing?.category)
      ? existing.category
      : "hotel",
    date: hotel.checkIn,
    paidBy: existing?.paidBy ?? userId,
    splits: existing?.splits ?? [{ userId }],
    splitMethod: existing?.splitMethod ?? "equal",
    createdBy: existing?.createdBy ?? userId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    linkedHotelId: hotel.id,
  });
}

/**
 * Atomically push a hotel (and optional expense).
 * @param {object} trip
 * @param {object} hotel
 * @param {object|null} expense
 */
export async function addHotel(trip, hotel, expense) {
  const updatedAt = new Date().toISOString();
  const collection = getTripsCollection();

  if (collection) {
    const update = {
      $push: expense
        ? { hotels: hotel, expenses: expense }
        : { hotels: hotel },
      $set: { updatedAt },
    };
    await collection.updateOne(tripService.buildIdQuery(trip.id), update);
    return reloadTrip(trip.id);
  }

  const hotels = [...(trip.hotels || []), hotel];
  const expenses = expense
    ? [...(trip.expenses || []), expense]
    : trip.expenses || [];
  return memoryStore.trips.update(trip.id, { hotels, expenses });
}

/**
 * Replace one hotel by id; sync its linked expense in the same write.
 * `index` is a fallback for legacy hotels that were stored without an id —
 * arrayFilters on `h.id` cannot match those until this write assigns one.
 * @param {object} trip
 * @param {string} hotelId
 * @param {object} hotel
 * @param {object|null} expense
 * @param {{ index?: number }} [opts]
 */
export async function updateHotel(trip, hotelId, hotel, expense, { index } = {}) {
  const updatedAt = new Date().toISOString();
  const collection = getTripsCollection();
  const existingExpense = (trip.expenses || []).find(
    (e) => e.linkedHotelId === hotelId
  );
  const canFilterById = (trip.hotels || []).some((h) => h?.id === hotelId);

  if (collection) {
    const update = { $set: { updatedAt } };
    const options = {};

    if (canFilterById) {
      update.$set["hotels.$[h]"] = hotel;
      options.arrayFilters = [{ "h.id": hotelId }];
    } else if (typeof index === "number") {
      update.$set[`hotels.${index}`] = hotel;
    } else {
      return reloadTrip(trip.id);
    }

    if (expense) {
      if (existingExpense) {
        update.$set["expenses.$[e]"] = expense;
        options.arrayFilters = [
          ...(options.arrayFilters || []),
          { "e.linkedHotelId": hotelId },
        ];
      } else {
        update.$push = { expenses: expense };
      }
    } else if (existingExpense) {
      update.$pull = { expenses: { linkedHotelId: hotelId } };
    }

    await collection.updateOne(
      tripService.buildIdQuery(trip.id),
      update,
      options
    );
    return reloadTrip(trip.id);
  }

  const hotels = [...(trip.hotels || [])];
  if (canFilterById) {
    const i = hotels.findIndex((h) => h.id === hotelId);
    if (i >= 0) hotels[i] = hotel;
  } else if (typeof index === "number" && index >= 0 && index < hotels.length) {
    hotels[index] = hotel;
  }

  let expenses = [...(trip.expenses || [])];
  const expenseIndex = expenses.findIndex((e) => e.linkedHotelId === hotelId);
  if (expense) {
    if (expenseIndex >= 0) expenses[expenseIndex] = expense;
    else expenses.push(expense);
  } else if (expenseIndex >= 0) {
    expenses.splice(expenseIndex, 1);
  }
  return memoryStore.trips.update(trip.id, { hotels, expenses });
}

/**
 * Pull a hotel and its linked expense by hotel id.
 * `index` is a fallback for legacy hotels stored without an id (old idea POST).
 * @param {object} trip
 * @param {string|null|undefined} hotelId
 * @param {{ index?: number }} [opts]
 */
export async function removeHotel(trip, hotelId, { index } = {}) {
  const updatedAt = new Date().toISOString();
  const collection = getTripsCollection();
  const canPullById = Boolean(hotelId) &&
    (trip.hotels || []).some((h) => h?.id === hotelId);

  if (collection) {
    if (canPullById) {
      await collection.updateOne(tripService.buildIdQuery(trip.id), {
        $pull: {
          hotels: { id: hotelId },
          expenses: { linkedHotelId: hotelId },
        },
        $set: { updatedAt },
      });
    } else if (typeof index === "number") {
      // Mongo cannot $pull by position — rewrite the filtered array (legacy only).
      const hotels = (trip.hotels || []).filter((_, i) => i !== index);
      const expenses = hotelId
        ? (trip.expenses || []).filter((e) => e.linkedHotelId !== hotelId)
        : trip.expenses || [];
      await collection.updateOne(tripService.buildIdQuery(trip.id), {
        $set: { hotels, expenses, updatedAt },
      });
    }
    return reloadTrip(trip.id);
  }

  let hotels;
  if (canPullById) {
    hotels = (trip.hotels || []).filter((h) => h.id !== hotelId);
  } else if (typeof index === "number") {
    hotels = (trip.hotels || []).filter((_, i) => i !== index);
  } else {
    hotels = trip.hotels || [];
  }
  const expenses = hotelId
    ? (trip.expenses || []).filter((e) => e.linkedHotelId !== hotelId)
    : trip.expenses || [];
  return memoryStore.trips.update(trip.id, { hotels, expenses });
}
