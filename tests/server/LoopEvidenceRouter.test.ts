import { describe, expect, test, vi } from "vitest";
import { registerLoopEvidenceRoutes } from "../../src/server/LoopEvidenceRouter";

function harness() {
  const routes = new Map<string, (req: any, res: any) => unknown>();
  const app = {
    get: vi.fn((path: string, handler: (req: any, res: any) => unknown) =>
      routes.set(`GET ${path}`, handler),
    ),
    post: vi.fn((path: string, handler: (req: any, res: any) => unknown) =>
      routes.set(`POST ${path}`, handler),
    ),
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

describe("LoopEvidenceRouter", () => {
  test("exposes certified aggregates only to admins with a bounded limit", async () => {
    const { app, routes, response } = harness();
    const getSummary = vi.fn(async () => ({
      evidence: "certified-match-result",
    }));
    registerLoopEvidenceRoutes(app as any, {
      isAdmin: () => true,
      getSummary: getSummary as any,
    });
    const res = response();
    await routes.get("GET /api/vaultfront/funnel/summary")!(
      { headers: {}, query: { limit: "999999" } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(getSummary).toHaveBeenCalledWith(10_000);
    expect(res.body.evidence).toBe("certified-match-result");
  });

  test("rejects anonymous reads and permanently retires browser telemetry", async () => {
    const { app, routes, response } = harness();
    registerLoopEvidenceRoutes(app as any, {
      isAdmin: () => false,
      getSummary: vi.fn(),
    });
    const anonymous = response();
    await routes.get("GET /api/vaultfront/funnel/summary")!(
      { headers: {}, query: {} },
      anonymous,
    );
    expect(anonymous.statusCode).toBe(401);
    const mutation = response();
    await routes.get("POST /api/vaultfront/funnel")!({}, mutation);
    expect(mutation.statusCode).toBe(410);
    expect(mutation.body.error).toContain("certified match");
  });

  test("fails honestly when the evidence source is unavailable", async () => {
    const { app, routes, response } = harness();
    const reportError = vi.fn();
    registerLoopEvidenceRoutes(app as any, {
      isAdmin: () => true,
      getSummary: vi.fn().mockRejectedValue(new Error("database down")),
      reportError,
    });
    const res = response();
    await routes.get("GET /api/vaultfront/funnel/summary")!(
      { headers: {}, query: {} },
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
