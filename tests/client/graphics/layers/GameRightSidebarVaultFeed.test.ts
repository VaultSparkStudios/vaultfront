import { render } from "lit";
import { GameUpdateType } from "../../../../src/core/game/GameUpdates";
import { GameRightSidebar } from "../../../../src/client/graphics/layers/GameRightSidebar";

describe("GameRightSidebar Vault feed", () => {
  test("passive income updates merge and render as a single readable feed item", () => {
    const sidebar = new GameRightSidebar() as any;
    const me = {
      smallID: () => 1,
      isFriendly: (player: { smallID: () => number }) => player.smallID() === 2,
    };
    sidebar.game = {
      myPlayer: () => me,
      playerBySmallID: (id: number) => ({
        isPlayer: () => true,
        smallID: () => id,
      }),
      config: () => ({
        numSpawnPhaseTurns: () => 0,
      }),
    };

    sidebar.appendVaultFeed(
      [
        {
          type: GameUpdateType.VaultFrontActivity,
          activity: "vault_passive_income",
          tile: 10,
          sourcePlayerID: 1,
          targetPlayerID: null,
          label: "Vault 1 passive +90,000g",
          durationTicks: 120,
        },
        {
          type: GameUpdateType.VaultFrontActivity,
          activity: "vault_passive_income",
          tile: 11,
          sourcePlayerID: 1,
          targetPlayerID: null,
          label: "Vault 2 passive +90,000g",
          durationTicks: 120,
        },
      ],
      120,
    );

    expect(sidebar.recentVaultFeed).toHaveLength(1);
    expect(sidebar.recentVaultFeed[0].label).toBe("Passive income +90,000g x2");

    const container = document.createElement("div");
    render(sidebar.renderVaultFeed(), container);
    expect(container.textContent).toContain("Passive income +90,000g x2");
  });

  test("feed keeps self events ahead of global noise and prunes expired entries", () => {
    const sidebar = new GameRightSidebar() as any;
    const me = {
      smallID: () => 1,
      isFriendly: (player: { smallID: () => number }) => player.smallID() === 2,
    };
    sidebar.game = {
      myPlayer: () => me,
      playerBySmallID: (id: number) => ({
        isPlayer: () => true,
        smallID: () => id,
      }),
      config: () => ({
        numSpawnPhaseTurns: () => 0,
      }),
    };

    sidebar.appendVaultFeed(
      [
        {
          type: GameUpdateType.VaultFrontActivity,
          activity: "vault_captured",
          tile: 4,
          sourcePlayerID: 8,
          targetPlayerID: null,
          label: "Global vault capture",
          durationTicks: 120,
        },
        {
          type: GameUpdateType.VaultFrontActivity,
          activity: "convoy_delivered",
          tile: 6,
          sourcePlayerID: 1,
          targetPlayerID: null,
          label: "Your convoy delivered",
          durationTicks: 120,
        },
      ],
      100,
    );
    const personal = sidebar.recentVaultFeed.find(
      (entry: any) => entry.label === "Your convoy delivered",
    );
    const global = sidebar.recentVaultFeed.find(
      (entry: any) => entry.label === "Global vault capture",
    );
    expect(personal?.priority).toBeGreaterThan(global?.priority ?? 0);

    sidebar.appendVaultFeed(
      [
        {
          type: GameUpdateType.VaultFrontActivity,
          activity: "jam_breaker",
          tile: 8,
          sourcePlayerID: 9,
          targetPlayerID: null,
          label: "Global jam breaker",
          durationTicks: 120,
        },
      ],
      380,
    );

    expect(sidebar.recentVaultFeed).toHaveLength(1);
    expect(sidebar.recentVaultFeed[0].label).toBe("Global jam breaker");
  });
});
