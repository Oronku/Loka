import { openingHoursCover } from "../../writeGate.js";
import { buildFinding } from "../types.js";
import {
  dateOnly,
  haversineKm,
  minTravelMinutes,
  parseMinutesHHMM,
} from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

/** @param {string|null|undefined} timeStr @returns {number|null} */
function itemStartMinutes(timeStr, durationMinutes) {
  const start = parseMinutesHHMM(timeStr);
  if (start == null) return null;
  return start;
}

/** @param {string|null|undefined} timeStr @param {number} [durationMinutes] @returns {number|null} */
function itemEndMinutes(timeStr, durationMinutes = 60) {
  const start = parseMinutesHHMM(timeStr);
  if (start == null) return null;
  const dur = typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : 60;
  return start + dur;
}

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkDayPlan(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { start, end, itemsByDay, tripDays } = ctx;
  if (!start || !end) return findings;

  for (const item of ctx.attractions || []) {
    const day = dateOnly(item.scheduledDate);
    if (!day) continue;
    if (day < start || day > end) {
      findings.push(
        buildFinding({
          code: "item_outside_trip_dates",
          axisIds: ["dayPlan"],
          kind: "broken",
          severity: 2,
          title: "Plan scheduled outside trip dates",
          detail: `${item.name || "Item"} is on ${day}, outside ${start}–${end}.`,
          titleKey: "integrity.dayPlan.outsideRange.title",
          detailKey: "integrity.dayPlan.outsideRange.detail",
          detailParams: { itemName: item.name || "Item", date: day },
          entities: [{ entity: "attraction", itemId: item.id }],
          evidence: [
            { what: "scheduledDate", value: day, source: "attraction" },
            { what: "tripRange", value: `${start}/${end}`, source: "trip" },
          ],
          resolution: {
            kind: "propose_change",
            hint: "Reschedule or remove the out-of-range item.",
          },
        }),
      );
    }
  }

  for (const day of tripDays) {
    const items = (itemsByDay[day] || []).filter(
      (a) => a.status !== "idea" && a.scheduledTime,
    );

    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        const aStart = itemStartMinutes(a.scheduledTime, a.durationMinutes);
        const aEnd = itemEndMinutes(a.scheduledTime, a.durationMinutes);
        const bStart = itemStartMinutes(b.scheduledTime, b.durationMinutes);
        const bEnd = itemEndMinutes(b.scheduledTime, b.durationMinutes);
        if (aStart == null || aEnd == null || bStart == null || bEnd == null) continue;
        if (aStart < bEnd && bStart < aEnd) {
          findings.push(
            buildFinding({
              code: "overlapping_items",
              axisIds: ["dayPlan"],
              kind: "broken",
              severity: 2,
              title: "Two plans overlap in time",
              detail: `${a.name || "Item"} and ${b.name || "Item"} overlap on ${day}.`,
              titleKey: "integrity.dayPlan.overlap.title",
              detailKey: "integrity.dayPlan.overlap.detail",
              detailParams: {
                itemA: a.name || "Item",
                itemB: b.name || "Item",
                date: day,
              },
              entities: [
                { entity: "attraction", itemId: a.id },
                { entity: "attraction", itemId: b.id },
              ],
              evidence: [
                { what: "itemA.time", value: a.scheduledTime, source: "attraction" },
                { what: "itemB.time", value: b.scheduledTime, source: "attraction" },
              ],
              resolution: {
                kind: "propose_change",
                hint: "Shift one item so times do not overlap.",
              },
            }),
          );
        }
      }
    }

    for (let i = 0; i < items.length - 1; i += 1) {
      const a = items[i];
      const b = items[i + 1];
      if (
        typeof a.lat !== "number" ||
        typeof a.lng !== "number" ||
        typeof b.lat !== "number" ||
        typeof b.lng !== "number"
      ) {
        continue;
      }
      const aEnd = itemEndMinutes(a.scheduledTime, a.durationMinutes);
      const bStart = itemStartMinutes(b.scheduledTime, b.durationMinutes);
      if (aEnd == null || bStart == null) continue;
      const gapMinutes = bStart - aEnd;
      if (gapMinutes <= 0) continue;

      const distanceKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
      const requiredMinutes = minTravelMinutes(distanceKm);
      if (distanceKm < 2 && gapMinutes >= requiredMinutes) continue;
      if (requiredMinutes <= gapMinutes) continue;
      if (distanceKm < 5 && gapMinutes >= 30) continue;

      findings.push(
        buildFinding({
          code: "impossible_transit",
          axisIds: ["dayPlan", "transport"],
          kind: "broken",
          severity: 3,
          blocking: true,
          title: "Not enough time to get between plans",
          detail: `${Math.round(distanceKm)} km in ${gapMinutes} min — need ~${requiredMinutes} min.`,
          titleKey: "integrity.dayPlan.impossibleTransit.title",
          detailKey: "integrity.dayPlan.impossibleTransit.detail",
          detailParams: {
            distanceKm: Math.round(distanceKm),
            gapMinutes,
            requiredMinutes,
          },
          entities: [
            { entity: "attraction", itemId: a.id },
            { entity: "attraction", itemId: b.id },
          ],
          evidence: [
            { what: "distanceKm", value: distanceKm, source: "coordinates" },
            { what: "gapMinutes", value: gapMinutes, source: "schedule" },
            { what: "requiredMinutes", value: requiredMinutes, source: "estimate" },
          ],
          resolution: {
            kind: "propose_change",
            hint: "Move items apart or drop one — transit cannot fit.",
          },
        }),
      );
    }

    for (const item of items) {
      if (!item.openingHours || !item.scheduledTime) continue;
      const covered = openingHoursCover(
        item.openingHours,
        item.scheduledDate,
        item.scheduledTime,
      );
      if (!covered) {
        findings.push(
          buildFinding({
            code: "venue_closed",
            axisIds: ["dayPlan"],
            kind: "broken",
            severity: 2,
            title: "Venue appears closed at that time",
            detail: `${item.name || "Venue"} on ${day} at ${item.scheduledTime} — hours do not cover it.`,
            titleKey: "integrity.dayPlan.venueClosed.title",
            detailKey: "integrity.dayPlan.venueClosed.detail",
            detailParams: {
              itemName: item.name || "Venue",
              date: day,
              time: item.scheduledTime,
            },
            entities: [{ entity: "attraction", itemId: item.id }],
            evidence: [
              { what: "scheduledDate", value: day, source: "attraction" },
              { what: "scheduledTime", value: item.scheduledTime, source: "attraction" },
              { what: "openingHours", value: item.openingHours, source: "attraction" },
            ],
            resolution: {
              kind: "verify_fact",
              hint: "Confirm opening hours or reschedule.",
            },
          }),
        );
      }
    }

    const booked = items.filter((a) => a.status === "booked");
    if (booked.length > 0 && (ctx.rides || []).length === 0 && (ctx.flights || []).length > 0) {
      const withoutCoords = booked.filter(
        (a) => typeof a.lat !== "number" || typeof a.lng !== "number",
      );
      if (withoutCoords.length === booked.length && day === ctx.start) {
        findings.push(
          buildFinding({
            code: "unreachable_booked_item",
            axisIds: ["dayPlan", "transport"],
            kind: "unknown",
            severity: 1,
            title: "Booked plan may be hard to reach",
            detail: `${booked[0].name || "Item"} on arrival day — no transfer or location on file.`,
            titleKey: "integrity.dayPlan.unreachable.title",
            detailKey: "integrity.dayPlan.unreachable.detail",
            entities: booked.map((a) => ({ entity: "attraction", itemId: a.id })),
            evidence: [{ what: "date", value: day, source: "attraction" }],
            resolution: {
              kind: "verify_fact",
              hint: "Confirm how travelers reach the booked item.",
            },
          }),
        );
      }
    }
  }

  return findings;
}
