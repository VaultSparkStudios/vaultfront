import { describe, expect, test, vi } from "vitest";
import { AntiCheatMonitor } from "../../src/server/AntiCheatMonitor";
import { DiscordNotifier } from "../../src/server/DiscordNotifier";
import { playerStatsStore } from "../../src/server/PlayerStatsStore";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../src/server/PlayerStatsStore", () => ({
  playerStatsStore: {
    getFlaggedMatches: vi.fn(),
  },
}));

vi.mock("../../src/server/DiscordNotifier", () => ({
  DiscordNotifier: {
    antiCheatAlert: vi.fn(),
  },
}));

describe("AntiCheatMonitor", () => {
  test("suppresses duplicate alerts during the cooldown window", async () => {
    vi.mocked(playerStatsStore.getFlaggedMatches).mockResolvedValue([
      { gameId: "a", persistentId: "player-a", cmdStddevMs: 40 },
      { gameId: "b", persistentId: "player-b", cmdStddevMs: 41 },
      { gameId: "c", persistentId: "player-c", cmdStddevMs: 42 },
    ] as any);
    const monitor = new AntiCheatMonitor();

    await monitor.pollForTest();
    await monitor.pollForTest();

    expect(DiscordNotifier.antiCheatAlert).toHaveBeenCalledTimes(1);
    expect(monitor.debugState().seenGameIds).toBe(3);
  });
});
