import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIntentPatchFromOnboarding } from "./intentFromOnboarding.js";
import { normalizeTripIntent } from "../trip.service.js";

describe("buildIntentPatchFromOnboarding", () => {
  it("returns undefined for empty input", () => {
    assert.equal(buildIntentPatchFromOnboarding(null), undefined);
    assert.equal(buildIntentPatchFromOnboarding({}), undefined);
  });

  it("maps onboarding questionnaire answers to intent fields", () => {
    const patch = buildIntentPatchFromOnboarding({
      travel_pace: "fullDayOfPlans",
      companions: ["justMe", "friendsFamily", "justMe"],
      who_pays: "splitTheBill",
      look_up_on_trip: "morePlaces",
    });

    assert.deepEqual(patch, {
      source: "onboarding",
      pace: "fullDayOfPlans",
      companions: ["justMe", "friendsFamily"],
      budgetLevel: "moderate",
      priorities: ["Find more places to visit"],
    });
  });

  it("normalizes through normalizeTripIntent with onboarding source", () => {
    const patch = buildIntentPatchFromOnboarding({
      travel_pace: "relax",
      companions: ["spousePartner"],
      who_pays: "payBackPerson",
    });
    const intent = normalizeTripIntent(patch, {
      source: "onboarding",
      now: "2026-08-30T10:00:00.000Z",
    });

    assert.equal(intent?.pace, "relax");
    assert.deepEqual(intent?.companions, ["spousePartner"]);
    assert.equal(intent?.budgetLevel, "budget");
    assert.equal(intent?.source, "onboarding");
    assert.equal(intent?.updatedAt, "2026-08-30T10:00:00.000Z");
  });

  it("drops unknown pace and companion values", () => {
    const patch = buildIntentPatchFromOnboarding({
      travel_pace: "turbo",
      companions: ["justMe", "invalidCompanion"],
    });
    const intent = normalizeTripIntent(patch, { source: "onboarding" });
    assert.equal(intent?.pace, undefined);
    assert.deepEqual(intent?.companions, ["justMe"]);
  });
});
