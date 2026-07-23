import { describe, expect, test, vi } from "vitest";
import {
  registerPlaytestEvidenceRoutes,
  type PlaytestEvidenceRouteDependencies,
} from "../../src/server/PlaytestEvidenceRouter";
import { PlaytestEvidenceConflictError } from "../../src/server/PlaytestEvidenceStore";

vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

describe("PlaytestEvidenceRouter", () => {
  test("requires auth, validates input, and maps actor conflicts", async () => {
    type RouteHandler = (
      req: ReturnType<typeof makeRequest>,
      res: ReturnType<typeof makeResponse>,
    ) => Promise<{ status: number; body: unknown }>;
    const routes = new Map<string, RouteHandler>();
    const app = {
      post: (path: string, _middleware: unknown, handler: RouteHandler) =>
        routes.set(`POST ${path}`, handler),
      get: (path: string, handler: RouteHandler) =>
        routes.set(`GET ${path}`, handler),
    };
    const dependencies = {
      rateLimit: () => undefined,
      resolveActor: vi.fn().mockResolvedValue(null),
      record: vi.fn(),
      summary: vi.fn(),
      reportError: vi.fn(),
    } as unknown as PlaytestEvidenceRouteDependencies;
    registerPlaytestEvidenceRoutes(
      app as unknown as Parameters<typeof registerPlaytestEvidenceRoutes>[0],
      dependencies,
    );
    const handler = routes.get("POST /api/vaultfront/playtest-pulse")!;

    expect((await handler(makeRequest({}), makeResponse())).status).toBe(401);
    dependencies.resolveActor = vi
      .fn()
      .mockResolvedValue({ actorKey: "actor-alpha-1" });
    expect(
      (await handler(makeRequest({ event: "shown" }), makeResponse())).status,
    ).toBe(400);
    dependencies.record = vi
      .fn()
      .mockRejectedValue(new PlaytestEvidenceConflictError("actor conflict"));
    expect(
      (
        await handler(
          makeRequest({
            surface: "tutorial",
            event: "shown",
            value: 1,
            evidenceSessionId: "session-alpha-0001",
            eventId: "event-alpha-000001",
            source: "human",
          }),
          makeResponse(),
        )
      ).status,
    ).toBe(409);
  });
});

function makeRequest(body: unknown) {
  return { body, headers: {} };
}

function makeResponse() {
  return {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      return { status: this.statusCode, body };
    },
  };
}
