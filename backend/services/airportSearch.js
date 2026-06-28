import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { aeroDataBoxGet, AIRPORT_CACHE_TTL_MS } from './aeroDataBox.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const airports = JSON.parse(readFileSync(join(__dirname, '../data/airports.json'), 'utf8'))

const STATIC_AIRPORTS = airports.map((a) => ({
  code: a.code,
  name: a.name,
  city: a.city,
  country: a.country,
  location: { lat: a.lat, lng: a.lng },
}))

function scoreMatch(airport, q) {
  const code = airport.code.toLowerCase()
  const name = airport.name.toLowerCase()
  const city = airport.city.toLowerCase()
  const country = airport.country.toLowerCase()

  if (code === q) return 100
  if (code.startsWith(q)) return 90
  if (city.startsWith(q)) return 80
  if (name.startsWith(q)) return 70
  if (code.includes(q)) return 60
  if (city.includes(q)) return 50
  if (name.includes(q)) return 40
  if (country.includes(q)) return 30
  return 0
}

function searchStaticAirports(query, limit = 10) {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  return STATIC_AIRPORTS.map((airport) => ({
    airport,
    score: scoreMatch(airport, q),
  }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.airport.code.localeCompare(b.airport.code))
    .slice(0, limit)
    .map(({ airport }) => airport)
}

function mapApiAirports(items) {
  return (items ?? [])
    .filter((airport) => airport.iata)
    .map((airport) => ({
      code: airport.iata,
      name: airport.name,
      city: airport.municipalityName,
      country: airport.countryCode,
      location: {
        lat: airport.location?.lat || 0,
        lng: airport.location?.lon || 0,
      },
    }))
}

/**
 * Search airports: static database first, AeroDataBox API only when static has no matches.
 */
export async function searchAirports(query, limit = 10) {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const staticResults = searchStaticAirports(trimmed, limit)
  if (staticResults.length > 0) {
    return staticResults
  }

  if (!process.env.RAPIDAPI_KEY) {
    return []
  }

  const data = await aeroDataBoxGet('/airports/search/term', {
    params: { q: trimmed, limit },
    cacheTtlMs: AIRPORT_CACHE_TTL_MS,
  })

  return mapApiAirports(data.items).slice(0, limit)
}

export function getStaticAirportCount() {
  return STATIC_AIRPORTS.length
}
