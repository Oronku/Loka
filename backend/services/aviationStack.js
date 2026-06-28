import axios from 'axios'

const BASE_URL = `https://${process.env.AVIATIONSTACK_RAPIDAPI_HOST || 'aviationstack1.p.rapidapi.com'}`
const HOST = process.env.AVIATIONSTACK_RAPIDAPI_HOST || 'aviationstack1.p.rapidapi.com'

/**
 * Aviationstack via RapidAPI — fallback for flight-by-number when AeroDataBox
 * is rate-limited. Uses the same RAPIDAPI_KEY as AeroDataBox / Google Flights.
 *
 * Free RapidAPI tier: live flights only (no flight_date — that requires paid plan).
 * Subscribe: https://rapidapi.com/apilayer/api/aviationstack
 */
class AviationStackService {
  isConfigured() {
    return !!process.env.RAPIDAPI_KEY
  }

  headers() {
    return {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': HOST,
    }
  }

  async searchFlightByNumber(flightNumber, date) {
    if (!this.isConfigured()) return null

    const normalized = String(flightNumber || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '')

    try {
      const response = await axios.get(`${BASE_URL}/flights`, {
        headers: this.headers(),
        params: {
          flight_iata: normalized,
          limit: 25,
        },
        timeout: 12000,
      })

      const flights = response.data?.data || []
      if (!flights.length) return null

      const onDate = flights.find((f) => {
        const dep = f.departure?.scheduled?.slice(0, 10)
        return dep === date
      })

      // Free tier has no flight_date filter — only accept an exact date match
      if (!onDate) {
        console.log(
          `[Aviationstack] no ${normalized} on ${date} (free tier is live-data only)`,
        )
        return null
      }

      return this.toFlightDetails(onDate, normalized, date)
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error?.message ||
        error.message
      console.error('[Aviationstack] flight lookup failed:', msg)
      return null
    }
  }

  toFlightDetails(flight, flightNumber, date) {
    const depScheduled = flight.departure?.scheduled || flight.departure?.estimated
    const arrScheduled = flight.arrival?.scheduled || flight.arrival?.estimated

    let durationMinutes = null
    if (depScheduled && arrScheduled) {
      try {
        durationMinutes = Math.round(
          (new Date(arrScheduled) - new Date(depScheduled)) / 60000,
        )
      } catch {
        /* ignore */
      }
    }

    return {
      airline: flight.airline?.name || 'Unknown',
      flightNumber: flight.flight?.iata || flightNumber,
      departureAirportCode: flight.departure?.iata || '',
      departureCity: flight.departure?.airport?.split(',')[0] || '',
      departureCountry: '',
      departureDateTime: depScheduled || `${date}T00:00:00`,
      departureTimeLocal: depScheduled || '',
      departureTimezone: flight.departure?.timezone || '',
      arrivalAirportCode: flight.arrival?.iata || '',
      arrivalCity: flight.arrival?.airport?.split(',')[0] || '',
      arrivalCountry: '',
      arrivalDateTime: arrScheduled || `${date}T00:00:00`,
      arrivalTimeLocal: arrScheduled || '',
      arrivalTimezone: flight.arrival?.timezone || '',
      durationMinutes: durationMinutes > 0 ? durationMinutes : null,
      status: flight.flight_status || 'scheduled',
      aircraft: flight.aircraft?.iata || null,
      aircraftType: flight.aircraft?.iata || null,
      terminal: {
        departure: flight.departure?.terminal || null,
        arrival: flight.arrival?.terminal || null,
      },
      gate: {
        departure: flight.departure?.gate || null,
        arrival: flight.arrival?.gate || null,
      },
      source: 'aviationstack',
    }
  }
}

export default new AviationStackService()
