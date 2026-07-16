import { beforeEach, describe, expect, test } from "vitest";
import {
  canAttemptRemoteAi,
  remoteAiPosture,
  remoteAiUsageByFeature,
  reserveRemoteAiCall,
  resetRemoteAiPolicyForTests,
} from "../../src/server/RemoteAiPolicy";

const readyEnv = {
  ANTHROPIC_API_KEY: "test-key",
  VAULTFRONT_REMOTE_AI_ENABLED: "true",
  VAULTFRONT_REMOTE_AI_MAX_CALLS_PER_HOUR: "2",
} as NodeJS.ProcessEnv;

describe("RemoteAiPolicy", () => {
  beforeEach(() => resetRemoteAiPolicyForTests(1_000));

  test("defaults to a cost-neutral disabled posture even with a key", () => {
    const posture = remoteAiPosture(
      { ANTHROPIC_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      1_000,
    );

    expect(posture.costProfile).toBe("cost-neutral");
    expect(posture.reason).toBe("disabled");
    expect(canAttemptRemoteAi({ ANTHROPIC_API_KEY: "test-key" })).toBe(false);
  });

  test("requires a positive hard cap", () => {
    const posture = remoteAiPosture(
      {
        ANTHROPIC_API_KEY: "test-key",
        VAULTFRONT_REMOTE_AI_ENABLED: "true",
      } as NodeJS.ProcessEnv,
      1_000,
    );

    expect(posture.reason).toBe("zero-cap");
    expect(posture.costProfile).toBe("cost-neutral");
  });

  test("atomically exhausts the cap and attributes usage", () => {
    expect(reserveRemoteAiCall("coach", readyEnv, 1_000).allowed).toBe(true);
    expect(reserveRemoteAiCall("narrator", readyEnv, 1_001).allowed).toBe(true);
    const denied = reserveRemoteAiCall("coach", readyEnv, 1_002);

    expect(denied.allowed).toBe(false);
    expect(denied.posture.reason).toBe("cap-exhausted");
    expect(remoteAiUsageByFeature()).toEqual({ coach: 1, narrator: 1 });
  });

  test("starts a fresh window after one hour", () => {
    expect(reserveRemoteAiCall("other", readyEnv, 1_000).allowed).toBe(true);
    expect(
      reserveRemoteAiCall("other", readyEnv, 1_000 + 60 * 60 * 1000).allowed,
    ).toBe(true);
    expect(remoteAiUsageByFeature()).toEqual({ other: 1 });
  });
});
