import { checkBasics } from "./checks/basics.js";
import { checkTravel } from "./checks/travel.js";
import { checkStay } from "./checks/stay.js";
import { checkDayPlan } from "./checks/dayPlan.js";
import { checkTransport } from "./checks/transport.js";
import { checkMoney } from "./checks/money.js";
import { checkPeople } from "./checks/people.js";
import { checkPacking } from "./checks/packing.js";
import { checkBookingWindows } from "./checks/bookingWindows.js";
import { checkEntryRequirements } from "./checks/entryRequirements.js";

/** @typedef {import('./context.js').IntegrityContext} IntegrityContext */
/** @typedef {import('./types.js').Finding} Finding */

/** @type {Array<(ctx: IntegrityContext) => Finding[]>} */
export const CHECK_REGISTRY = [
  checkBasics,
  checkTravel,
  checkStay,
  checkDayPlan,
  checkTransport,
  checkMoney,
  checkPeople,
  checkPacking,
  checkBookingWindows,
  checkEntryRequirements,
];
