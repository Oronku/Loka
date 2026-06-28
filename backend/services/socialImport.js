import axios from "axios";
import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Lightweight social-link caption fetcher for the Explore import flow.
 *
 * Modeled on services/aeroDataBox.js: a small in-memory cache, graceful
 * degradation when a provider/key is missing (never throws to the caller —
 * returns null instead), plus a persistent Mongo cache (`social_caption_cache`)
 * keyed by normalized URL so repeat imports are free.
 *
 * Caption-only by design: no video download / transcription / OCR. Keeps the
 * import well under 1 minute.
 */

const CAPTION_CACHE_COLLECTION = "social_caption_cache";

const MEM_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const DB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REQUEST_TIMEOUT_MS = 12000;

const memCache = new Map();

function getMemCached(key) {
  const entry = memCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setMemCache(key, data) {
  memCache.set(key, { data, expiresAt: Date.now() + MEM_CACHE_TTL_MS });
}

/** Identify the social platform a URL belongs to. */
export function detectPlatform(url) {
  if (!url || typeof url !== "string") return "unknown";
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com") || u.includes("instagr.am")) return "instagram";
  return "unknown";
}

/**
 * Normalize a social URL for stable caching: strip query/hash and trailing
 * slashes. Short links (vm.tiktok.com) are normalized after redirect resolution.
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== "string") return url;
  try {
    const parsed = new URL(url.trim());
    parsed.search = "";
    parsed.hash = "";
    let normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
    return normalized;
  } catch {
    return url.trim();
  }
}

/**
 * Resolve a TikTok short link (vm.tiktok.com / vt.tiktok.com) to its canonical
 * URL by following redirects. Returns the original URL on any failure.
 */
export async function resolveRedirect(url) {
  if (!url) return url;
  const isShort = /\/\/(vm|vt)\.tiktok\.com/i.test(url);
  if (!isShort) return url;

  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      timeout: REQUEST_TIMEOUT_MS,
      // We only want the final URL; avoid downloading the full HTML payload.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LokaBot/1.0; +https://meetloka.com)",
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const finalUrl =
      response.request?.res?.responseUrl ||
      response.request?.responseURL ||
      url;
    return finalUrl || url;
  } catch (err) {
    // Some clients still expose the resolved URL on the error object.
    const fallback =
      err?.request?.res?.responseUrl || err?.response?.request?.res?.responseUrl;
    if (fallback) return fallback;
    console.error("[socialImport] resolveRedirect failed:", err.message);
    return url;
  }
}

/**
 * TikTok caption via the public oEmbed endpoint (no key required). The caption
 * lives in the `title` field. Returns null on any failure.
 */
async function fetchTikTokCaption(url) {
  try {
    const response = await axios.get("https://www.tiktok.com/oembed", {
      params: { url },
      timeout: REQUEST_TIMEOUT_MS,
    });
    const data = response.data || {};
    const caption = data.title || "";
    return {
      caption: caption.trim(),
      authorName: data.author_name || null,
      thumbnailUrl: data.thumbnail_url || null,
      method: "oembed",
    };
  } catch (err) {
    console.error("[socialImport] TikTok oEmbed failed:", err.message);
    return null;
  }
}

const GENERIC_IG_TITLE_RE = /^video by @/i;

const EMBED_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.instagram.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
};

/** Instagram web API id (public, embedded in their frontend). */
const IG_APP_ID = "936619743392459";

/** Read instagram.com cookies from a Netscape cookies.txt (yt-dlp export). */
function readInstagramCookieHeader() {
  const path = process.env.YTDLP_COOKIES_FILE;
  if (!path || !existsSync(path)) return null;
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    const pairs = [];
    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const [domain, , , , , name, value] = parts;
      if (domain?.includes("instagram.com")) pairs.push(`${name}=${value}`);
    }
    return pairs.length ? pairs.join("; ") : null;
  } catch {
    return null;
  }
}

