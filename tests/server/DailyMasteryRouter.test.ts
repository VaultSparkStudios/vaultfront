import { describe, expect, test, vi } from "vitest";
import { registerDailyMasteryRoute } from "../../src/server/DailyMasteryRouter";

function harness(overrides: Record<string, unknown> = {}) {
  let handler: (request: any, response: any) => Promise<unknown> = async () =>
    undefined;
  const dependencies = {
    verifyToken: vi.fn().mockResolvedValue({
      type: "success",
      persistentId: "player-1",
    }),
    getChallenge: vi.fn().mockResolvedValue({
      challengeId: "victory-1",
      description: "Win a certified match",
      progress: 0,
      target: 1,
      rewardMastery: 75,
      completed: false,
      masteryBalance: 0,
      dateUtc: "2026-07-22",
      evidence: "certified-match-result",
      durability: "postgres",
    }),
    reportError: vi.fn(),
    ...overrides,
  };
  registerDailyMasteryRoute(
    {
      get: (_path, routeHandler) => {
        handler = routeHandler;
      },
    },
    dependencies as any,
  );
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return body;
    },
  };
  return { handler, dependencies, response };
}

describe("Daily Mastery router", () => {
  test("rejects missing and invalid bearer credentials", async () => {
    const missing = harness();
    await missing.handler({ headers: {} }, missing.response);
    expect(missing.response).toMatchObject({
      statusCode: 401,
      body: { error: "Authentication required" },
    });
    expect(missing.dependencies.verifyToken).not.toHaveBeenCalled();

    const invalid = harness({
      verifyToken: vi.fn().mockResolvedValue({ type: "error" }),
    });
    await invalid.handler(
      { headers: { authorization: "Bearer invalid" } },
      invalid.response,
    );
    expect(invalid.response).toMatchObject({
      statusCode: 401,
      body: { error: "Invalid authentication" },
    });
  });

  test("returns only the authenticated player's certified snapshot", async () => {
    const route = harness();
    await route.handler(
      { headers: { authorization: "Bearer signed-token" } },
      route.response,
    );
    expect(route.dependencies.verifyToken).toHaveBeenCalledWith("signed-token");
    expect(route.dependencies.getChallenge).toHaveBeenCalledWith("player-1");
    expect(route.response.statusCode).toBe(200);
    expect(route.response.body).toMatchObject({
      evidence: "certified-match-result",
      durability: "postgres",
    });
  });

  test("fails closed and reports persistence failures", async () => {
    const failure = new Error("database unavailable");
    const route = harness({
      getChallenge: vi.fn().mockRejectedValue(failure),
    });
    await route.handler(
      { headers: { authorization: "Bearer signed-token" } },
      route.response,
    );
    expect(route.dependencies.reportError).toHaveBeenCalledWith(failure);
    expect(route.response).toMatchObject({
      statusCode: 503,
      body: { error: "Daily mastery unavailable" },
    });
  });
});
