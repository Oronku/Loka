import {
  computeTripReadiness,
  readinessForPrompt,
  enumerateTripDays,
  weekdayForDate,
  dateOnly,
} from "../trip/readiness.js";

/** Merge legacy date+time fields into an ISO-ish datetime when needed. */
function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue) return timeValue || null;
  const dateStr = String(dateValue).trim();
  if (/T\d{1,2}:\d{2}/.test(dateStr)) return dateStr;
  if (timeValue && /^\d{1,2}:\d{2}/.test(String(timeValue).trim())) {
    const datePart = dateStr.slice(0, 10);
    const [h, m] = String(timeValue).trim().split(":");
    return `${datePart}T${h.padStart(2, "0")}:${(m || "00").slice(0, 2).padStart(2, "0")}`;
  }
  return dateStr;
}

function compactFlight(f) {
  const item = {
    id: f.id,
    airline: f.airline || undefined,
    flightNumber: f.flightNumber,
    from: f.departureAirportCode || f.departureAirport || f.departure || f.from,
    to: f.arrivalAirportCode || f.arrivalAirport || f.arrival || f.to,
    departureDateTime:
      f.departureDateTime || combineDateAndTime(f.date, f.time) || undefined,
    arrivalDateTime: f.arrivalDateTime || undefined,
    status: f.status || undefined,
  };
  const depTerminal = f.terminal?.departure;
  const arrTerminal = f.terminal?.arrival;
  const depGate = f.gate?.departure;
  const arrGate = f.gate?.arrival;
  if (depTerminal) item.departureTerminal = depTerminal;
  if (arrTerminal) item.arrivalTerminal = arrTerminal;
  if (depGate) item.departureGate = depGate;
  if (arrGate) item.arrivalGate = arrGate;
  if (f.confirmationNumber) item.confirmationNumber = f.confirmationNumber;
  return item;
}

function compactHotel(h) {
  const item = {
    id: h.id,
    name: h.name,
    checkIn: h.checkIn,
    checkOut: h.checkOut,
  };
  if (h.address) item.address = h.address;
  if (h.arrivalTime) item.arrivalTime = h.arrivalTime;
  if (h.confirmationNumber) item.confirmationNumber = h.confirmationNumber;
  return item;
}

function compactRide(r) {
  const item = {
    id: r.id,
    pickup: r.pickup,
    dropoff: r.dropoff,
    pickupDateTime:
      r.pickupDateTime || combineDateAndTime(r.date, r.time) || undefined,
  };
  if (r.dropoffDateTime) item.dropoffDateTime = r.dropoffDateTime;
  if (r.duration) item.duration = r.duration;
  return item;
}

function compactAttraction(a) {
  const item = {
    id: a.id,
    name: a.name,
    type: a.attractionType || a.type,
    date: a.scheduledDate,
    time: a.scheduledTime,
  };
  if (a.address) item.address = a.address;
  if (a.confirmationNumber) item.confirmationNumber = a.confirmationNumber;
  if (a.timeConfidence) item.timeConfidence = a.timeConfidence;
  if (a.openingHours) item.openingHours = a.openingHours;
  if (a.website) item.website = a.website;
  if (a.bookingUrl) item.bookingUrl = a.bookingUrl;
  if (a.status) item.status = a.status;
  return item;
}

