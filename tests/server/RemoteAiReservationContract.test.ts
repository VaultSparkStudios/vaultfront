import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/server/Worker.ts"),
  "utf8",
);

const contracts = [
  {
    route: "/api/vaultfront/battle-narrative",
    order: [
      "resolveVaultFrontIdentity",
      "safeParse(req.body)",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
  {
    route: "/api/vaultfront/match-prophecy",
    order: [
      "cachedProphecy",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
  {
    route: "/api/vaultfront/match-oracle",
    order: [
      "playerIds.length < 2",
      "aiCacheGet",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
  {
    route: "/api/vaultfront/match-coach",
    order: [
      "resolveVaultFrontIdentity",
      "reserveRemoteAiCall",
      "anthropic.messages.stream",
    ],
  },
  {
    route: "/api/vaultfront/dynasty-story",
    order: [
      "resolveVaultFrontIdentity",
      "safeParse(req.body)",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
  {
    route: "/api/vaultfront/bot-persona",
    order: [
      "personaCache.get",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
  {
    route: "/api/vaultfront/prematch-brief",
    order: [
      "requireVaultFrontActor",
      "aiCacheGet",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
  {
    route: "/api/vaultfront/match-recap/:gameId",
    order: [
      "matchRecapCache.get",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
  {
    route: "/api/vaultfront/coach-debrief",
    order: [
      "requireVaultFrontActor",
      "coachDebriefCache.get",
      "reserveRemoteAiCall",
      "anthropic.messages.create",
    ],
  },
] as const;

describe("remote AI reservation ordering contract", () => {
  it.each(contracts)(
    "reserves only after validation/auth/cache for $route",
    ({ route, order }) => {
      const start = source.indexOf(`"${route}"`);
      expect(start, `${route} must exist`).toBeGreaterThan(-1);
      const segment = source.slice(start, start + 9_000);
      let prior = -1;
      for (const marker of order) {
        const position = segment.indexOf(marker);
        expect(position, `${route}: missing ${marker}`).toBeGreaterThan(prior);
        prior = position;
      }
    },
  );
});
