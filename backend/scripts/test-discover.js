/**
 * Smoke test for discover feed builder.
 * Run: node scripts/test-discover.js
 */
import "dotenv/config";
import { connectToDatabase, closeDatabase } from "../config/database.js";
import {
  buildDiscoverFeed,
  formatDiscoverPlace,
  resolveCanonicalCategory,
} from "../services/discoverFeed.js";

async function main() {
  const sample = {
    placeId: "test-place",
    name: "Sample Café",
    location: { lat: 48.85, lng: 2.35 },
    images: ["https://example.com/photo.jpg"],
    types: ["cafe", "food"],
    sources: [{ url: "https://instagram.com/p/1" }, { url: "https://tiktok.com/@x" }],
    rating: 4.5,
  };

  const cat = resolveCanonicalCategory(sample);
  const formatted = formatDiscoverPlace(sample);
  if (cat !== "cafe" || formatted.sourceCount !== 2) {
    console.error("FAIL: category mapping or sourceCount", { cat, formatted });
    process.exit(1);
  }
  console.log("unit checks OK:", { cat, sourceCount: formatted.sourceCount });

  const db = await connectToDatabase();
  const feed = await buildDiscoverFeed(db);
  console.log(
    "discover feed:",
    JSON.stringify(
      {
        sectionCount: feed.sections.length,
        sections: feed.sections.map((s) => ({
          id: s.id,
          type: s.type,
          title: s.title,
          placeCount: s.places.length,
        })),
      },
      null,
      2
    )
  );

  if (!Array.isArray(feed.sections)) {
    console.error("FAIL: sections is not an array");
    process.exit(1);
  }

  for (const section of feed.sections) {
    if (!section.id || !section.type || !section.title || !Array.isArray(section.places)) {
      console.error("FAIL: invalid section shape", section);
      process.exit(1);
    }
    for (const place of section.places) {
      if (!place.placeId || !place.name || typeof place.sourceCount !== "number") {
        console.error("FAIL: invalid place shape", place);
        process.exit(1);
      }
    }
  }

  console.log("PASS");
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
