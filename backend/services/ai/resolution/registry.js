import { stayResolver } from "./resolvers/stay.js";
import { travelResolver } from "./resolvers/travel.js";
import { dayPlanResolver } from "./resolvers/dayPlan.js";
import { transportResolver } from "./resolvers/transport.js";
import { moneyResolver } from "./resolvers/money.js";
import { bookingWindowsResolver } from "./resolvers/bookingWindows.js";
import { peopleResolver } from "./resolvers/people.js";
import { basicsResolver } from "./resolvers/basics.js";
import { packingResolver } from "./resolvers/packing.js";
import { entryRequirementsResolver } from "./resolvers/entryRequirements.js";

/** @typedef {import('./types.js').Resolver} Resolver */

/** @type {Resolver[]} */
export const RESOLVER_LIST = [
  stayResolver,
  travelResolver,
  dayPlanResolver,
  transportResolver,
  moneyResolver,
  bookingWindowsResolver,
  peopleResolver,
  basicsResolver,
  packingResolver,
  entryRequirementsResolver,
];

/** @type {Map<string, Resolver>} */
const BY_CODE = new Map();

for (const resolver of RESOLVER_LIST) {
  for (const code of resolver.codes) {
    BY_CODE.set(code, resolver);
  }
}

/**
 * @param {string} code
 * @returns {Resolver|undefined}
 */
export function resolverForCode(code) {
  return BY_CODE.get(code);
}

/**
 * Full code → resolver name mapping for diagnostics.
 * @returns {Record<string, string>}
 */
export function codeResolverMap() {
  /** @type {Record<string, string>} */
  const map = {};
  for (const resolver of RESOLVER_LIST) {
    const name = resolver.codes[0];
    for (const code of resolver.codes) {
      map[code] = name;
    }
  }
  return map;
}

export { RESOLVER_LIST as RESOLVERS };
