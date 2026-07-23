import { describe, expect, test, vi } from "vitest";
import { registerSeasonContractRoutes } from "../../src/server/SeasonContractRouter";

function harness() {
  const routes = new Map<string, (req: any, res: any) => unknown>();
  const app = {
    get: vi.fn((path: string, handler: (req: any, res: any) => unknown) => {
      routes.set(`GET ${path}`, handler);
    }),
    post: vi.fn((path: string, handler: (req: any, res: any) => unknown) => {
      routes.set(`POST ${path}`, handler);
    }),
  };
  const response = () => {
    const res: any = {
      statusCode: 200,
      body: null,
      status: vi.fn((code: number) => {
        res.statusCode = code;
        return res;
      }),
      json: vi.fn((body: unknown) => {
        res.body = body;
        return res;
      }),
    };
    return res;
  };
  return { app, routes, response };
}

describe("SeasonContractRouter", () => {
  test("returns only the verified actor's certified state", async () => {
    const { app, routes, response } = harness();
    registerSeasonContractRoutes(app as any, {
      verifyToken: vi.fn(async () => ({
        type: "success" as const,
        persistentId: "verified-player",
      })),
      currentSeasonId: () => "week-29",
      getContracts: vi.fn(async () => ({
        seasonId: "week-29",
        interceptionTiming: 2,
        objectiveDenial: 3,
        comebackExecution: 1,
        surgeExecution: 4,
        evidence: "certified-match-result" as const,
        durability: "postgres" as const,
      })),
      getPlayerStats: vi.fn(async () => ({
        eloRating: 1234,
        matchesPlayed: 9,
      })),
      getEloHistory: vi.fn(async () => [1200, 1234]),
      eloLabel: () => "Operator",
    });
    const res = response();
    await routes.get("GET /api/vaultfront/contracts")!(
      { headers: { authorization: "Bearer token" } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      seasonId: "week-29",
      objectiveDenial: 3,
      evidence: "certified-match-result",
      durability: "postgres",
      eloRating: 1234,
    });
  });

  test("rejects anonymous reads and permanently retires client mutation", async () => {
    const { app, routes, response } = harness();
    registerSeasonContractRoutes(app as any, {
      verifyToken: vi.fn(async () => ({ type: "error" as const })),
      currentSeasonId: () => "week-29",
      getContracts: vi.fn(),
      getPlayerStats: vi.fn(),
      getEloHistory: vi.fn(),
      eloLabel: () => "",
    });
    const anonymous = response();
    await routes.get("GET /api/vaultfront/contracts")!(
      { headers: {} },
      anonymous,
    );
    expect(anonymous.statusCode).toBe(401);

    const mutation = response();
    await routes.get("POST /api/vaultfront/contracts/update")!(
      { headers: {} },
      mutation,
    );
    expect(mutation.statusCode).toBe(410);
    expect(mutation.body.error).toContain("certified match");
  });
});
