import { aeroDataBoxGet } from './aeroDataBox.js'
import { searchAirports as searchStaticAirports } from './airportSearch.js'
import googleFlights from './googleFlights.js'
import duffel from './duffel.js'
import travelpayouts from './travelpayouts.js'
import aviationStack from './aviationStack.js'
import { normalizeFlightNumber, formatFlightNumber, hasAirlineFlightNumberPrefix } from './flightNumberUtils.js'

/** Normalize AeroDataBox-style datetimes to strict ISO 8601, preserving offset/Z. */
export function toIsoDateTime(value) {
  if (!value) return value
  const trimmed = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    return trimmed
  }
  const m = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?\s*(Z|[+-]\d{2}:?\d{2})?$/,
  )
  if (!m) return trimmed
  const [, date, hm, sec, tz] = m
  const offset =
    tz === 'Z' ? 'Z' : tz ? tz.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : ''
  return `${date}T${hm}${sec || ':00'}${offset}`
}

function isRateLimitError(error) {
  return error?.response?.status === 429
}

/** Read scheduled/revised times from an AeroDataBox leg (supports pre/post Oct 2023 shapes). */
function readAeroDataBoxTimes(leg) {
  if (!leg) return { local: null, utc: null }
  const scheduled = leg.scheduledTime || {}
  const revised = leg.revisedTime || {}
  return {
    local:
      scheduled.local ||
      leg.scheduledTimeLocal ||
      revised.local ||
      leg.revisedTimeLocal ||
      null,
    utc:
      scheduled.utc ||
      leg.scheduledTimeUtc ||
      revised.utc ||
      leg.revisedTimeUtc ||
      null,
  }
}

function hasTimezoneOffset(iso) {
  return typeof iso === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso)
}

function pickIsoDateTime(times) {
  if (!times) return null
  const local = times.local ? toIsoDateTime(times.local) : null
  const utc = times.utc ? toIsoDateTime(times.utc) : null
  if (local && hasTimezoneOffset(local)) return local
  if (utc && hasTimezoneOffset(utc)) return utc
  return local || utc || null
}

function localDateFromScheduled(value) {
  if (!value) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value))
  return m ? m[1] : null
}

function computeDurationMinutes(depIso, arrIso) {
  if (!depIso || !arrIso) return null
  try {
    const minutes = Math.round((new Date(arrIso) - new Date(depIso)) / 60000)
    return minutes > 0 ? minutes : null
  } catch {
    return null
  }
}

/** Fictional carriers returned by Duffel sandbox — never show to users. */
function isSandboxAirline(airline) {
  const name = String(airline || '').trim()
  if (!name) return false
  return /\bduffel\b/i.test(name)
}

function isValidRouteFlight(flight, searchDate) {
  if (isSandboxAirline(flight.airline)) return false
  if (!hasAirlineFlightNumberPrefix(flight.flightNumber)) return false

  const dep = flight.departure?.scheduled
  const arr = flight.arrival?.scheduled
  if (!dep || !arr) return false

  const depDate = localDateFromScheduled(dep)
  if (depDate && depDate !== searchDate) return false

  const duration =
    flight.durationMinutes ?? computeDurationMinutes(dep, arr)
  if (!duration || duration <= 0) return false

  flight.durationMinutes = duration
  return true
}

