/**
 * Lightweight smoke test for getOrCreatePlaceCache address parsing.
 * Run: node scripts/test-place-cache.js
 */
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";
import {
  getOrCreatePlaceCache,
  parseAddressComponents,
} from "../services/placeCache.js";

// Eiffel Tower — stable Google place_id
const TEST_PLACE_ID = "ChIJD7fiBh9u5kcRYJSMaMOCCwQ";

async function main() {
  if (!process.env.GOOGLE_API_KEY) {
    console.log("SKIP: GOOGLE_API_KEY not set");
    process.exit(0);
  }

  // Unit-style parse check (no network)
  const parsed = parseAddressComponents([
    { long_name: "Paris", short_name: "Paris", types: ["locality", "political"] },
    { long_name: "France", short_name: "FR", types: ["country", "political"] },
  ]);
  console.log("parseAddressComponents sample:", parsed);
  if (parsed.city !== "Paris" || parsed.country !== "France" || parsed.countryCode !== "FR") {
    console.error("FAIL: parseAddressComponents");
    process.exit(1);
  }

  const db = await connectToDatabase();
  const doc = await getOrCreatePlaceCache(db, { placeId: TEST_PLACE_ID });

  if (!doc) {
    console.error("FAIL: getOrCreatePlaceCache returned null");
    process.exit(1);
  }

  console.log("getOrCreatePlaceCache result:", {
    placeId: doc.placeId,
    name: doc.name,
    city: doc.city,
    country: doc.country,
    countryCode: doc.countryCode,
    images: doc.images?.length ?? 0,
    types: doc.types?.slice(0, 3),
  });

  if (!doc.country || !doc.placeId) {
    console.error("FAIL: missing country or placeId");
    process.exit(1);
  }

  console.log("PASS");
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
