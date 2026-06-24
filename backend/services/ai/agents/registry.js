import autoEnrich from "./autoEnrich.js";
import tripMonitor from "./tripMonitor.js";
import dailyBriefing from "./dailyBriefing.js";

/** All background agents, in run order. */
export const AGENTS = [tripMonitor, autoEnrich, dailyBriefing];

export const AGENTS_BY_NAME = Object.fromEntries(AGENTS.map((a) => [a.name, a]));
