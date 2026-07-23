import { describe, expect, test } from "vitest";
import {
  EXTRACTED_DOMAINS,
  inspectWorkerComposition,
} from "../../scripts/check-worker-composition.mjs";

describe("Worker composition budget", () => {
  test("keeps extracted domains out of the bounded composition root", () => {
    const result = inspectWorkerComposition(process.cwd());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.routers).toHaveLength(EXTRACTED_DOMAINS.length);
    expect(result.worker.lines).toBeLessThanOrEqual(result.worker.budget);
  });
});
