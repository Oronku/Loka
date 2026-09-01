import autoEnrich from "./autoEnrich.js";
import tripMonitor from "./tripMonitor.js";
import dailyBriefing from "./dailyBriefing.js";
import priceTracker from "./priceTracker.js";
import axisInterviewer from "./axisInterviewer.js";
import integrityMonitor from "./integrityMonitor.js";
import tripDeliberation from "./tripDeliberation.js";

/** All background agents, in run order. */
export const AGENTS = [
  tripMonitor,
  integrityMonitor,
  tripDeliberation,
  autoEnrich,
  dailyBriefing,
  priceTracker,
  axisInterviewer,
];

export const AGENTS_BY_NAME = Object.fromEntries(AGENTS.map((a) => [a.name, a]));
