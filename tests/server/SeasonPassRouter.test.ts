import { describe, expect, test, vi } from "vitest";
import { registerSeasonPassRoutes } from "../../src/server/SeasonPassRouter";

function response() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

function harness(actorId = "player-1") {
  const routes = new Map<string, any>();
  const app = {
    get: (path: string, ...handlers: any[]) =>
      routes.set(`GET ${path}`, handlers.at(-1)),
    post: (path: string, ...handlers: any[]) =>
      routes.set(`POST ${path}`, handlers.at(-1)),
  };
  const getState = vi.fn().mockResolvedValue({
    seasonId: "week-29",
    milestones: [],
    entitlements: [],
    evidence: "certified-match-result",
    durability: "postgres",
  });
  const claim = vi.fn().mockResolvedValue({
    claimed: true,
    reason: "claimed",
    entitlement: { milestoneId: "m1" },
    durability: "postgres",
  });
  registerSeasonPassRoutes(app, {
    authenticate: async () => ({ persistentId: actorId }),
    rateLimit: (_req: any, _res: any, next: () => void) => next(),
    currentSeasonId: () => "week-29",
    getState,
    claim,
    reportError: vi.fn(),
  });
  return { routes, getState, claim };
}

describe("registerSeasonPassRoutes", () => {
  test("binds reads to the authenticated actor", async () => {
    const { routes, getState } = harness();
    const handler = routes.get(
      "GET /api/vaultfront/season-progress/:persistentId",
    );
    const own = response();
    await handler({ params: { persistentId: "player-1" } }, own);
    expect(own.statusCode).toBe(200);
    expect(getState).toHaveBeenCalledWith("player-1", "week-29");

    const forged = response();
    await handler({ params: { persistentId: "player-2" } }, forged);
    expect(forged.statusCode).toBe(403);
    expect(getState).toHaveBeenCalledTimes(1);
  });

  test("claims only for the actor and returns the entitlement receipt", async () => {
    const { routes, claim } = harness();
    const handler = routes.get("POST /api/vaultfront/season-progress/claim");
    const res = response();
    await handler(
      { body: { persistentId: "player-1", milestoneId: "m1" } },
      res,
    );
    expect(claim).toHaveBeenCalledWith("player-1", "week-29", "m1");
    expect(res.body).toMatchObject({ claimed: true, durability: "postgres" });

    const forged = response();
    await handler(
      { body: { persistentId: "player-2", milestoneId: "m1" } },
      forged,
    );
    expect(forged.statusCode).toBe(403);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  test("rejects malformed milestone IDs before store mutation", async () => {
    const { routes, claim } = harness();
    const res = response();
    await routes.get("POST /api/vaultfront/season-progress/claim")(
      { body: { milestoneId: "m999" } },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });
});
