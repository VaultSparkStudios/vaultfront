import { describe, expect, it, vi } from "vitest";
import {
  assertVaultMetricAttributes,
  VAULT_METRIC_ATTRIBUTE_KEYS,
} from "../../src/server/VaultMetrics";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("VaultMetrics attribute cardinality", () => {
  it("exposes only bounded-cardinality dimensions", () => {
    expect(VAULT_METRIC_ATTRIBUTE_KEYS).toEqual([
      "duration_bucket",
      "gold_tier",
      "player_count_bucket",
    ]);
    expect(VAULT_METRIC_ATTRIBUTE_KEYS).not.toContain("game.id");
    expect(VAULT_METRIC_ATTRIBUTE_KEYS).not.toContain("map_name");
    expect(VAULT_METRIC_ATTRIBUTE_KEYS).not.toContain("achievement_id");
  });

  it("rejects attributes outside the allowlist at the counter boundary", () => {
    expect(() =>
      assertVaultMetricAttributes({
        duration_bucket: "5-15m",
        gold_tier: "mid",
        player_count_bucket: "11-30",
      }),
    ).not.toThrow();
    expect(() =>
      assertVaultMetricAttributes({ "game.id": "unbounded" }),
    ).toThrow("Disallowed VaultMetrics attribute: game.id");
    expect(() =>
      assertVaultMetricAttributes({ map_name: "unbounded" }),
    ).toThrow("Disallowed VaultMetrics attribute: map_name");
    expect(() =>
      assertVaultMetricAttributes({ achievement_id: "unbounded" }),
    ).toThrow("Disallowed VaultMetrics attribute: achievement_id");
  });
});
