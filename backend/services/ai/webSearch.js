import { getOpenAI, UTILITY_MODEL } from "./openaiClient.js";

export const MAX_WEB_SEARCHES_PER_TURN = 3;
export const WEB_SEARCH_TIMEOUT_MS = 15_000;

const EMPTY = Object.freeze({
  ok: false,
  error: "unavailable",
  text: "",
  citations: [],
});

/**
 * Hosted web lookup is on when an OpenAI key is present, unless explicitly
 * disabled with LOKA_WEB_SEARCH=off.
 * @returns {boolean}
 */
export function isWebSearchEnabled() {
  if (process.env.LOKA_WEB_SEARCH === "off") return false;
  return Boolean(process.env.OPENAI_API_KEY);
}

function emptyResult(error) {
  return { ok: false, error, text: "", citations: [] };
}

function citationsFromResponse(response) {
  const citations = [];
  const seen = new Set();
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item.content || []) {
      if (part?.type !== "output_text") continue;
      for (const ann of part.annotations || []) {
        if (ann?.type !== "url_citation" || !ann.url) continue;
        if (seen.has(ann.url)) continue;
        seen.add(ann.url);
        citations.push({
          url: String(ann.url),
          title: typeof ann.title === "string" ? ann.title : "",
        });
      }
    }
  }
  return citations;
}

/**
 * Look up live tour hours, dates, prices, or booking pages via OpenAI's
 * hosted web search (Responses API, `web_search_preview` — the tool type
 * openai@4.104.0 actually types). Never throws.
 *
 * @param {string} query
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string, text: string, citations: { url: string, title: string }[] }>}
 */
export async function webSearch(query, { timeoutMs = WEB_SEARCH_TIMEOUT_MS } = {}) {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return emptyResult("empty_query");
  if (!isWebSearchEnabled()) return { ...EMPTY };

  const openai = getOpenAI();
  if (!openai?.responses?.create) return { ...EMPTY };

  try {
    const response = await openai.responses.create(
      {
        model: UTILITY_MODEL,
        input: q,
        tools: [{ type: "web_search_preview", search_context_size: "medium" }],
        tool_choice: { type: "web_search_preview" },
        max_output_tokens: 800,
      },
      { timeout: timeoutMs },
    );

    const text = typeof response?.output_text === "string" ? response.output_text.trim() : "";
    const citations = citationsFromResponse(response);
    return { ok: true, text, citations };
  } catch (err) {
    const message = err?.message ? String(err.message) : "failed";
    const timedOut = /timeout|timed out|abort/i.test(message);
    const rateLimited = err?.status === 429 || /rate limit/i.test(message);
    console.error("[ai/webSearch] lookup failed:", message);
    return emptyResult(timedOut ? "timeout" : rateLimited ? "rate_limit" : "failed");
  }
}
