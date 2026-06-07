import { render } from "lit";
import { GameRightSidebar } from "../../../../src/client/graphics/layers/GameRightSidebar";
import { GameUpdateType } from "../../../../src/core/game/GameUpdates";

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

test("beacon pulse enters the short vault feed with a pulse badge", () => {
  const sidebar = new GameRightSidebar() as any;
  const me = {
    smallID: () => 1,
    isFriendly: (player: { smallID: () => number }) => player.smallID() === 2,
  };
  sidebar.game = {
    ticks: () => 160,
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
        activity: "beacon_pulse",
        tile: 12,
        sourcePlayerID: 3,
        targetPlayerID: null,
        label: "Enemy pulse active",
        durationTicks: 120,
      },
    ],
    140,
  );

  const container = document.createElement("div");
  render(sidebar.renderVaultFeed(), container);

  expect(sidebar.recentVaultFeed).toHaveLength(1);
  expect(container.textContent).toContain("Pulse");
  expect(container.textContent).toContain("Enemy pulse active");
});

test("playtest pulse tile surfaces rival conversion and next operator action", () => {
  const sidebar = new GameRightSidebar() as any;
  sidebar.playtestPulse = {
    generatedAt: "2026-06-07T18:00:00.000Z",
    status: "warming",
    score: 28,
    totals: {
      events: 6,
      tutorialShown: 2,
      tutorialAdvanced: 2,
      tutorialCompleted: 1,
      tutorialSkipped: 0,
      matchFeedback: 1,
      tournamentActions: 0,
      retentionSignals: 2,
      retentionChallengeShown: 2,
      retentionGoalSaved: 0,
      retentionRequeued: 1,
      retentionRematchRequested: 0,
    },
    rates: {
      tutorialAdvance: 1,
      tutorialCompletion: 0.5,
      tutorialSkip: 0,
      matchFeedback: 0.1667,
      retentionAction: 0.5,
    },
    freshness: {
      firstEventAt: "2026-06-07T17:55:00.000Z",
      lastEventAt: "2026-06-07T18:00:00.000Z",
      ageMinutes: 3.2,
    },
    recent: [],
    insights: [],
    actionInsights: ["Continue with a focused rivalry/rematch playtest."],
    operatorNext: {
      headline: "Run the focused rivalry/rematch alpha gate.",
      steps: ["Seed a rivalry scenario."],
      successMetric: "Rival Challenge action rate reaches 25%+.",
    },
  };

  const container = document.createElement("div");
  render(sidebar.renderPlaytestPulseTile(), container);
  const text = container.textContent?.replace(/\s+/g, " ") ?? "";

  expect(text).toContain("Rival action50%");
  expect(text).toContain("Latest signal3m");
  expect(text).toContain("Run the focused rivalry/rematch alpha gate.");
});
