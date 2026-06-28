import express from 'express'
import { aeroDataBoxGet } from '../services/aeroDataBox.js'
import { searchAirports } from '../services/airportSearch.js'

const router = express.Router()

/**
 * Normalize a datetime to strict ISO 8601, preserving the local offset.
 * AeroDataBox returns values like "2026-06-07 17:30+03:00" (space instead of
 * "T", no seconds); this converts them to "2026-06-07T17:30:00+03:00" so
 * downstream parsing (timeline, new Date()) is unambiguous.
 */
function toIsoDateTime(value) {
  if (!value) return value
  const m = String(value)
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?\s*(Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) return value
  const [, date, hm, sec, tz] = m
  const offset = tz ? tz.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : ''
  return `${date}T${hm}${sec || ':00'}${offset}`
}

// Search flight by flight number and date
router.get('/search/:flightNumber', async (req, res) => {
  try {
    const { flightNumber } = req.params
    const { date } = req.query // Expected format: YYYY-MM-DD

    if (!flightNumber || !date) {
      return res.status(400).json({ 
        error: 'Flight number and date are required',
        message: 'Please provide flightNumber as path parameter and date as query parameter (YYYY-MM-DD)'
      })
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY
    
    if (!RAPIDAPI_KEY) {
      return res.status(503).json({ 
        error: 'Flight API not configured',
        message: 'RapidAPI key is missing. Please configure RAPIDAPI_KEY in environment variables.'
      })
    }

    console.log(`Fetching real flight data for ${flightNumber} on ${date}`)
    const data = await aeroDataBoxGet(
      `/flights/number/${flightNumber}/${date}`,
      {
        params: {
          withAircraftImage: false,
          withLocation: false,
        },
      },
    )

    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: 'Flight not found',
        message: `No flight found for ${flightNumber} on ${date}`
      })
    }

    // AeroDataBox can return multiple instances for a flight number (adjacent
    // days, multi-leg, codeshares). Pick the one that actually operates on the
    // requested date instead of blindly taking the first result.
    const localDate = (f) => {
      const dep =
        f.departure?.scheduledTime?.local ||
        f.departure?.scheduledTime?.utc ||
        f.departure?.scheduledTimeLocal ||
        f.departure?.scheduledTimeUtc
      return dep ? String(dep).slice(0, 10) : null
    }

    const flight =
      data.find((f) => localDate(f) === date) || null

    if (!flight) {
      const availableDates = [...new Set(data.map(localDate).filter(Boolean))]
      return res.status(404).json({
        error: 'Flight not found on requested date',
        message: `No ${flightNumber} flight operates on ${date}.`,
        availableDates,
      })
    }

    // Extract datetime info (normalized to strict ISO 8601)
    const departureTime = toIsoDateTime(
      flight.departure?.scheduledTime?.local ||
        flight.departure?.scheduledTime?.utc ||
        flight.departure?.scheduledTimeLocal ||
        flight.departure?.scheduledTimeUtc
    )

    const arrivalTime = toIsoDateTime(
      flight.arrival?.scheduledTime?.local ||
        flight.arrival?.scheduledTime?.utc ||
        flight.arrival?.scheduledTimeLocal ||
        flight.arrival?.scheduledTimeUtc
    )
    
    // Calculate duration if both times are available
    let durationMinutes = 0
    if (departureTime && arrivalTime) {
      try {
        const deptDate = new Date(departureTime)
        const arrDate = new Date(arrivalTime)
        durationMinutes = Math.round((arrDate - deptDate) / (1000 * 60))
      } catch (e) {
        console.warn('Could not calculate duration:', e.message)
      }
    }
    
    // Transform to our format
    const flightData = {
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
        arrival: flight.arrival?.terminal || null
      },
      gate: {
        departure: flight.departure?.gate || null,
        arrival: flight.arrival?.gate || null
      }
    }

    res.json(flightData)
  } catch (error) {
    console.error('Flight search error:', error.message)
    
    // Return appropriate error based on status
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'Flight not found',
        message: `No flight data available for ${req.params.flightNumber} on ${req.query.date}. Please check the flight number and date.`
      })
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: 'Too many API requests. Please try again in a moment.'
      })
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch flight details',
      message: error.message 
    })
  }
})