function dedupeRouteFlights(flights) {
  const seen = new Set()
  return flights.filter((f) => {
    const key = `${normalizeFlightNumber(f.flightNumber)}|${f.departure?.scheduled}|${f.arrival?.iata}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mapAeroDataBoxFlight(flight, flightNumber, date) {
  const departureTime = pickIsoDateTime(readAeroDataBoxTimes(flight.departure))
  const arrivalTime = pickIsoDateTime(readAeroDataBoxTimes(flight.arrival))

  const durationMinutes = computeDurationMinutes(departureTime, arrivalTime)

  return {
    airline: flight.airline?.name || 'Unknown',
    flightNumber: flight.number || flightNumber,
    departureAirportCode: flight.departure?.airport?.iata || '',
    departureCity: flight.departure?.airport?.municipalityName || '',
    departureCountry: flight.departure?.airport?.countryCode || '',
    departureDateTime: departureTime || null,
    departureTimeLocal: departureTime || '',
    departureTimezone: flight.departure?.airport?.timezone || '',
    arrivalAirportCode: flight.arrival?.airport?.iata || '',
    arrivalCity: flight.arrival?.airport?.municipalityName || '',
    arrivalCountry: flight.arrival?.airport?.countryCode || '',
    arrivalDateTime: arrivalTime || null,
    arrivalTimeLocal: arrivalTime || '',
    arrivalTimezone: flight.arrival?.airport?.timezone || '',
    durationMinutes,
    status: flight.status || 'scheduled',
    aircraft: flight.aircraft?.model || null,
    aircraftType: flight.aircraft?.model || null,
    terminal: {
      departure: flight.departure?.terminal || null,
      arrival: flight.arrival?.terminal || null,
    },
    gate: {
      departure: flight.departure?.gate || null,
      arrival: flight.arrival?.gate || null,
    },
    source: 'aerodatabox',
  }
}

function mapAeroDataBoxRouteFlight(flight, from, to, date) {
  // FIDS at the origin airport: movement holds the local departure time.
  const originLeg = flight.movement || flight.departure
  const destLeg = flight.arrival
  const depIso = pickIsoDateTime(readAeroDataBoxTimes(originLeg))
  const arrIso = pickIsoDateTime(readAeroDataBoxTimes(destLeg))
  const durationMinutes = computeDurationMinutes(depIso, arrIso)
  const airlineIata = flight.airline?.iata || ''
  const flightNumber = formatFlightNumber(airlineIata, flight.number) || flight.number || ''

  return {
    id: `${flightNumber || flight.number}-${date}`,
    airline: flight.airline?.name || 'Unknown',
    flightNumber,
    flightIata: airlineIata,
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: depIso,
      terminal: originLeg?.terminal || flight.departure?.terminal || null,
    },
    arrival: {
      airport: `${flight.arrival?.airport?.name || to.toUpperCase()} (${flight.arrival?.airport?.iata || to.toUpperCase()})`,
      iata: flight.arrival?.airport?.iata || to.toUpperCase(),
      scheduled: arrIso,
      terminal: destLeg?.terminal || null,
    },
    durationMinutes,
    stops: 0,
    aircraft: flight.aircraft?.model || '',
    status: flight.status || 'scheduled',
    source: 'aerodatabox',
  }
}

function mapGoogleFlightsRoute(flight, from, to, date, index) {
  const nums = flight.segmentFlightNumbers || []
  const rawNumber = nums[0] || flight.flightNumbers?.split(',')[0]?.trim() || ''
  const flightNumber = formatFlightNumber('', rawNumber) || normalizeFlightNumber(rawNumber)
  const airlineIata = hasAirlineFlightNumberPrefix(flightNumber)
    ? normalizeFlightNumber(flightNumber).replace(/\d+$/, '')
    : ''

  return {
    id: `google-${index}-${flightNumber || 'unknown'}`,
    airline: flight.airline,
    flightNumber,
    flightIata: airlineIata,
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: toIsoDateTime(flight.departureTime) || flight.departureTime || null,
      terminal: null,
    },
    arrival: {
      airport: `${to.toUpperCase()} Airport`,
      iata: to.toUpperCase(),
      scheduled: toIsoDateTime(flight.arrivalTime) || flight.arrivalTime || null,
      terminal: null,
    },
    durationMinutes: flight.durationMinutes || null,
    stops: flight.stops ?? 0,
    aircraft: flight.aircraft || '',
    status: 'scheduled',
    source: 'google_flights',
  }
}

function mapDuffelRoute(flight, from, to, date) {
  const firstSeg = flight.segments?.[0]
  const airlineIata = firstSeg?.airlineIata || flight.airlineIata || ''
  const flightNumber = formatFlightNumber(airlineIata, firstSeg?.flightNumber)

  return {
    id: flight.id || `${flightNumber}-${date}`,
    airline: flight.airline,
    flightNumber,
    flightIata: airlineIata,
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: toIsoDateTime(flight.departureTime) || flight.departureTime || null,
      terminal: null,
    },
    arrival: {
      airport: `${to.toUpperCase()} Airport`,
      iata: to.toUpperCase(),
      scheduled: toIsoDateTime(flight.arrivalTime) || flight.arrivalTime || null,
      terminal: null,
    },
    durationMinutes: parseDurationMinutes(flight.duration) || null,
    stops: flight.stops ?? 0,
    aircraft: flight.aircraft || '',
    status: 'scheduled',
    source: 'duffel',
  }
}

function mapTravelpayoutsRoute(flight, from, to, date, index) {
  const airline = flight.airline || ''
  const num = flight.flightNumber ?? flight.flight_number ?? ''
  const flightNumber = formatFlightNumber(airline, num)

  return {
    id: `aviasales-${index}-${flightNumber || 'unknown'}`,
    airline,
    flightNumber,
    flightIata: airline,
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: toIsoDateTime(flight.departure?.time) || flight.departure?.time || null,
      terminal: null,
    },
    arrival: {
      airport: `${to.toUpperCase()} Airport`,
      iata: to.toUpperCase(),
      scheduled: toIsoDateTime(flight.arrival?.time) || flight.arrival?.time || null,
      terminal: null,
    },
    durationMinutes: parseDurationMinutes(flight.duration) || null,
    stops: flight.stops ?? 0,
    aircraft: '',
    status: 'scheduled',
    source: 'travelpayouts',
  }
}

function parseDurationMinutes(duration) {
  if (typeof duration === 'number') return duration
  if (!duration) return 0
  const hours = String(duration).match(/(\d+)h/)
  const minutes = String(duration).match(/(\d+)m/)
  return (hours ? parseInt(hours[1], 10) * 60 : 0) + (minutes ? parseInt(minutes[1], 10) : 0)
}

function applyRouteFilters(flights, { directOnly, airline }) {
  let filtered = flights

  if (directOnly === 'true' || directOnly === true) {
    filtered = filtered.filter((f) => (f.stops ?? 0) === 0)
  }

  if (airline) {
    const code = airline.toUpperCase()
    filtered = filtered.filter(
      (f) =>
        f.flightIata === code ||
        normalizeFlightNumber(f.flightNumber).startsWith(code),
    )
  }

  return filtered
}

async function enrichRouteFlightByNumber(routeFlight, date) {
  const num = normalizeFlightNumber(routeFlight.flightNumber)
  if (!num) return routeFlight

  const needsEnrichment =
    !routeFlight.departure?.scheduled ||
    !routeFlight.arrival?.scheduled ||
    (routeFlight.durationMinutes ?? 0) <= 0

  if (!needsEnrichment) return routeFlight

  try {
    const detail = await searchByNumberAeroDataBox(num, date)
    if (!detail) return routeFlight

    if (
      detail.departureAirportCode &&
      detail.departureAirportCode !== routeFlight.departure.iata
    ) {
      return routeFlight
    }
    if (
      detail.arrivalAirportCode &&
      detail.arrivalAirportCode !== routeFlight.arrival.iata
    ) {
      return routeFlight
    }

    return {
      ...routeFlight,
      airline: detail.airline || routeFlight.airline,
      flightNumber: detail.flightNumber || routeFlight.flightNumber,
      departure: {
        ...routeFlight.departure,
        scheduled: detail.departureDateTime,
        terminal: detail.terminal?.departure ?? routeFlight.departure.terminal,
      },
      arrival: {
        ...routeFlight.arrival,
        scheduled: detail.arrivalDateTime,
        terminal: detail.terminal?.arrival ?? routeFlight.arrival.terminal,
      },
      durationMinutes: detail.durationMinutes ?? routeFlight.durationMinutes,
    }
  } catch (error) {
    if (error.code === 'NOT_ON_DATE') return routeFlight
    return routeFlight
  }
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

async function finalizeRouteFlights(flights, date, limit = 20) {
  const deduped = dedupeRouteFlights(flights)
  const candidates = deduped.slice(0, limit)
  const enriched = await mapWithConcurrency(candidates, 5, (flight) =>
    enrichRouteFlightByNumber(flight, date),
  )
  return enriched.filter((flight) => flight && isValidRouteFlight(flight, date))
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function nearestOperatingDates(allDates, requestedDate, limit = 4) {
  const sorted = [...new Set(allDates)].filter(Boolean).sort()
  if (!sorted.length) return []

  const reqMs = new Date(`${requestedDate}T12:00:00`).getTime()
  return sorted
    .map((d) => ({
      date: d,
      diff: Math.abs(new Date(`${d}T12:00:00`).getTime() - reqMs),
    }))
    .sort((a, b) => a.diff - b.diff || a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((row) => row.date)
}

async function fetchOperatingDates(flightNumber, centerDate, windowDays = 45) {
  const from = addDaysIso(centerDate, -windowDays)
  const to = addDaysIso(centerDate, windowDays)
  const normalized = normalizeFlightNumber(flightNumber) || String(flightNumber || '').trim()

  try {
    const data = await aeroDataBoxGet(
      `/flights/number/${encodeURIComponent(normalized)}/dates/${from}/${to}`,
      { cacheTtlMs: 0 },
    )
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function loadAeroDataBoxFlightOnDate(flightNumber, date) {
  const normalized = normalizeFlightNumber(flightNumber) || String(flightNumber || '').trim()
  const data = await aeroDataBoxGet(`/flights/number/${encodeURIComponent(normalized)}/${date}`, {
    params: {
      withAircraftImage: false,
      withLocation: false,
    },
  })

  if (!data?.length) return null

  const localDate = (f) => {
    const dep = pickIsoDateTime(readAeroDataBoxTimes(f.departure))
    return dep ? dep.slice(0, 10) : null
  }

  const flight = data.find((f) => localDate(f) === date) || data[0]
  return mapAeroDataBoxFlight(flight, flightNumber, date)
}

function wallClockHmFromIso(iso) {
  if (!iso) return ''
  const m = /T(\d{2}):(\d{2})/.exec(String(iso))
  return m ? `${m[1]}:${m[2]}` : ''
}

function toScheduleTemplate(flight, patternDate) {
  if (!flight?.departureAirportCode || !flight?.arrivalAirportCode) return null

  const depTime = wallClockHmFromIso(flight.departureDateTime)
  const arrTime = wallClockHmFromIso(flight.arrivalDateTime)
  if (!depTime || !arrTime) return null

  const depDate = String(flight.departureDateTime || '').slice(0, 10)
  const arrDate = String(flight.arrivalDateTime || '').slice(0, 10)
  let arrivalDayOffset = 0
  if (depDate && arrDate && depDate !== arrDate) {
    arrivalDayOffset = Math.max(
      0,
      Math.round((new Date(`${arrDate}T12:00:00`) - new Date(`${depDate}T12:00:00`)) / 86400000),
    )
  }

  return {
    airline: flight.airline,
    flightNumber: flight.flightNumber,
    departureAirportCode: flight.departureAirportCode,
    arrivalAirportCode: flight.arrivalAirportCode,
    departureTime: depTime,
    arrivalTime: arrTime,
    arrivalDayOffset,
    durationMinutes: flight.durationMinutes,
    patternDate,
  }
}

async function throwNotOnDate(flightNumber, date, availableDates) {
  const nearestDates = nearestOperatingDates(availableDates, date)
  let scheduleTemplate = null

  for (const patternDate of nearestDates) {
    try {
      const sample = await loadAeroDataBoxFlightOnDate(flightNumber, patternDate)
      scheduleTemplate = toScheduleTemplate(sample, patternDate)
      if (scheduleTemplate) break
    } catch {
      /* try next nearest date */
    }
  }

  const err = new Error('Flight not found on requested date')
  err.code = 'NOT_ON_DATE'
  err.availableDates = availableDates
  err.nearestDates = nearestDates
  err.scheduleTemplate = scheduleTemplate
  throw err
}

async function searchRouteAeroDataBox(from, to, date) {
  const dateStart1 = `${date}T00:00`
  const dateMid = `${date}T12:00`
  const dateEnd = `${date}T23:59`

  const departureParams = {
    withLeg: true,
    withCancelled: false,
    withCodeshared: true,
    withCargo: false,
    withPrivate: false,
    withLocation: false,
    direction: 'Departure',
  }

  let allDepartures = []
  let morningStatus = null
  let afternoonStatus = null

  try {
    const data1 = await aeroDataBoxGet(
      `/flights/airports/iata/${from.toUpperCase()}/${dateStart1}/${dateMid}`,
      { params: departureParams },
    )
    if (data1?.departures) allDepartures = allDepartures.concat(data1.departures)
  } catch (err) {
    morningStatus = err.response?.status || 500
    if (morningStatus === 429) throw err
  }

  try {
    const data2 = await aeroDataBoxGet(
      `/flights/airports/iata/${from.toUpperCase()}/${dateMid}/${dateEnd}`,
      { params: departureParams },
    )
    if (data2?.departures) allDepartures = allDepartures.concat(data2.departures)
  } catch (err) {
    afternoonStatus = err.response?.status || 500
    if (afternoonStatus === 429) throw err
  }

  if (allDepartures.length === 0) {
    if (morningStatus === 429 || afternoonStatus === 429) {
      const err = new Error('AeroDataBox rate limit')
      err.response = { status: 429 }
      throw err
    }
    return []
  }

  const destIata = to.toUpperCase()
  let noIataRejected = 0
  const matched = allDepartures.filter((flight) => {
    const arrivalIata = flight.arrival?.airport?.iata
    if (arrivalIata === destIata) return true
    if (!arrivalIata) noIataRejected++
    return false
  })
  if (noIataRejected > 0) {
    console.warn(
      `[flightSearch] ${noIataRejected} departures rejected (arrival airport has no IATA code)`,
    )
  }

  return finalizeRouteFlights(
    matched.map((flight) => mapAeroDataBoxRouteFlight(flight, from, to, date)),
    date,
  )
}

async function searchRouteFallbacks(from, to, date, filters) {
  const attempts = []

  // Primary fallback — separate RapidAPI quota from AeroDataBox
  if (googleFlights.isConfigured()) {
    attempts.push(async () => {
      const rows = await googleFlights.searchFlights(from, to, date)
      return rows.map((row, i) => mapGoogleFlightsRoute(row, from, to, date, i))
    })
  }

  // Free affiliate data (no per-search API cost)
  if (travelpayouts.isConfigured()) {
    attempts.push(async () => {
      const rows = await travelpayouts.searchFlights(from, to, date)
      return rows.map((row, i) => mapTravelpayoutsRoute(row, from, to, date, i))
    })
  }

  // Last resort — production Duffel only (sandbox tokens return fictional data)
  if (duffel.isConfiguredForRouteSearch()) {
    attempts.push(async () => {
      const rows = await duffel.searchFlights(from, to, date)
      return rows.map((row) => mapDuffelRoute(row, from, to, date))
    })
  }

  let anyProviderSucceeded = false

  for (const attempt of attempts) {
    try {
      const flights = applyRouteFilters(await attempt(), filters)
      anyProviderSucceeded = true
      if (flights.length > 0) {
        const finalized = await finalizeRouteFlights(flights, date)
        if (finalized.length > 0) {
          console.log(`[flightSearch] route fallback succeeded (${finalized[0].source})`)
          return { flights: finalized, anyProviderSucceeded: true }
        }
      }
    } catch (error) {
      console.error('[flightSearch] route fallback failed:', error.message)
    }
  }

  return { flights: [], anyProviderSucceeded }
}

/**
 * Search flights on a route. AeroDataBox first; on empty/rate-limit, fall back to
 * Google Flights → Travelpayouts → Duffel.
 */
export async function searchRoute(from, to, date, filters = {}) {
  let aeroDataBoxSucceeded = false

  if (process.env.RAPIDAPI_KEY) {
    try {
      const flights = applyRouteFilters(
        await searchRouteAeroDataBox(from, to, date),
        filters,
      )
      aeroDataBoxSucceeded = true
      if (flights.length > 0) return flights
    } catch (error) {
      console.warn('[flightSearch] AeroDataBox route search failed:', error.message)
    }
  }

  const { flights: fallbackFlights, anyProviderSucceeded } =
    await searchRouteFallbacks(from, to, date, filters)
  if (fallbackFlights.length > 0) return fallbackFlights

  if (aeroDataBoxSucceeded || anyProviderSucceeded) {
    return []
  }

  const err = new Error('All flight search providers failed')
  err.code = 'PROVIDERS_UNAVAILABLE'
  throw err
}

async function searchByNumberAeroDataBox(flightNumber, date) {
  const normalized = normalizeFlightNumber(flightNumber) || String(flightNumber || '').trim()
  const data = await aeroDataBoxGet(`/flights/number/${encodeURIComponent(normalized)}/${date}`, {
    params: {
      withAircraftImage: false,
      withLocation: false,
    },
  })

  if (!data?.length) return null

  const localDate = (f) => {
    const dep = pickIsoDateTime(readAeroDataBoxTimes(f.departure))
    return dep ? dep.slice(0, 10) : null
  }

  const flight = data.find((f) => localDate(f) === date) || null
  if (!flight) {
    const availableDates = [...new Set(data.map(localDate).filter(Boolean))]
    await throwNotOnDate(flightNumber, date, availableDates)
  }

  return mapAeroDataBoxFlight(flight, flightNumber, date)
}

/**
 * Look up a single flight by number + date. AeroDataBox first; Aviationstack
 * (RapidAPI, same key) when rate-limited. Aviationstack free tier is live-only.
 */
export async function searchByFlightNumber(flightNumber, date) {
  if (!process.env.RAPIDAPI_KEY) {
    const err = new Error('Flight API not configured')
    err.code = 'NOT_CONFIGURED'
    throw err
  }

  try {
    const result = await searchByNumberAeroDataBox(flightNumber, date)
    if (result) return result

    const operatingDates = await fetchOperatingDates(flightNumber, date)
    if (operatingDates.length) {
      await throwNotOnDate(flightNumber, date, operatingDates)
    }

    return null
  } catch (error) {
    if (error.code === 'NOT_ON_DATE') throw error
    if (!isRateLimitError(error)) throw error
    console.warn('[flightSearch] AeroDataBox rate limited — trying Aviationstack')
  }

  const fallback = await aviationStack.searchFlightByNumber(flightNumber, date)
  if (fallback) return fallback

  const err = new Error('All flight lookup providers rate limited or unavailable')
  err.response = { status: 429 }
  throw err
}

/** Airport autocomplete with AeroDataBox fallback on 429. */
export async function searchAirports(query, limit = 10) {
  try {
    return await searchStaticAirports(query, limit)
  } catch (error) {
    if (!isRateLimitError(error)) throw error
    console.warn('[flightSearch] airport API rate limited — trying fallbacks')
  }

  const trimmed = query.trim()

  if (googleFlights.isConfigured()) {
    try {
      const rows = await googleFlights.searchAirports(trimmed)
      const mapped = (rows || [])
        .slice(0, limit)
        .map((row) => ({
          code: row.id?.replace(/^airport\./, '') || row.iata || '',
          name: row.name || row.description || '',
          city: row.city || row.city_name || '',
          country: row.country || row.country_code || '',
        }))
        .filter((a) => a.code)
      if (mapped.length) return mapped
    } catch (error) {
      console.error('[flightSearch] Google Flights airport fallback failed:', error.message)
    }
  }

  if (duffel.isConfigured()) {
    try {
      const rows = await duffel.searchAirports(trimmed)
      const mapped = (rows || []).slice(0, limit).map((row) => ({
        code: row.iataCode,
        name: row.name,
        city: row.city,
        country: row.country,
      }))
      if (mapped.length) return mapped
    } catch (error) {
      console.error('[flightSearch] Duffel airport fallback failed:', error.message)
    }
  }

  return []
}