function instagramRequestHeaders() {
  const headers = { ...EMBED_FETCH_HEADERS, "X-IG-App-ID": IG_APP_ID };
  const cookie = readInstagramCookieHeader();
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Instagram og:description is "Nk likes, N comments - user on Date: \"caption\"" */
function parseInstagramOgDescription(raw) {
  if (!raw) return null;
  const decoded = decodeHtmlEntities(raw.trim());
  const quoted = decoded.match(/\bon\s+[^:]+:\s*"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1].trim();
  const plain = decoded.match(/\bon\s+[^:]+:\s*(.+)$/i);
  if (plain?.[1]) return plain[1].replace(/"\s*$/, "").trim();
  return decoded.length > 10 ? decoded : null;
}

function extractInstagramShortcode(url) {
  const match = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function unescapeEmbedCaption(raw) {
  // Embed JSON is often double-escaped: \\u00e9, \\n, etc.
  let text = raw.replace(/\\\\(?=[unrt"\\])/g, "\\");
  while (/\\u[0-9a-fA-F]{4}/.test(text)) {
    text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function normalizeCaptionText(text) {
  if (!text || typeof text !== "string") return text || "";
  if (/\\[unrt"\\]/.test(text)) return unescapeEmbedCaption(text);
  return text;
}

function extractCaptionFromEmbedHtml(html) {
  const jsonIdx = html.indexOf("edge_media_to_caption");
  if (jsonIdx !== -1) {
    const slice = html.slice(jsonIdx, jsonIdx + 4000);
    const match =
      slice.match(/\\"text\\":\\"((?:\\\\.|[^\\"])*)\\"/) ||
      slice.match(/"text":"((?:\\.|[^"\\])*)"/);
    if (match?.[1]) {
      const caption = unescapeEmbedCaption(match[1]).trim();
      if (caption) return caption;
    }
  }

  // Visible caption block when JSON is stripped (rate-limit / challenge pages).
  const divMatch = html.match(
    /<div class="Caption"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/
  );
  if (divMatch?.[1]) {
    const text = divMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    // Drop leading @username from CaptionUsername link text.
    const cleaned = text.replace(/^@\S+\s+/i, "").replace(/^[^\s]+\s+(?=[A-Z#@])/i, "");
    if (cleaned.length > 4) return cleaned;
  }

  return null;
}

function isBlockedInstagramHtml(html) {
  return (
    html.length > 500_000 &&
    !html.includes("edge_media_to_caption") &&
    !html.includes('class="Caption"')
  );
}

async function fetchEmbedHtml(embedUrl) {
  const response = await axios.get(embedUrl, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: instagramRequestHeaders(),
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return typeof response.data === "string"
    ? response.data
    : Buffer.from(response.data).toString("utf8");
}

/**
 * Free Instagram caption via the public /embed/captioned/ page (no API key).
 * Works for most public Reels/posts without login.
 */
async function fetchInstagramCaptionViaEmbed(normalizedUrl) {
  const shortcode = extractInstagramShortcode(normalizedUrl);
  if (!shortcode) return null;

  const kinds = normalizedUrl.includes("/p/")
    ? ["p", "reel", "tv"]
    : normalizedUrl.includes("/tv/")
    ? ["tv", "reel", "p"]
    : ["reel", "p", "tv"];

  for (const kind of kinds) {
    const embedUrl = `https://www.instagram.com/${kind}/${shortcode}/embed/captioned/`;
    try {
      let html = await fetchEmbedHtml(embedUrl);
      if (isBlockedInstagramHtml(html)) {
        await new Promise((r) => setTimeout(r, 800));
        html = await fetchEmbedHtml(embedUrl);
      }
      const caption = extractCaptionFromEmbedHtml(html);
      if (!caption) continue;
      return {
        caption,
        authorName: null,
        thumbnailUrl: null,
        method: "embed",
      };
    } catch (err) {
      console.warn(
        `[socialImport] embed (${kind}) failed:`,
        err.message?.split("\n")[0]
      );
    }
  }

  return null;
}

const YTDLP_BIN = () => process.env.YTDLP_PATH || "yt-dlp";

/** Build ordered yt-dlp auth attempts: plain → cookies file → browser cookies. */
function ytDlpAuthAttempts() {
  const attempts = [{ label: "plain", prefixArgs: [] }];

  if (
    process.env.YTDLP_COOKIES_FILE &&
    existsSync(process.env.YTDLP_COOKIES_FILE)
  ) {
    attempts.push({
      label: "cookies-file",
      prefixArgs: ["--cookies", process.env.YTDLP_COOKIES_FILE],
    });
  }

  const browsers = (
    process.env.YTDLP_COOKIES_FROM_BROWSER ||
    (process.platform === "darwin" ? "safari,chrome,chromium,firefox" : "")
  )
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

  for (const browser of browsers) {
    attempts.push({
      label: `browser:${browser}`,
      prefixArgs: ["--cookies-from-browser", browser],
    });
  }

  return attempts;
}

function parseYtDlpJson(stdout) {
  const data = JSON.parse(stdout);
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const caption =
    description ||
    (title && !GENERIC_IG_TITLE_RE.test(title) ? title : "");
  if (!caption) return null;
  return {
    caption,
    authorName: data.uploader || data.channel || null,
    thumbnailUrl: data.thumbnail || null,
  };
}

async function runYtDlpDumpJson(url, prefixArgs) {
  const bin = YTDLP_BIN();
  const args = [
    ...prefixArgs,
    "--dump-json",
    "--no-download",
    "--no-playlist",
    "--no-warnings",
    url,
  ];
  const { stdout } = await execFileAsync(bin, args, {
    timeout: REQUEST_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C" },
  });
  return parseYtDlpJson(stdout);
}

/**
 * Free Instagram caption via yt-dlp metadata (no video download). Tries plain
 * fetch first, then cookies file / browser session cookies on macOS.
 */
async function fetchInstagramCaptionViaYtDlp(url) {
  let sawMissingBinary = false;

  for (const attempt of ytDlpAuthAttempts()) {
    try {
      const parsed = await runYtDlpDumpJson(url, attempt.prefixArgs);
      if (parsed?.caption) {
        return { ...parsed, method: "yt-dlp" };
      }
    } catch (err) {
      if (err?.code === "ENOENT") {
        sawMissingBinary = true;
        break;
      }
      // Try the next auth strategy (Instagram often needs browser cookies).
      console.warn(
        `[socialImport] yt-dlp (${attempt.label}) failed:`,
        err.message?.split("\n")[0]
      );
    }
  }

  if (sawMissingBinary) {
    console.warn(
      "[socialImport] yt-dlp not installed; skip free IG caption fetch"
    );
  }
  return null;
}

/** Best-effort og:description on the canonical reel/post page. */
async function fetchInstagramCaptionViaOpenGraph(normalizedUrl) {
  try {
    const response = await axios.get(normalizedUrl, {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
      headers: instagramRequestHeaders(),
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const html = String(response.data || "");
    const match =
      html.match(/property="og:description"\s+content="([^"]*)"/i) ||
      html.match(/content="([^"]*)"\s+property="og:description"/i);
    const caption = parseInstagramOgDescription(match?.[1]);
    if (!caption) return null;
    return {
      caption,
      authorName: null,
      thumbnailUrl: null,
      method: "opengraph",
    };
  } catch (err) {
    console.warn("[socialImport] OpenGraph scrape failed:", err.message);
    return null;
  }
}

/**
 * Instagram caption via a managed scraper provider (RapidAPI-style), keyed by
 * env. Used only when yt-dlp fails or is unavailable.
 *
 * Env:
 *   INSTAGRAM_SCRAPER_API_KEY   RapidAPI key for the chosen provider
 *   INSTAGRAM_SCRAPER_API_HOST  RapidAPI host (e.g. instagram-scraper-api2.p.rapidapi.com)
 *   INSTAGRAM_SCRAPER_API_URL   Full endpoint URL that accepts a `url` query param
 */
async function fetchInstagramCaptionViaScraper(url) {
  const apiKey =
    process.env.INSTAGRAM_SCRAPER_API_KEY || process.env.RAPIDAPI_KEY;
  const apiHost =
    process.env.INSTAGRAM_SCRAPER_API_HOST ||
    "instagram-scraper-api2.p.rapidapi.com";
  const apiUrl =
    process.env.INSTAGRAM_SCRAPER_API_URL ||
    "https://instagram-scraper-api2.p.rapidapi.com/v1/media_info";

  if (!apiKey) {
    return null;
  }

  try {
    const response = await axios.get(apiUrl, {
      params: { url, code_or_id_or_url: url },
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": apiHost,
      },
    });
    const caption = extractCaptionFromScraperResponse(response.data);
    if (!caption) return null;
    return {
      caption: caption.trim(),
      authorName: null,
      thumbnailUrl: null,
      method: "scraper",
    };
  } catch (err) {
    console.error("[socialImport] Instagram scraper failed:", err.message);
    return null;
  }
}

/** embed → OpenGraph → yt-dlp → optional RapidAPI scraper. All use normalized URL. */
async function fetchInstagramCaption(normalizedUrl) {
  const viaEmbed = await fetchInstagramCaptionViaEmbed(normalizedUrl);
  if (viaEmbed?.caption) return viaEmbed;

  const viaOg = await fetchInstagramCaptionViaOpenGraph(normalizedUrl);
  if (viaOg?.caption) return viaOg;

  const viaYtDlp = await fetchInstagramCaptionViaYtDlp(normalizedUrl);
  if (viaYtDlp?.caption) return viaYtDlp;

  const viaScraper = await fetchInstagramCaptionViaScraper(normalizedUrl);
  if (viaScraper?.caption) return viaScraper;

  return null;
}

/**
 * Different IG scraper providers nest the caption differently. Probe the most
 * common shapes; return "" if none match.
 */
function extractCaptionFromScraperResponse(data) {
  if (!data) return "";
  const candidates = [
    data?.caption,
    data?.caption?.text,
    data?.data?.caption,
    data?.data?.caption?.text,
    data?.data?.edge_media_to_caption?.edges?.[0]?.node?.text,
    data?.edge_media_to_caption?.edges?.[0]?.node?.text,
    data?.result?.caption,
    data?.items?.[0]?.caption?.text,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "";
}

async function getDbCached(db, url) {
  if (!db) return null;
  try {
    const entry = await db
      .collection(CAPTION_CACHE_COLLECTION)
      .findOne({ url });
    if (!entry) return null;
    if (entry.expiresAt && new Date(entry.expiresAt).getTime() < Date.now()) {
      return null;
    }
    return entry;
  } catch (err) {
    console.error("[socialImport] DB cache read failed:", err.message);
    return null;
  }
}

async function setDbCache(db, url, payload) {
  if (!db) return;
  try {
    await db.collection(CAPTION_CACHE_COLLECTION).updateOne(
      { url },
      {
        $set: {
          ...payload,
          url,
          cachedAt: new Date(),
          expiresAt: new Date(Date.now() + DB_CACHE_TTL_MS),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("[socialImport] DB cache write failed:", err.message);
  }
}

function normalizeCachedCaption(caption) {
  return normalizeCaptionText(caption);
}

/**
 * Fetch the caption/metadata text for a shared social URL.
 *
 * Never throws. Returns:
 *   { platform, url, resolvedUrl, caption, authorName, thumbnailUrl, cached }
 * `caption` may be "" when the platform is unsupported or extraction failed —
 * callers should fall back to manual place entry in that case.
 *
 * @param {import('mongodb').Db|null} db
 * @param {string} rawUrl
 * @param {{ captionHint?: string }} [options] Share-sheet text from the client
 *   when the OS includes caption alongside the URL (used when fetch fails).
 */
export async function getCaption(db, rawUrl, options = {}) {
  const platform = detectPlatform(rawUrl);
  const resolvedUrl = await resolveRedirect(rawUrl);
  const url = normalizeUrl(resolvedUrl);

  const base = {
    platform,
    url,
    resolvedUrl,
    caption: "",
    authorName: null,
    thumbnailUrl: null,
    cached: false,
  };

  const memHit = getMemCached(url);
  if (memHit !== undefined) {
    return {
      ...memHit,
      caption: normalizeCachedCaption(memHit.caption),
      cached: true,
    };
  }

  const dbHit = await getDbCached(db, url);
  if (dbHit) {
    const result = {
      ...base,
      caption: normalizeCachedCaption(dbHit.caption || ""),
      authorName: dbHit.authorName || null,
      thumbnailUrl: dbHit.thumbnailUrl || null,
    };
    setMemCache(url, result);
    return { ...result, cached: true };
  }

  let fetched = null;
  switch (platform) {
    case "tiktok":
      fetched = await fetchTikTokCaption(resolvedUrl);
      break;
    case "instagram":
      fetched = await fetchInstagramCaption(url);
      break;
    case "unknown":
      fetched = null;
      break;
    default: {
      const _exhaustive = platform;
      void _exhaustive;
      fetched = null;
    }
  }

  const hint =
    typeof options.captionHint === "string" ? options.captionHint.trim() : "";
  const rawCaption = fetched?.caption || hint || "";
  const caption = normalizeCaptionText(rawCaption);

  const result = {
    ...base,
    caption,
    authorName: fetched?.authorName || null,
    thumbnailUrl: fetched?.thumbnailUrl || null,
    captionSource: fetched?.caption
      ? fetched.method || "fetch"
      : hint
      ? "share_hint"
      : null,
  };

  // Only persist successful, non-empty captions so failures can be retried.
  if (result.caption) {
    setMemCache(url, result);
    await setDbCache(db, url, {
      platform: result.platform,
      caption: result.caption,
      authorName: result.authorName,
      thumbnailUrl: result.thumbnailUrl,
    });
  }

  return result;
}

export { CAPTION_CACHE_COLLECTION };
