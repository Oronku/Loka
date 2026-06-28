import { aeroDataBoxGet } from './aeroDataBox.js'
import { searchAirports as searchStaticAirports } from './airportSearch.js'
import googleFlights from './googleFlights.js'
import duffel from './duffel.js'
import travelpayouts from './travelpayouts.js'
import aviationStack from './aviationStack.js'
import { normalizeFlightNumber } from './flightNumberUtils.js'

/** Normalize AeroDataBox-style datetimes to strict ISO 8601. */
export function toIsoDateTime(value) {
  if (!value) return value
  const m = String(value)
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?\s*(Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) return value
  const [, date, hm, sec, tz] = m
  const offset = tz ? tz.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : ''
  return `${date}T${hm}${sec || ':00'}${offset}`
}

function isRateLimitError(error) {
  return error?.response?.status === 429
}

function mapAeroDataBoxFlight(flight, flightNumber, date) {
  const departureTime = toIsoDateTime(
    flight.departure?.scheduledTime?.local ||
      flight.departure?.scheduledTime?.utc ||
      flight.departure?.scheduledTimeLocal ||
      flight.departure?.scheduledTimeUtc,
  )

  const arrivalTime = toIsoDateTime(
    flight.arrival?.scheduledTime?.local ||
      flight.arrival?.scheduledTime?.utc ||
      flight.arrival?.scheduledTimeLocal ||
      flight.arrival?.scheduledTimeUtc,
  )

  let durationMinutes = 0
  if (departureTime && arrivalTime) {
    try {
      durationMinutes = Math.round(
        (new Date(arrivalTime) - new Date(departureTime)) / 60000,
      )
    } catch {
      /* ignore */
    }
  }

  return {
    airline: flight.airline?.name || 'Unknown',
    flightNumber: flight.number || flightNumber,
    departureAirportCode: flight.departure?.airport?.iata || '',
    departureCity: flight.departure?.airport?.municipalityName || '',
    departureCountry: flight.departure?.airport?.countryCode || '',
    departureDateTime: departureTime || `${date}T00:00:00`,
    departureTimeLocal: departureTime || '',
    departureTimezone: flight.departure?.airport?.timezone || '',
    arrivalAirportCode: flight.arrival?.airport?.iata || '',
    arrivalCity: flight.arrival?.airport?.municipalityName || '',
    arrivalCountry: flight.arrival?.airport?.countryCode || '',
    arrivalDateTime: arrivalTime || `${date}T00:00:00`,
    arrivalTimeLocal: arrivalTime || '',
    arrivalTimezone: flight.arrival?.airport?.timezone || '',
    durationMinutes: durationMinutes > 0 ? durationMinutes : null,
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
  const depUtc = flight.departure?.scheduledTime?.utc
  const depLocal = flight.departure?.scheduledTime?.local
  const arrUtc = flight.arrival?.scheduledTime?.utc
  const arrLocal = flight.arrival?.scheduledTime?.local

  let durationMinutes = 0
  if (depUtc && arrUtc) {
    try {
      const depDate = new Date(depUtc.replace(' ', 'T').replace('Z', '+00:00'))
      const arrDate = new Date(arrUtc.replace(' ', 'T').replace('Z', '+00:00'))
      durationMinutes = Math.round((arrDate - depDate) / 60000)
    } catch {
      /* ignore */
    }
  }

  return {
    id: `${flight.number}-${date}`,
    airline: flight.airline?.name || 'Unknown',
    flightNumber: flight.number || '',
    flightIata: flight.airline?.iata || '',
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: toIsoDateTime(depLocal || depUtc) || `${date}T00:00:00Z`,
      terminal: flight.departure?.terminal || null,
    },
    arrival: {
      airport: `${flight.arrival?.airport?.name} (${flight.arrival?.airport?.iata})`,
      iata: flight.arrival?.airport?.iata || to.toUpperCase(),
      scheduled: toIsoDateTime(arrLocal || arrUtc) || `${date}T04:00:00Z`,
      terminal: flight.arrival?.terminal || null,
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
  const flightNumber = nums[0] || flight.flightNumbers?.split(',')[0]?.trim() || ''
  const airlineIata = normalizeFlightNumber(flightNumber).replace(/\d+$/, '')

  return {
    id: `google-${index}-${flightNumber || 'unknown'}`,
    airline: flight.airline,
    flightNumber,
    flightIata: airlineIata,
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: flight.departureTime || `${date}T00:00:00`,
      terminal: null,
    },
    arrival: {
      airport: `${to.toUpperCase()} Airport`,
      iata: to.toUpperCase(),
      scheduled: flight.arrivalTime || `${date}T04:00:00`,
      terminal: null,
    },
    durationMinutes: flight.durationMinutes || 0,
    stops: flight.stops ?? 0,
    aircraft: flight.aircraft || '',
    status: 'scheduled',
    source: 'google_flights',
  }
}

function mapDuffelRoute(flight, from, to, date) {
  const firstSeg = flight.segments?.[0]
  const flightNumber = firstSeg?.flightNumber ? String(firstSeg.flightNumber) : ''

  return {
    id: flight.id || `${flightNumber}-${date}`,
    airline: flight.airline,
    flightNumber,
    flightIata: '',
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: flight.departureTime || `${date}T00:00:00`,
      terminal: null,
    },
    arrival: {
      airport: `${to.toUpperCase()} Airport`,
      iata: to.toUpperCase(),
      scheduled: flight.arrivalTime || `${date}T04:00:00`,
      terminal: null,
    },
    durationMinutes: parseDurationMinutes(flight.duration) || 0,
    stops: flight.stops ?? 0,
    aircraft: flight.aircraft || '',
    status: 'scheduled',
    source: 'duffel',
  }
}

