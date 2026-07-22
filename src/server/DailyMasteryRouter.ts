import type { DailyMasterySnapshot } from "./CertifiedDailyMasteryStore";

export interface DailyMasteryAuthSuccess {
  type: "success";
  persistentId: string;
}

export interface DailyMasteryRouteDependencies {
  verifyToken: (
    token: string,
  ) => Promise<DailyMasteryAuthSuccess | { type: "error"; message?: string }>;
  getChallenge: (persistentId: string) => Promise<DailyMasterySnapshot>;
  reportError: (error: unknown) => void;
}

interface RouteRequest {
  headers: { authorization?: string };
}

interface RouteResponse {
  status(code: number): RouteResponse;
  json(body: unknown): unknown;
}

interface RouteRegistrar {
  get(
    path: string,
    handler: (
      request: RouteRequest,
      response: RouteResponse,
    ) => Promise<unknown>,
  ): unknown;
}

/** Register the authenticated, fail-closed Daily Mastery read contract. */
export function registerDailyMasteryRoute(
  app: RouteRegistrar,
  dependencies: DailyMasteryRouteDependencies,
): void {
  app.get("/api/vaultfront/daily-challenge", async (request, response) => {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;
    if (!token) {
      return response.status(401).json({ error: "Authentication required" });
    }

    const auth = await dependencies.verifyToken(token);
    if (auth.type === "error") {
      return response.status(401).json({ error: "Invalid authentication" });
    }

    try {
      const snapshot = await dependencies.getChallenge(auth.persistentId);
      return response.json(snapshot);
    } catch (error) {
      dependencies.reportError(error);
      return response.status(503).json({ error: "Daily mastery unavailable" });
    }
  });
}
