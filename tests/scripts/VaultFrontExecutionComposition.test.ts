import { describe, expect, test } from "vitest";
import { inspectVaultFrontExecutionComposition } from "../../scripts/check-vaultfront-execution-composition.mjs";

describe("VaultFront execution composition", () => {
  test("keeps pressure transitions in the bounded domain kernel", () => {
    expect(inspectVaultFrontExecutionComposition()).toMatchObject({
      ok: true,
      errors: [],
    });
  });
});