function shortTitle(value, max = 48) {
  if (!value) return "Untitled";
  const s = String(value).trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** @param {object} a */
function attractionKind(a) {
  const type = (a.attractionType || a.type || "").toLowerCase();
  if (type === "event") return "event";
  if (type === "placeholder") return "placeholder";
  if (type === "note") return "note";
  return "place";
}

function isIdea(a) {
  if (!a) return false;
  if (a.status === "idea") return true;
  if (!a.status && !a.scheduledDate) return true;
  return false;
}

function isNote(a) {
  return attractionKind(a) === "note";
}

function flightDayItem(f) {
  return {
    id: f.id,
    type: "flight",
    title: shortTitle(
      `${f.departureAirportCode || f.from || "?"} → ${f.arrivalAirportCode || f.to || "?"}`,
    ),
    time: f.time || (f.departureDateTime ? String(f.departureDateTime).slice(11, 16) : undefined),
    timeConfidence: "confirmed",
  };
}

function hotelDayItem(h, type = "hotel") {
  return {
    id: h.id,
    type,
    title: shortTitle(h.name || "Hotel"),
    time: h.arrivalTime || undefined,
    timeConfidence: h.arrivalTime ? "confirmed" : undefined,
  };
}

function rideDayItem(r) {
  return {
    id: r.id,
    type: "ride",
    title: shortTitle(`${r.pickup || "?"} → ${r.dropoff || "?"}`),
    time: r.time || (r.pickupDateTime ? String(r.pickupDateTime).slice(11, 16) : undefined),
    timeConfidence: "confirmed",
  };
}

function attractionDayItem(a) {
  const kind = attractionKind(a);
  if (kind === "note") return null;
  return {
    id: a.id,
    type: kind === "event" ? "event" : kind === "placeholder" ? "placeholder" : "place",
    title: shortTitle(a.name || a.notes || kind),
    time: a.scheduledTime || undefined,
    timeConfidence: a.timeConfidence || undefined,
  };
}

/** @param {object} t */
function buildDaysSkeleton(t) {
  const start = dateOnly(t.startDate);
  const end = dateOnly(t.endDate);
  if (!start || !end) return [];

  const allDays = enumerateTripDays(start, end);
  const maxFull = 21;
  const showDays = allDays.length > maxFull ? allDays.slice(0, 14) : allDays;
  const omitted = allDays.length > maxFull ? allDays.length - 14 : 0;

  /** @type {Record<string, object[]>} */
  const byDate = {};

  for (const f of t.flights || []) {
    const d = dateOnly(f.departureDateTime || f.date);
    if (!d) continue;
    (byDate[d] ||= []).push(flightDayItem(f));
  }
  for (const h of t.hotels || []) {
    const d = dateOnly(h.checkIn);
    if (d) (byDate[d] ||= []).push(hotelDayItem(h, "hotel"));
  }
  for (const r of t.rides || []) {
    const d = dateOnly(r.pickupDateTime || r.date);
    if (!d) continue;
    (byDate[d] ||= []).push(rideDayItem(r));
  }
  for (const a of t.attractions || []) {
    if (isIdea(a)) continue;
    const d = dateOnly(a.scheduledDate);
    if (!d) continue;
    const item = attractionDayItem(a);
    if (item) (byDate[d] ||= []).push(item);
  }

  /** @type {object[]} */
  const days = showDays.map((date) => ({
    date,
    weekday: weekdayForDate(date),
    items: byDate[date] || [],
  }));

  if (omitted > 0) {
    days.push({ note: `+${omitted} more days not shown` });
  }
  return days;
}

/** @param {object} intent */
function stripIntent(intent) {
  if (!intent || typeof intent !== "object") return undefined;
  const out = { ...intent };
  for (const key of Object.keys(out)) {
    if (
      out[key] == null ||
      out[key] === "" ||
      (Array.isArray(out[key]) && out[key].length === 0)
    ) {
      delete out[key];
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** @param {object} t */
function buildChecklistSummary(t) {
  const list = Array.isArray(t.checklist)
    ? t.checklist.filter((i) => i && typeof i === "object" && !Array.isArray(i.items))
    : [];
  const done = list.filter((i) => i.completed).length;
  /** @type {Record<string, { total: number, done: number }>} */
  const byCategory = {};
  for (const item of list) {
    const categoryId = item.categoryId || "general";
    byCategory[categoryId] ||= { total: 0, done: 0 };
    byCategory[categoryId].total += 1;
    if (item.completed) byCategory[categoryId].done += 1;
  }
  const sampleOpen = list
    .filter((i) => !i.completed && i.text)
    .map((i) => String(i.text).trim())
    .filter(Boolean)
    .slice(0, 8);
  return { total: list.length, done, byCategory, sampleOpen };
}

/** @param {object} t */
function buildBudgetSummary(t) {
  const budget = t.budget;
  if (!budget || typeof budget.totalBudget !== "number") return undefined;

  const currency = budget.currency || "USD";
  const expenses = (t.expenses || []).filter((e) => e?.category !== "settlement");
  let spent = 0;
  for (const e of expenses) {
    const cur = (e.currency || "USD").toUpperCase();
    if (cur === currency.toUpperCase()) {
      spent += Number(e.amount) || 0;
    }
  }
  spent = Math.round(spent * 100) / 100;

  const byCategory = (budget.categories || [])
    .filter((cat) => cat?.name)
    .map((cat) => ({
      name: cat.name,
      budgeted: Number(cat.budgeted) || 0,
      spent: Number(cat.spent) || 0,
    }));

  return {
    totalBudget: budget.totalBudget,
    currency,
    spent,
    remaining: Math.round((budget.totalBudget - spent) * 100) / 100,
    byCategory,
  };
}

/** @param {object} t */
function buildExpensesSummary(t) {
  const expenses = (t.expenses || []).filter((e) => e?.category !== "settlement");
  /** @type {Record<string, number>} */
  const totalsByCurrency = {};
  for (const e of expenses) {
    const cur = (e.currency || "USD").toUpperCase();
    totalsByCurrency[cur] =
      Math.round(((totalsByCurrency[cur] || 0) + (Number(e.amount) || 0)) * 100) / 100;
  }
  return { count: expenses.length, totalsByCurrency };
}

/** @param {object} t */
function buildPeopleSummary(t) {
  /** @type {{ id: string, name: string, isOwner: boolean }[]} */
  const members = [];
  if (t.userId) {
    members.push({
      id: t.userId,
      name: t.userName || t.userEmail || "Owner",
      isOwner: true,
    });
  }
  for (const p of t.sharedWith || []) {
    if (!p?.userId) continue;
    members.push({
      id: p.userId,
      name: p.name || p.email || "Traveler",
      isOwner: false,
    });
  }
  const pendingInvites = (t.pendingInvites || []).filter(
    (p) => p?.status === "pending",
  ).length;
  return { members: members.slice(0, 12), pendingInvites };
}

/** @param {object} t */
function buildIdeasSummary(t) {
  const ideas = (t.attractions || []).filter(isIdea);
  const notes = ideas.filter(isNote);
  const places = ideas.filter((a) => !isNote(a));
  const sampleTitles = ideas
    .map((a) => shortTitle(a.name || a.notes || "Idea", 40))
    .slice(0, 6);
  return {
    unscheduledPlaces: places.length,
    notes: notes.length,
    sampleTitles,
  };
}

/** @param {object} t */
function buildSlimTripSummary(t) {
  const readiness = computeTripReadiness(t);
  const destination =
    t.destination ||
    (typeof t.destinations?.[0] === "string"
      ? t.destinations[0]
      : t.destinations?.[0]?.name);
  return {
    id: t.id || t._id?.toString(),
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    destination,
    counts: {
      flights: (t.flights || []).length,
      hotels: (t.hotels || []).length,
      rides: (t.rides || []).length,
      attractions: (t.attractions || []).length,
      checklist: (t.checklist || []).length,
      expenses: (t.expenses || []).length,
    },
    readinessScore: readiness.overallScore,
  };
}

/** @param {object} t */
function buildFullTripContext(t) {
  const readiness = readinessForPrompt(computeTripReadiness(t));
  const budget = buildBudgetSummary(t);
  const intent = stripIntent(t.intent);
  const base = {
    id: t.id || t._id?.toString(),
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    destinations: (t.destinations || []).map((d) => (typeof d === "string" ? d : d.name)),
    isPast: (() => {
      const end = dateOnly(t.endDate);
      const today = dateOnly(new Date().toISOString());
      return Boolean(end && today && end < today);
    })(),
    flights: (t.flights || []).map(compactFlight),
    hotels: (t.hotels || []).map(compactHotel),
    rides: (t.rides || []).map(compactRide),
    attractions: (t.attractions || []).map(compactAttraction),
    days: buildDaysSkeleton(t),
    checklist: buildChecklistSummary(t),
    expenses: buildExpensesSummary(t),
    people: buildPeopleSummary(t),
    ideas: buildIdeasSummary(t),
    readiness,
  };
  if (intent) base.intent = intent;
  if (budget) base.budget = budget;
  return base;
}

/**
 * Builds the trip context block (compact, includes item ids so the model can
 * reference existing items for update/remove operations).
 *
 * @param {object[]} [trips]
 * @param {{ activeTripId?: string|null }} [options]
 */
export function buildTripContext(trips = [], { activeTripId = null } = {}) {
  return trips.map((t) => {
    const id = t.id || t._id?.toString();
    if (activeTripId && id === activeTripId) {
      return buildFullTripContext(t);
    }
    return buildSlimTripSummary(t);
  });
}

function profileBlock(profile) {
  if (!profile) return "";
  const prefs = [];
  if (profile.homeAirport) prefs.push(`Home airport: ${profile.homeAirport}`);
  if (profile.travelStyle) prefs.push(`Travel style: ${profile.travelStyle}`);
  if (profile.pace) prefs.push(`Preferred pace: ${profile.pace}`);
  if (profile.budgetLevel) prefs.push(`Budget level: ${profile.budgetLevel}`);
  if (profile.cuisines?.length) prefs.push(`Likes cuisines: ${profile.cuisines.join(", ")}`);
  if (profile.interests?.length) prefs.push(`Interests: ${profile.interests.join(", ")}`);
  if (profile.dislikes?.length) prefs.push(`Avoid: ${profile.dislikes.join(", ")}`);
  if (profile.languages?.length) prefs.push(`Speaks: ${profile.languages.join(", ")}`);
  let block = "";
  if (prefs.length) {
    block += `\n\n=== WHAT YOU KNOW ABOUT THIS TRAVELER ===\n${prefs.join("\n")}`;
  }
  if (profile.summary) {
    block += `\n\nNotes from past conversations:\n${profile.summary}`;
  }
  return block;
}

function groupChatBlock(groupParticipants = []) {
  if (!groupParticipants.length) return "";
  const names = groupParticipants.join(", ");
  return `

=== GROUP TRIP CHAT (CRITICAL) ===
You are in the group chat with your friends — this trip is yours AND yours. You're a friend on the trip, not an external planner or concierge.

LENGTH & TONE (strict):
- One bubble, usually ONE short sentence — max ~12 words unless answering a direct factual question.
- No intros, no essays, no emoji spam. One emoji max when it fits.
- Never open with filler ("וואלה…", "great question!", "breakfast is a good start to…"). Just say the thing or stay quiet.

WHEN TO SPEAK vs STAY QUIET:
- HYPE & CELEBRATION — JOIN IN. When someone is excited about the trip, match their energy in 3–8 words: "🥳 יאללה!", "it's gonna be so good!!", "מטורף 🔥", "can't wait!!". No setup, no help offer — just hype with them.
- Friends debating a decision ("should we eat breakfast?", "need to think whether…") → stay silent. Don't offer to search or plan.
- Answer facts when asked ("what time is the flight?") — one short sentence, then stop.

BANNED PATTERNS:
- Long setup + offer ("X is great! Want me to find… or do you prefer…?")
- Dual-choice help menus, "I'm here if…", "let me know if…", "אני כאן", "אם צריך…", "תגידו לי אם…", "בא לכם שא…"
- Never start with "Loka:" — your name is already on the bubble.

You're one participant among several humans. You don't need to name everyone every message, but you know who's in the thread.

=== WHO'S IN THIS CHAT ===
Humans in this trip group chat: ${names} (plus you, Loka).`;
}

/**
 * The Loka assistant system prompt. Designed around the propose-then-apply
 * model: the assistant proposes concrete changes (tool calls) which the app
 * renders as a reviewable diff. So the assistant should ACT, not ask permission.
 *
 * @param {{ trips?: object[], profile?: object|null, activeTripId?: string|null, isGroupChat?: boolean, groupParticipants?: string[], now?: Date }} ctx
 */
export function buildSystemPrompt({
  trips = [],
  profile = null,
  activeTripId = null,
  isGroupChat = false,
  groupParticipants = [],
  now = new Date(),
} = {}) {
  const context = buildTripContext(trips, { activeTripId });
  const today = now.toISOString().slice(0, 10);

  return `You are Loka — a warm, playful travel buddy inside the MeetLoka app. You're a friend on the trip, not an external planner or assistant-for-hire.

You are not a scripted bot. You talk like a friend who genuinely loves this trip as much as they do: concise, specific, human, and lightly fun. Celebrate wins, match excitement, use tasteful emoji when it fits. You never dump canned menus of what you "can do". You just show up — helpful when needed, fun when the moment calls for it.

Today's date: ${today}.
${activeTripId ? `The user is currently looking at trip id: ${activeTripId}.` : ""}${isGroupChat ? groupChatBlock(groupParticipants) : ""}

=== HOW CHANGES WORK (CRITICAL) ===
When the user wants to build or change a trip, you call tools to PROPOSE the change. The app shows the user a clear visual diff (like git: green additions, red removals) with Apply / Reject buttons. So:
- Do NOT ask "should I add this?" or "shall I proceed?". Just propose it with a tool call. The user reviews the diff and applies.
- In your text reply, briefly describe what you're proposing in natural language (1-3 short sentences). The diff card shows the details, so don't re-list every field.
- To edit or delete an existing itinerary item (flight, hotel, ride, attraction), use update_item / remove_item with the item's id from the trip context below.
- To change trip-level details (name, destination, start/end dates), use update_trip with the trip id. NEVER call create_trip when the user wants to modify an existing trip.
- To delete a whole trip, use delete_trip with the trip id (owner-only).
- create_trip is ONLY for when the user explicitly wants a brand-new trip. If they say "change the dates", "move the trip to next week", "rename my trip", etc. while viewing or referring to an existing trip → update_trip, not create_trip.
- You can bundle several changes in one turn (e.g. create a trip AND add a few activities) — call multiple tools; they become one reviewable changeset.
- For a brand-new trip, call create_trip and use tripId "__new__" for the items you add to it in the same turn.

=== JUDGMENT ===
- Use sensible default hours when none are known (restaurants 20:00, attractions 10:00, hotel check-in 15:00) and mark those attraction times as a guess — never imply you know the real hour. Pick the trip's dates when none are given.
- timeConfidence must be "confirmed" only when the user said the time or you looked it up from a real page / opening hours. Otherwise "guess". Never present a guessed time as a fact.
- If the user has multiple trips and it's genuinely ambiguous which one they mean, ask one short question. Otherwise pick the obvious one${activeTripId ? " (default to the trip they're viewing)" : ""}.
- Auto-classify places: dining (Nobu, Din Tai Fung, cafes, bars) -> "restaurant"; sights/museums/parks/landmarks -> "attraction".
- Be proactive but never spammy: one helpful nudge OR one playful beat after an action — not both unless the moment really calls for it.
- Chit-chat, hype, and celebrations are welcome — reply like a friend, not a FAQ. No tool calls needed for vibes-only messages.

=== LOOKING THINGS UP ===
- When they need tour hours, available dates, prices, or a booking link, call web_search. It returns live notes plus citation URLs. It does not change the trip.
- After a search, propose the change with add_attraction or update_item. Put the official booking link in bookingUrl. Set timeConfidence to "confirmed" only for a time a real page listed. Pass sourceUrl as that page's URL.
- In your short reply, name the page so they can check it. One idea, with a because. If the time is a guess, say so — e.g. the hour is your guess because you couldn't find their hours.

=== STYLE ===
- Match the user's language (Hebrew or English). Keep replies short — often one sentence; don't lecture.
- Playfulness matters: you're a friend, not a corporate travel desk. Emoji are welcome when they feel natural (🥳 ✈️ 🍝 — not spam).
- Be specific and real when helping: name actual places, give real reasons. Avoid generic filler and assistant-speak ("I'd be happy to assist…", "I'm here if you need anything", "let me know if…", "אני כאן", "אם צריך תזכורת", "תגידו לי אם").
- Only help when someone actually asked or the moment clearly needs it. If you're just vibing or celebrating, don't tack on a help offer at the end — that's assistant behavior, not friend behavior.
- When they're excited about the trip, share the hype with them and stop there. When they need logistics, answer and stop — don't add "I'm here for more".

=== WHAT YOU KNOW AND OWN ===
You can see the whole trip for the active trip — day-by-day plan, checklist, budget, expenses, people, ideas, the traveler's stated intent, and a computed readiness assessment. Other trips appear as slim summaries only. You are responsible for this trip's readiness. Ground every suggestion in a real gap from the readiness data — never invent problems the data doesn't show, and never suggest something already handled.

ANTI-NOISE (strict): Never offer to fill in internal/plumbing fields — photos, images, placeId, coordinates, photoReference, or similar metadata. The app handles those silently. Place facts — opening hours, website, phone, address, photos, rating — are shown live in the app and are NEVER proposed as trip changes. If the traveler asks about a place's hours, prices, or booking, answer directly (use web_search when you need live info) — do not propose an edit to their itinerary. Proposals are strictly for decisions about the trip: what to do, when, where to stay, how to get around, what to budget, what to pack.

When the traveler asks for a whole-trip plan, prefer plan_trip_skeleton. Prefer placeholder events over inventing specific venues you haven't verified. Use add_checklist_items when you spot something they'll need to bring or do.

=== TOOLS YOU HAVE ===
Trip scaffolding and readiness tools (propose via the app diff — same review flow as other changes):
- add_checklist_items({ tripId, items: [{ text, categoryId? }] }) — shared packing list
- remove_checklist_item({ tripId, itemId })
- set_trip_budget({ tripId, totalBudget, currency, categories? })
- set_trip_intent({ tripId, pace?, vibes?, priorities?, budgetLevel?, notes? })
- add_placeholder_event({ tripId, title, date, time?, durationMinutes?, kind? }) — rough day slot with no real place attached
- plan_trip_skeleton({ tripId, days: [{ date, blocks: [{ kind, title, time?, durationMinutes?, placeholder? }] }] }) — whole trip shape in ONE reviewable card grouped by day

Prefer plan_trip_skeleton when the traveler asks for a whole-trip plan. Prefer placeholders over inventing specific venues you haven't verified. Use add_checklist_items when you spot something the traveler will need to bring or do.

=== CURRENT TRIPS ===
${JSON.stringify(context, null, 0)}${profileBlock(profile)}`;
}
