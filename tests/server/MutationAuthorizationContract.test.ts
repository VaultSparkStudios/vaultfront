import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
  resolve(process.cwd(), "src/server/Worker.ts"),
  "utf8",
);

const protectedRoutes = [
  "/api/start_game/:id",
  "/api/vaultfront/match-rating",
  "/api/vaultfront/style-history",
  "/api/vaultfront/win-fortune",
  "/api/vaultfront/prediction-league/predict",
  "/api/vaultfront/clan-war/challenge",
  "/api/vaultfront/clan-war/accept",
  "/api/vaultfront/clan-war/decline",
  "/api/vaultfront/season-progress/claim",
  "/api/clans",
  "/api/clans/:clanId/join",
  "/api/clans/leave",
  "/api/tutorial/complete",
  "/api/tutorial/reset",
  "/api/tournaments",
  "/api/tournaments/:id/register",
  "/api/tournaments/:id/seed",
  "/api/tournaments/matches/:matchId/report",
] as const;

describe("server-authoritative mutation boundary", () => {
  it.each(protectedRoutes)("requires a verified actor for %s", (route) => {
    const marker = `"${route}"`;
    const start = workerSource.indexOf(marker);
    expect(start, `${route} must be registered`).toBeGreaterThan(-1);
    const nextRoute = workerSource.indexOf("app.", start + marker.length);
    const end = nextRoute === -1 ? start + 2_500 : nextRoute;
    expect(workerSource.slice(start, end)).toContain("requireVaultFrontActor");
  });
});
