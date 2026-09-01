import { buildFinding } from "../types.js";
import {
  dateOnly,
  daysBetweenDateStrings,
  flightArrivalDateTime,
  flightDate,
  parseMinutesHHMM,
  timeFromDateTime,
} from "../utils.js";

/** @typedef {import('../context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('../types.js').Finding} Finding */

/** @param {object|null|undefined} hotel @returns {number|null} latest reception minutes */
function hotelReceptionCloseMinutes(hotel) {
  if (!hotel) return null;
  const raw =
    hotel.receptionCloseTime ||
    hotel.receptionCloses ||
    hotel.latestCheckIn ||
    hotel.checkInTime ||
    null;
  return parseMinutesHHMM(raw);
}

/** @param {IntegrityContext} ctx @returns {Finding[]} */
export function checkStay(ctx) {
  /** @type {Finding[]} */
  const findings = [];
  const { start, end, tripNights, uncoveredNights, hotels, outboundFlight, flights } = ctx;
  if (!start || !end || start === end) return findings;

  if (uncoveredNights.length > 0) {
    findings.push(
      buildFinding({
        code: "unhoused_nights",
        axisIds: ["stay"],
        kind: "broken",
        severity: 3,
        blocking: true,
        title: "Nights without a place to stay",
        detail: `No hotel covers ${uncoveredNights.join(", ")}.`,
        titleKey: "integrity.stay.unhousedNights.title",
        detailKey: "integrity.stay.unhousedNights.detail",
        detailParams: { dates: uncoveredNights, count: uncoveredNights.length },
        evidence: uncoveredNights.map((d) => ({
          what: "uncoveredNight",
          value: d,
          source: "trip.hotels",
        })),
        resolution: {
          kind: "propose_change",
          hint: "Add or extend hotel stays to cover every night.",
        },
      }),
    );
  }

  const arrivalFlight = outboundFlight || flights[0];
  const arrivalDay = flightDate(arrivalFlight);
  const arrivalDt = flightArrivalDateTime(arrivalFlight);
  if (arrivalDay && hotels.length > 0) {
    for (const hotel of hotels) {
      const checkIn = dateOnly(hotel.checkIn);
      if (!checkIn) continue;
      if (checkIn < arrivalDay) {
        findings.push(
          buildFinding({
            code: "checkin_before_arrival",
            axisIds: ["stay", "travel"],
            kind: "broken",
            severity: 2,
            title: "Hotel check-in before you arrive",
            detail: `${hotel.name || "Hotel"} check-in is ${checkIn} but you land ${arrivalDay}.`,
            titleKey: "integrity.stay.checkinBeforeArrival.title",
            detailKey: "integrity.stay.checkinBeforeArrival.detail",
            detailParams: {
              hotelName: hotel.name || "Hotel",
              checkIn,
              arrivalDate: arrivalDay,
            },
            entities: [{ entity: "hotel", itemId: hotel.id }],
            evidence: [
              { what: "checkIn", value: checkIn, source: "hotel" },
              { what: "arrivalDate", value: arrivalDay, source: "flight" },
            ],
            resolution: {
              kind: "propose_change",
              hint: "Align hotel check-in with arrival date.",
            },
          }),
        );
      }

      if (checkIn === arrivalDay && arrivalDt) {
        const arrivalMin = parseMinutesHHMM(arrivalDt);
        const receptionClose = hotelReceptionCloseMinutes(hotel);
        if (arrivalMin != null && receptionClose != null && arrivalMin > receptionClose) {
          findings.push(
            buildFinding({
              code: "reception_closed_on_arrival",
              axisIds: ["stay", "travel"],
              kind: "broken",
              severity: 3,
              blocking: true,
              title: "Hotel reception closed when you land",
              detail: `You land at ${timeFromDateTime(arrivalDt)} but ${hotel.name || "the hotel"} reception closes at ${hotel.receptionCloseTime || hotel.checkInTime}.`,
              titleKey: "integrity.stay.receptionClosed.title",
              detailKey: "integrity.stay.receptionClosed.detail",
              detailParams: {
                arrivalTime: timeFromDateTime(arrivalDt),
                closeTime: hotel.receptionCloseTime || hotel.checkInTime,
                hotelName: hotel.name || "Hotel",
              },
              entities: [
                { entity: "hotel", itemId: hotel.id },
                ...(arrivalFlight?.id
                  ? [{ entity: "flight", itemId: arrivalFlight.id }]
                  : []),
              ],
              evidence: [
                { what: "arrivalDateTime", value: arrivalDt, source: "flight" },
                {
                  what: "receptionCloseTime",
                  value: hotel.receptionCloseTime || hotel.checkInTime,
                  source: "hotel",
                },
              ],
              resolution: {
                kind: "user_action_required",
                hint: "Arrange late check-in or pick a hotel with 24h reception.",
              },
            }),
          );
        }
      }
    }
  }

  const sorted = [...hotels]
    .filter((h) => dateOnly(h.checkIn) && dateOnly(h.checkOut))
    .sort((a, b) => String(dateOnly(a.checkIn)).localeCompare(String(dateOnly(b.checkIn))));

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const prevOut = dateOnly(sorted[i].checkOut);
    const nextIn = dateOnly(sorted[i + 1].checkIn);
    if (!prevOut || !nextIn) continue;
    const gap = daysBetweenDateStrings(nextIn, prevOut);
    if (gap != null && gap > 0) {
      findings.push(
        buildFinding({
          code: "hotel_gap_mid_trip",
          axisIds: ["stay"],
          kind: "at_risk",
          severity: 2,
          title: "Gap between hotels mid-trip",
          detail: `No hotel from ${prevOut} to ${nextIn}.`,
          titleKey: "integrity.stay.hotelGap.title",
          detailKey: "integrity.stay.hotelGap.detail",
          detailParams: { fromDate: prevOut, toDate: nextIn },
          entities: [
            { entity: "hotel", itemId: sorted[i].id },
            { entity: "hotel", itemId: sorted[i + 1].id },
          ],
          evidence: [
            { what: "previousCheckOut", value: prevOut, source: "hotel" },
            { what: "nextCheckIn", value: nextIn, source: "hotel" },
          ],
          resolution: {
            kind: "propose_change",
            hint: "Fill the gap with a stay or extend adjacent bookings.",
          },
        }),
      );
    }
  }

  return findings;
}
