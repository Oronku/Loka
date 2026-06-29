#!/usr/bin/env bash
# Export Instagram session cookies from Chrome for yt-dlp (one-time / occasional refresh).
# Requires: yt-dlp, Chrome logged into instagram.com
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COOKIES_FILE="${YTDLP_COOKIES_FILE:-$ROOT/data/instagram-cookies.txt}"
YTDLP="${YTDLP_PATH:-yt-dlp}"

mkdir -p "$(dirname "$COOKIES_FILE")"

echo "Exporting Instagram cookies from Chrome to: $COOKIES_FILE"
if ! "$YTDLP" \
  --cookies-from-browser chrome \
  --cookies "$COOKIES_FILE" \
  --skip-download \
  "https://www.instagram.com/" 2>/dev/null; then
  :
fi

if [[ -s "$COOKIES_FILE" ]]; then
  echo "Done ($(wc -c < "$COOKIES_FILE") bytes). Restart the backend if it is already running."
  exit 0
fi

echo "Failed — log into instagram.com in Chrome and retry." >&2
exit 1
