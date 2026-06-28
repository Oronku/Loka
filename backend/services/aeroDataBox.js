import axios from 'axios'

const BASE_URL = 'https://aerodatabox.p.rapidapi.com'
const HOST = 'aerodatabox.p.rapidapi.com'

/** AeroDataBox free tier allows ~1 request/sec. */
const MIN_INTERVAL_MS = 1200

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000
const AIRPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const cache = new Map()
let lastRequestAt = 0
let queue = Promise.resolve()

function cacheKey(path, params) {
  return `${path}:${JSON.stringify(params || {})}`
}

function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return undefined
  }
  return entry.data
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

async function waitForSlot() {
  const now = Date.now()
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestAt))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

/**
 * Serialized, throttled GET to AeroDataBox with optional in-memory cache.
 * Throws axios errors (including 429) to callers.
 */
export async function aeroDataBoxGet(path, { params, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    const err = new Error('RapidAPI key not configured')
    err.code = 'NOT_CONFIGURED'
    throw err
  }

  const key = cacheKey(path, params)
  const cached = getCached(key)
  if (cached !== undefined) return cached

  const run = async () => {
    await waitForSlot()
    const response = await axios.get(`${BASE_URL}${path}`, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': HOST,
      },
      params,
    })
    if (cacheTtlMs > 0) setCache(key, response.data, cacheTtlMs)
    return response.data
  }

  const result = queue.then(run, run)
  queue = result.catch(() => {})
  return result
}

export { AIRPORT_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS }
