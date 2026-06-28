import express from 'express'
import {
  searchByFlightNumber,
  searchRoute,
  searchAirports,
} from '../services/flightSearch.js'

const router = express.Router()

// Search flight by flight number and date
router.get('/search/:flightNumber', async (req, res) => {
  try {
    const { flightNumber } = req.params
    const { date } = req.query // Expected format: YYYY-MM-DD

    if (!flightNumber || !date) {
      return res.status(400).json({
        error: 'Flight number and date are required',
        message:
          'Please provide flightNumber as path parameter and date as query parameter (YYYY-MM-DD)',
      })
    }

    if (!process.env.RAPIDAPI_KEY) {
      return res.status(503).json({
        error: 'Flight API not configured',
        message: 'Configure RAPIDAPI_KEY in environment variables.',
      })
    }

    console.log(`Fetching flight data for ${flightNumber} on ${date}`)
    const flightData = await searchByFlightNumber(flightNumber, date)

    if (!flightData) {
      return res.status(404).json({
        error: 'Flight not found',
        message: `No flight found for ${flightNumber} on ${date}`,
      })
    }

    res.json(flightData)
  } catch (error) {
    console.error('Flight search error:', error.message)

    if (error.code === 'NOT_ON_DATE') {
      return res.status(404).json({
        error: 'Flight not found on requested date',
        message: `No ${req.params.flightNumber} flight operates on ${req.query.date}.`,
        availableDates: error.availableDates,
      })
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Flight not found',
        message: `No flight data available for ${req.params.flightNumber} on ${req.query.date}. Please check the flight number and date.`,
      })
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many API requests. Please try again in a moment.',
      })
    }

    res.status(500).json({
      error: 'Failed to fetch flight details',
      message: error.message,
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
        message: 'Please provide from, to, and date query parameters (YYYY-MM-DD)',
      })
    }

    const hasProvider =
      process.env.RAPIDAPI_KEY ||
      process.env.DUFFEL_API_KEY ||
      process.env.TRAVELPAYOUTS_TOKEN

    if (!hasProvider) {
      return res.status(503).json({
        error: 'Flight API not configured',
        message:
          'Configure RAPIDAPI_KEY, DUFFEL_API_KEY, or TRAVELPAYOUTS_TOKEN.',
      })
    }

    console.log(
      `Searching flights from ${from.toUpperCase()} to ${to.toUpperCase()} on ${date}`,
    )

    const flightResults = await searchRoute(from, to, date, { directOnly, airline })

    if (flightResults.length === 0) {
      return res.status(404).json({
        error: 'No flights found',
        message: `No flights found from ${from} to ${to} on ${date} matching your criteria`,
      })
    }

    console.log(`Found ${flightResults.length} flights from ${from} to ${to}`)
    res.json({ flights: flightResults })
  } catch (error) {
    console.error('Route search error:', error.message)

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'No flights found',
        message: `No flights available from ${req.query.from} to ${req.query.to} on ${req.query.date}`,
      })
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many API requests. Please try again in a moment.',
      })
    }

    res.status(500).json({
      error: 'Failed to search flights',
      message: error.message,
    })
  }
})

// Airport search/autocomplete
router.get('/airports/search', async (req, res) => {
  const { query } = req.query

  try {
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query is required and must be at least 2 characters',
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
      airports: [],
    })
  }
})

export default router
