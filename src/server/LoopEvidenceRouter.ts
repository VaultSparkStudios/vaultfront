import type { Express, Request } from "express";
import type { CertifiedLoopEvidenceSummary } from "./CertifiedLoopEvidenceStore";
import { retiredMutation } from "./RetiredMutation";

export interface LoopEvidenceRouteDependencies {
  isAdmin: (headers: Request["headers"]) => boolean;
  getSummary: (limit: number) => Promise<CertifiedLoopEvidenceSummary>;
  reportError?: (error: unknown) => void;
}

export function registerLoopEvidenceRoutes(
  app: Pick<Express, "get" | "post">,
  dependencies: LoopEvidenceRouteDependencies,
): void {
  app.post(
    "/api/vaultfront/funnel",
    retiredMutation("Loop evidence is derived from certified match results"),
  );

  app.get("/api/vaultfront/funnel/summary", async (req, res) => {
    if (!dependencies.isAdmin(req.headers)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const limit = Math.min(
      10_000,
      Math.max(1, Number(req.query["limit"] ?? 1_000) || 1_000),
    );
    try {
      return res.json(await dependencies.getSummary(limit));
    } catch (error) {
      dependencies.reportError?.(error);
      return res.status(503).json({ error: "Loop evidence unavailable" });
    }
  });
}
