import { describe, expect, it } from "vitest";
import {
  FIRST_EXTRACTION_STEPS,
  FIRST_EXTRACTION_TITLE,
  firstExtractionComplete,
} from "../../src/client/FirstExtractionQuest";

describe("First Extraction quest contract", () => {
  it("owns one four-action vocabulary for desktop and mobile surfaces", () => {
    expect(FIRST_EXTRACTION_TITLE).toBe("First Extraction");
    expect(FIRST_EXTRACTION_STEPS.map((step) => step.key)).toEqual([
      "focusSet",
      "vaultCaptured",
      "convoyAction",
      "pulseTriggered",
    ]);
  });

  it("unlocks advanced coaching only after every core action", () => {
    expect(
      firstExtractionComplete({
        focusSet: true,
        vaultCaptured: true,
        convoyAction: true,
        pulseTriggered: false,
      }),
    ).toBe(false);
    expect(
      firstExtractionComplete({
        focusSet: true,
        vaultCaptured: true,
        convoyAction: true,
        pulseTriggered: true,
      }),
    ).toBe(true);
  });
});
