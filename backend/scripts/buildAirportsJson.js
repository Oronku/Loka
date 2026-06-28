import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '../data')

function parseCsvLine(line) {
  const result = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }

  result.push(cur)
  return result
}

function parseCsv(text) {
  const lines = text.trim().split('\n')
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']))
  })
}

const csvPath = join(dataDir, 'airports.csv')
const jsonPath = join(dataDir, 'airports.json')

const coordsByCode = new Map()
try {
  const existing = JSON.parse(readFileSync(jsonPath, 'utf8'))
  for (const airport of existing) {
    if (airport.lat != null && airport.lng != null) {
      coordsByCode.set(airport.code, { lat: airport.lat, lng: airport.lng })
    }
  }
} catch {
  // no existing coordinates to merge
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const airports = rows
  .filter((row) => row.IATA?.trim())
  .map((row) => {
    const code = row.IATA.trim().toUpperCase()
    const coords = coordsByCode.get(code)
    return {
      code,
      name: row['Airport name'].trim(),
      city: row.City.trim(),
      country: row.Country.trim(),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    }
  })

writeFileSync(jsonPath, `${JSON.stringify(airports)}\n`)

const withCoords = airports.filter((a) => a.lat != null).length
console.log(`Wrote ${airports.length} airports (${withCoords} with coordinates) to ${jsonPath}`)
