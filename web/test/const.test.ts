import { describe, expect, it } from "vitest";
import { EMA_ACTIVITIES, getEmaActivity } from "../src/const";

describe("const.ts EMA activities", () => {
  it("provides definitions for all 11 activities", () => {
    const expectedKeys = [
      "work_coding",
      "learning_reading",
      "communication_social",
      "entertainment",
      "social_media_browsing",
      "exercise_walking",
      "eating",
      "resting",
      "household_errands",
      "traveling",
      "other",
    ];

    for (const key of expectedKeys) {
      expect(EMA_ACTIVITIES[key]).toBeDefined();
      expect(EMA_ACTIVITIES[key].code).toBe(key);
      expect(EMA_ACTIVITIES[key].label).toBeTruthy();
      expect(EMA_ACTIVITIES[key].icon).toBeDefined();
    }
  });

  it("resolves known activity codes via getEmaActivity", () => {
    const activity = getEmaActivity("work_coding");
    expect(activity.code).toBe("work_coding");
    expect(activity.label).toBe("Work / coding");
  });

  it("handles unknown activity codes with fallback formatting", () => {
    const activity = getEmaActivity("custom_activity_name");
    expect(activity.code).toBe("custom_activity_name");
    expect(activity.label).toBe("custom activity name");
    expect(activity.icon).toBeDefined();
  });

  it("treats inherited object keys as unknown activity codes", () => {
    for (const code of ["constructor", "toString", "__proto__"]) {
      const activity = getEmaActivity(code);
      expect(activity.code).toBe(code);
      expect(activity.label).toBe(code.replaceAll("_", " "));
      expect(activity.icon).toBeDefined();
    }
  });

  it("handles null, undefined, or empty activity with default other fallback", () => {
    const nullActivity = getEmaActivity(null);
    expect(nullActivity.code).toBe("other");
    expect(nullActivity.label).toBe("Other");

    const undefinedActivity = getEmaActivity(undefined);
    expect(undefinedActivity.code).toBe("other");
    expect(undefinedActivity.label).toBe("Other");

    const emptyActivity = getEmaActivity("");
    expect(emptyActivity.code).toBe("other");
    expect(emptyActivity.label).toBe("Other");
  });
});
