import type { Express } from "express";
import type { CertifiedSeasonContractState } from "./CertifiedSeasonContractStore";
import { retiredMutation } from "./RetiredMutation";

export interface SeasonContractAuthSuccess {
  type: "success";
  persistentId: string;
}

export interface SeasonContractPlayerSnapshot {
  eloRating: number;
  matchesPlayed: number;
  updatedAt?: string | Date;
}

export interface SeasonContractRouteDependencies {
  verifyToken: (
    token: string,
  ) => Promise<SeasonContractAuthSuccess | { type: "error"; message?: string }>;
  currentSeasonId: () => string;
  getContracts: (
    persistentId: string,
    seasonId: string,
  ) => Promise<CertifiedSeasonContractState>;
  getPlayerStats: (
    persistentId: string,
  ) => Promise<SeasonContractPlayerSnapshot | null>;
  getEloHistory: (persistentId: string, limit: number) => Promise<number[]>;
  eloLabel: (rating: number) => string;
  reportError?: (error: unknown) => void;
}

export function registerSeasonContractRoutes(
  app: Pick<Express, "get" | "post">,
  dependencies: SeasonContractRouteDependencies,
): void {
  app.get("/api/vaultfront/contracts", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }
    const auth = await dependencies.verifyToken(
      authHeader.substring("Bearer ".length),
    );
    if (auth.type === "error") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const seasonId = dependencies.currentSeasonId();
      const [contracts, playerStats, eloHistory] = await Promise.all([
        dependencies.getContracts(auth.persistentId, seasonId),
        dependencies.getPlayerStats(auth.persistentId),
        dependencies.getEloHistory(auth.persistentId, 10),
      ]);
      const eloRating = playerStats?.eloRating ?? 1200;
      const updatedAt = playerStats?.updatedAt
        ? new Date(playerStats.updatedAt).getTime()
        : null;
      return res.json({
        ...contracts,
        eloRating,
        eloLabel: dependencies.eloLabel(eloRating),
        matchesPlayed: playerStats?.matchesPlayed ?? 0,
        isDecaying:
          updatedAt !== null &&
          Number.isFinite(updatedAt) &&
          Date.now() - updatedAt > 7 * 24 * 60 * 60 * 1000,
        eloHistory,
      });
    } catch (error) {
      dependencies.reportError?.(error);
      return res.status(503).json({ error: "Season contracts unavailable" });
    }
  });

  app.post(
    "/api/vaultfront/contracts/update",
    retiredMutation(
      "Season contracts are derived from certified match results",
    ),
  );
}
