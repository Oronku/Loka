export { buildTimeline, toTime, extractLocation, airportQuery } from "./buildTimeline.js";
export {
  calculateTravelLegs,
  calculateArrivalTransfers,
} from "./calculateTravelLegs.js";
export {
  buildTripTimeline,
  buildPendingSnapshot,
  markTripTimelinePending,
  rebuildTripTimeline,
  ensureTripTimeline,
  scheduleTimelineRebuild,
  TIMELINE_SNAPSHOT_VERSION,
} from "./rebuildTripTimeline.js";

// Re-export the legacy buildTimelineSnapshot implementation from the
// companion `timeline.service.js` so callers importing from the
// `timelineService` folder receive a consistent public API.
export {
  buildTimelineSnapshot,
  findAttractionIndex,
  detectAttractionConflicts,
} from "../timeline.service.js";