function mapTravelpayoutsRoute(flight, from, to, date, index) {
  const airline = flight.airline || ''
  const num = flight.flightNumber ?? flight.flight_number ?? ''
  const flightNumber = normalizeFlightNumber(`${airline}${num}`) || String(num)

  return {
    id: `aviasales-${index}-${flightNumber || 'unknown'}`,
    airline,
    flightNumber,
    flightIata: airline,
    departure: {
      airport: `${from.toUpperCase()} Airport`,
      iata: from.toUpperCase(),
      scheduled: flight.departure?.time || `${date}T00:00:00`,
      terminal: null,
    },
    arrival: {
      airport: `${to.toUpperCase()} Airport`,
      iata: to.toUpperCase(),
      scheduled: flight.arrival?.time || `${date}T04:00:00`,
      terminal: null,
    },
    durationMinutes: parseDurationMinutes(flight.duration) || 0,
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

  return allDepartures
    .filter((flight) => flight.arrival?.airport?.iata === to.toUpperCase())
    .map((flight) => mapAeroDataBoxRouteFlight(flight, from, to, date))
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

  // Last resort — Duffel test/sandbox is free; production offers cost money
  if (duffel.isConfigured()) {
    attempts.push(async () => {
      const rows = await duffel.searchFlights(from, to, date)
      return rows.map((row) => mapDuffelRoute(row, from, to, date))
    })
  }

  for (const attempt of attempts) {
    try {
      const flights = applyRouteFilters(await attempt(), filters)
      if (flights.length > 0) {
        console.log(`[flightSearch] route fallback succeeded (${flights[0].source})`)
        return flights.slice(0, 20)
      }
    } catch (error) {
      console.error('[flightSearch] route fallback failed:', error.message)
    }
  }

  return []
}

/**
 * Search flights on a route. AeroDataBox first; on empty/rate-limit, fall back to
 * Google Flights → Travelpayouts → Duffel.
 */
export async function searchRoute(from, to, date, filters = {}) {
  if (!process.env.RAPIDAPI_KEY) {
    return searchRouteFallbacks(from, to, date, filters)
  }

  try {
    const flights = applyRouteFilters(
      await searchRouteAeroDataBox(from, to, date),
      filters,
    )
    if (flights.length > 0) return flights.slice(0, 20)
  } catch (error) {
    if (!isRateLimitError(error)) throw error
    console.warn('[flightSearch] AeroDataBox rate limited — trying fallbacks')
  }

  const fallbackFlights = await searchRouteFallbacks(from, to, date, filters)
  if (fallbackFlights.length > 0) return fallbackFlights

  return []
}

async function searchByNumberAeroDataBox(flightNumber, date) {
  const data = await aeroDataBoxGet(`/flights/number/${flightNumber}/${date}`, {
    params: {
      withAircraftImage: false,
      withLocation: false,
    },
  })

  if (!data?.length) return null

  const localDate = (f) => {
    const dep =
      f.departure?.scheduledTime?.local ||
      f.departure?.scheduledTime?.utc ||
      f.departure?.scheduledTimeLocal ||
      f.departure?.scheduledTimeUtc
    return dep ? String(dep).slice(0, 10) : null
  }

  const flight = data.find((f) => localDate(f) === date) || null
  if (!flight) {
    const availableDates = [...new Set(data.map(localDate).filter(Boolean))]
    const err = new Error('Flight not found on requested date')
    err.code = 'NOT_ON_DATE'
    err.availableDates = availableDates
    throw err
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