// Search flights by route (origin → destination + date)
router.get('/search-route', async (req, res) => {
  try {
    const { from, to, date, directOnly, airline } = req.query

    if (!from || !to || !date) {
      return res.status(400).json({ 
        error: 'Origin, destination, and date are required',
        message: 'Please provide from, to, and date query parameters (YYYY-MM-DD)'
      })
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY
    
    if (!RAPIDAPI_KEY) {
      return res.status(503).json({ 
        error: 'Flight API not configured',
        message: 'RapidAPI key is missing. Please configure RAPIDAPI_KEY in environment variables.'
      })
    }

    console.log(`Searching flights from ${from.toUpperCase()} to ${to.toUpperCase()} on ${date}`)
    
    // AeroDataBox requires 12-hour windows max - search in two blocks
    const dateStart1 = `${date}T00:00`
    const dateMid = `${date}T12:00`
    const dateEnd = `${date}T23:59`
    
    let allDepartures = []
    let morningStatus = null
    let afternoonStatus = null

    const departureParams = {
      withLeg: true,
      withCancelled: false,
      withCodeshared: true,
      withCargo: false,
      withPrivate: false,
      withLocation: false,
      direction: 'Departure',
    }
    
    // Morning flights (00:00-12:00)
    try {
      const data1 = await aeroDataBoxGet(
        `/flights/airports/iata/${from.toUpperCase()}/${dateStart1}/${dateMid}`,
        { params: departureParams },
      )
      
      if (data1?.departures) {
        console.log(`Found ${data1.departures.length} morning departures`)
        allDepartures = allDepartures.concat(data1.departures)
      }
    } catch (err) {
      morningStatus = err.response?.status || 500
      console.log(`Morning flights error: ${morningStatus} - ${err.message}`)
    }
    
    // Afternoon/evening flights (12:00-23:59) — throttled via shared queue
    try {
      const data2 = await aeroDataBoxGet(
        `/flights/airports/iata/${from.toUpperCase()}/${dateMid}/${dateEnd}`,
        { params: departureParams },
      )
      
      if (data2?.departures) {
        console.log(`Found ${data2.departures.length} afternoon/evening departures`)
        allDepartures = allDepartures.concat(data2.departures)
      }
    } catch (err) {
      afternoonStatus = err.response?.status || 500
      console.log(`Afternoon flights error: ${afternoonStatus} - ${err.message}`)
    }

    if (allDepartures.length === 0) {
      if (morningStatus === 429 || afternoonStatus === 429) {
        return res.status(429).json({ 
          error: 'API rate limit exceeded',
          message: 'The flight search API has reached its rate limit. Please try again in a few minutes.'
        })
      }

      if (morningStatus >= 400 && afternoonStatus >= 400) {
        return res.status(502).json({
          error: 'Flight data unavailable',
          message: 'Could not fetch flight schedules from the provider. Please try again later.',
        })
      }

      return res.status(404).json({
        error: 'No flights found',
        message: `No departures found from ${from.toUpperCase()} on ${date}`,
      })
    }

    console.log(`Found ${allDepartures.length} total departures from ${from}`)

    // Debug: log the first flight's structure
    if (allDepartures.length > 0) {
      const sample = allDepartures[0]
      console.log('Sample flight structure:', JSON.stringify({
        number: sample.number,
        arrivalIata: sample.arrival?.airport?.iata,
        movementIata: sample.movement?.airport?.iata,
        arrival: sample.arrival,
        movement: sample.movement
      }, null, 2))
    }

    // Filter by destination airport IATA code
    let routeFlights = allDepartures.filter(flight => {
      const arrivalIata = flight.arrival?.airport?.iata
      return arrivalIata === to.toUpperCase()
    })
    
    console.log(`Filtered to ${routeFlights.length} flights to ${to}`)

    // Apply filters
    if (directOnly === 'true') {
      routeFlights = routeFlights.filter(f => !f.codeshareStatus || f.codeshareStatus === 'IsOperator')
    }

    if (airline) {
      routeFlights = routeFlights.filter(f => f.airline?.iata === airline.toUpperCase())
    }

    if (routeFlights.length === 0) {
      return res.status(404).json({ 
        error: 'No flights found',
        message: `No flights found from ${from} to ${to} on ${date} matching your criteria`
      })
    }

    console.log(`Found ${routeFlights.length} flights from ${from} to ${to}`)

    // Transform to our format using withLeg=true structure
    const flightResults = routeFlights.slice(0, 20).map(flight => {
      const depUtc = flight.departure?.scheduledTime?.utc
      const depLocal = flight.departure?.scheduledTime?.local
      const arrUtc = flight.arrival?.scheduledTime?.utc
      const arrLocal = flight.arrival?.scheduledTime?.local

      // Calculate duration from UTC timestamps
      let durationMinutes = 0
      if (depUtc && arrUtc) {
        try {
          const depDate = new Date(depUtc.replace(' ', 'T').replace('Z', '+00:00'))
          const arrDate = new Date(arrUtc.replace(' ', 'T').replace('Z', '+00:00'))
          durationMinutes = Math.round((arrDate - depDate) / 60000)
        } catch (e) { /* ignore */ }
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
          terminal: flight.departure?.terminal || null
        },
        arrival: {
          airport: `${flight.arrival?.airport?.name} (${flight.arrival?.airport?.iata})`,
          iata: flight.arrival?.airport?.iata || to.toUpperCase(),
          scheduled: toIsoDateTime(arrLocal || arrUtc) || `${date}T04:00:00Z`,
          terminal: flight.arrival?.terminal || null
        },
        durationMinutes,
        stops: 0,
        aircraft: flight.aircraft?.model || '',
        status: flight.status || 'scheduled'
      }
    })

    res.json({ flights: flightResults })
  } catch (error) {
    console.error('Route search error:', error.message)
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'No flights found',
        message: `No flights available from ${req.query.from} to ${req.query.to} on ${req.query.date}`
      })
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: 'Too many API requests. Please try again in a moment.'
      })
    }
    
    res.status(500).json({ 
      error: 'Failed to search flights',
      message: error.message 
    })
  }
})

// Airport search/autocomplete
router.get('/airports/search', async (req, res) => {
  const { query } = req.query
  
  try {
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Search query is required and must be at least 2 characters' 
      })
    }

    const airports = await searchAirports(query.trim())
    res.json({ airports })
  } catch (error) {
    console.error('Airport search error:', error.message)
    
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Airport search is temporarily unavailable. Try again in a few minutes.',
        airports: [],
      })
    }
    
    res.status(500).json({ 
      error: 'Failed to search airports',
      message: error.message,
      airports: []
    })
  }
})

export default router
