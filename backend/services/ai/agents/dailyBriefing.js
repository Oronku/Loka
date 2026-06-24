/**
 * Daily Briefing agent.
 *
 * For a trip that is happening now (or starts within ~1 day), posts a short,
 * friendly briefing message to the user's Loka chat: today's plan, a weather
 * note if available, and one useful tip. At most one briefing per trip per day.
 *
 * Interface: export default { name, label, run(ctx) }
 * Filled in by a subagent — see registry.js for how it's wired.
 */

import weather from "../../weather.js";

const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000;

const SYSTEM_PROMPT =
  "You are Loka, a warm travel companion. Write a SHORT good-morning trip briefing " +
  "(2-4 sentences, light emoji ok, markdown). Mention today's plan, weather if given, " +
  "and one practical tip. Match the user's likely language; default English.";

function tripCity(trip) {
  const first = trip.destinations?.[0];
  if (!first) return trip.destination || null;
  return typeof first === "string" ? first : first.name;
}

function sliceDate(value) {
  return String(value || "").slice(0, 10);
}

function tomorrowStr(now) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isLiveToday(trip, todayStr, tomorrow) {
  const start = sliceDate(trip.startDate);
  const end = sliceDate(trip.endDate);
  if (!start) return false;
  if (start === tomorrow) return true;
  if (todayStr < start) return false;
  if (end && todayStr > end) return false;
  return true;
}

function formatFlight(f) {
  const parts = [f.airline, f.flightNumber].filter(Boolean).join(" ");
  const route = [f.departure, f.arrival].filter(Boolean).join(" → ");
  const time = f.time ? ` at ${f.time}` : "";
  return [parts || "Flight", route, time].filter(Boolean).join(" ");
}

function formatAttraction(a) {
  const time = a.scheduledTime ? `${a.scheduledTime} — ` : "";
  return `${time}${a.name || "Activity"}`;
}

function formatHotelEvent(hotel, kind) {
  const name = hotel.name || "Hotel";
  return kind === "check-in" ? `Check in: ${name}` : `Check out: ${name}`;
}

function buildItemList(flights, attractions, checkIns, checkOuts) {
  const parts = [];
  for (const f of flights) parts.push(formatFlight(f));
  for (const a of attractions) parts.push(formatAttraction(a));
  for (const h of checkIns) parts.push(formatHotelEvent(h, "check-in"));
  for (const h of checkOuts) parts.push(formatHotelEvent(h, "check-out"));
  return parts;
}

function buildContextString({ trip, todayStr, flights, attractions, checkIns, checkOuts, weatherNote, isFirstDay, startsTomorrow }) {
  const lines = [
    `Trip: ${trip.name || "Untitled trip"}`,
    `Today: ${todayStr}`,
    isFirstDay ? "Day: first day / arrival" : startsTomorrow ? "Day: trip starts tomorrow" : "Day: mid-trip",
  ];

  if (weatherNote) lines.push(`Weather: ${weatherNote}`);

  if (flights.length) {
    lines.push("Flights today:");
    for (const f of flights) lines.push(`- ${formatFlight(f)}`);
  }
  if (attractions.length) {
    lines.push("Activities today:");
    for (const a of attractions) lines.push(`- ${formatAttraction(a)}`);
  }
  if (checkIns.length) {
    lines.push("Hotel check-ins today:");
    for (const h of checkIns) lines.push(`- ${formatHotelEvent(h, "check-in")}`);
  }
  if (checkOuts.length) {
    lines.push("Hotel check-outs today:");
    for (const h of checkOuts) lines.push(`- ${formatHotelEvent(h, "check-out")}`);
  }

  if (!flights.length && !attractions.length && !checkIns.length && !checkOuts.length) {
    lines.push("Scheduled items today: none");
  }

  return lines.join("\n");
}

function buildFallbackMessage(tripName, items, weatherNote, isFirstDay) {
  const name = tripName || "your trip";
  if (items.length === 0 && isFirstDay) {
    const weather = weatherNote ? ` ${weatherNote}.` : "";
    return `Good morning! Today is day one of **${name}**. Have a great start!${weather}`;
  }
  const list = items.join("; ");
  const weather = weatherNote ? ` ${weatherNote}.` : "";
  return `Good morning! Today on **${name}**: ${list}.${weather}`;
}

export default {
  name: "daily_briefing",
  label: "Daily briefing",

  async run(ctx) {
    const { trips, tools, now } = ctx;
    const effects = [];
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = tomorrowStr(now);

    for (const trip of trips) {
      try {
        const tripId = trip.id || trip._id?.toString();
        if (!tripId) continue;
        if (!isLiveToday(trip, todayStr, tomorrow)) continue;

        const dedupKey = `daily_briefing:${tripId}:${todayStr}`;
        if (await tools.hasRecentRun(dedupKey, DEDUP_WINDOW_MS)) continue;

        const start = sliceDate(trip.startDate);
        const isFirstDay = start === todayStr;
        const startsTomorrow = start === tomorrow;

        const flights = (trip.flights || []).filter((f) => sliceDate(f.date) === todayStr);
        const attractions = (trip.attractions || [])
          .filter((a) => sliceDate(a.scheduledDate) === todayStr)
          .sort((a, b) => String(a.scheduledTime || "").localeCompare(String(b.scheduledTime || "")));
        const checkIns = (trip.hotels || []).filter((h) => sliceDate(h.checkIn) === todayStr);
        const checkOuts = (trip.hotels || []).filter((h) => sliceDate(h.checkOut) === todayStr);

        let weatherNote = "";
        const city = tripCity(trip);
        if (city) {
          try {
            const w = await weather.getForecast(city, todayStr).catch(() => null);
            if (w?.temp != null) {
              const desc = w.description ? `, ${w.description}` : "";
              weatherNote = `Expect around ${w.temp}°C${desc}`;
            }
          } catch {
            // weather is optional
          }
        }

        const items = buildItemList(flights, attractions, checkIns, checkOuts);
        const hasContent = items.length > 0 || weatherNote;

        if (!hasContent && !isFirstDay) continue;

        const contextString = buildContextString({
          trip,
          todayStr,
          flights,
          attractions,
          checkIns,
          checkOuts,
          weatherNote,
          isFirstDay,
          startsTomorrow,
        });

        let text = "";
        try {
          text = await tools.summarize(SYSTEM_PROMPT, contextString, {
            maxTokens: 220,
            temperature: 0.5,
          });
        } catch {
          text = "";
        }

        if (!text) {
          text = buildFallbackMessage(trip.name, items, weatherNote, isFirstDay);
        }

        if (!text?.trim()) continue;

        await tools.emitMessage({ text });
        await tools.recordRun(dedupKey, { tripId });
        effects.push({ tripId });
      } catch (err) {
        console.error("[agents] daily_briefing trip failed:", err.message);
      }
    }

    return effects;
  },
};
