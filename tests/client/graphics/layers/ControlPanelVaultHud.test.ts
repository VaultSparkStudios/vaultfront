import { ControlPanel } from "../../../../src/client/graphics/layers/ControlPanel";
import { GameRightSidebar } from "../../../../src/client/graphics/layers/GameRightSidebar";
import { render } from "lit";

describe("ControlPanel vault HUD automation", () => {
  test("jam-on-next-pulse respects jam breaker cooldown", () => {
    const panel = new ControlPanel() as any;
    const me = {
      smallID: () => 1,
      isFriendly: () => false,
    };
    panel.game = {
      ticks: () => 100,
      myPlayer: () => me,
      playerBySmallID: () => ({
        isPlayer: () => true,
        smallID: () => 2,
      }),
    };
    panel.jamOnNextPulseArmed = true;
    panel.jamBreakerCooldownUntilTick = 180;
    panel.latestVaultStatus = {
      beacons: [
        {
          playerID: 2,
          maskedUntilTick: 140,
        },
      ],
    };

    const sendSpy = vi
      .spyOn(panel, "sendJamBreakerCommand")
      .mockImplementation(() => {});
    panel.maybeTriggerAutoJamOnPulse();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("jam-on-next-pulse auto-fires only for active enemy pulse", () => {
    const panel = new ControlPanel() as any;
    const me = {
      smallID: () => 1,
      isFriendly: (player: { smallID: () => number }) => player.smallID() === 1,
    };
    panel.game = {
      ticks: () => 100,
      myPlayer: () => me,
      x: (tile: number) => tile,
      y: (tile: number) => tile,
      width: () => 100,
      height: () => 100,
      ref: (x: number, y: number) => x + y,
      owner: () => ({
        isPlayer: () => false,
      }),
      playerBySmallID: (id: number) => ({
        isPlayer: () => true,
        smallID: () => id,
      }),
    };
    panel.jamOnNextPulseArmed = true;
    panel.jamBreakerCooldownUntilTick = 0;
    panel.latestVaultStatus = {
      beacons: [
        {
          playerID: 2,
          maskedUntilTick: 140,
        },
      ],
    };

    const sendSpy = vi
      .spyOn(panel, "sendJamBreakerCommand")
      .mockImplementation(() => {});
    panel.maybeTriggerAutoJamOnPulse();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith("auto");
  });

  test("jam-on-next-pulse ignores allied pulses", () => {
    const panel = new ControlPanel() as any;
    const me = {
      smallID: () => 1,
      isFriendly: (player: { smallID: () => number }) =>
        player.smallID() === 1 || player.smallID() === 3,
    };
    panel.game = {
      ticks: () => 100,
      myPlayer: () => me,
      x: (tile: number) => tile,
      y: (tile: number) => tile,
      width: () => 100,
      height: () => 100,
      ref: (x: number, y: number) => x + y,
      owner: () => ({
        isPlayer: () => false,
      }),
      playerBySmallID: (id: number) => ({
        isPlayer: () => true,
        smallID: () => id,
      }),
    };
    panel.jamOnNextPulseArmed = true;
    panel.jamBreakerCooldownUntilTick = 0;
    panel.latestVaultStatus = {
      beacons: [
        {
          playerID: 3,
          maskedUntilTick: 140,
        },
      ],
    };

    const sendSpy = vi
      .spyOn(panel, "sendJamBreakerCommand")
      .mockImplementation(() => {});
    panel.maybeTriggerAutoJamOnPulse();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("ally convoy fallback does not expose own reroute preview", () => {
    const panel = new ControlPanel() as any;
    const me = {
      smallID: () => 1,
      isFriendly: (player: { smallID: () => number }) => player.smallID() === 2,
    };
    panel.game = {
      ticks: () => 100,
      myPlayer: () => me,
      x: (tile: number) => tile,
      y: (tile: number) => tile,
      width: () => 100,
      height: () => 100,
      ref: (x: number, y: number) => x + y,
      owner: () => ({
        isPlayer: () => false,
      }),
      playerBySmallID: (id: number) => ({
        isPlayer: () => true,
        smallID: () => id,
      }),
    };
    panel.latestVaultStatus = {
      weeklyMutator: "none",
      captureTicksRequired: 90,
      cooldownTicksTotal: 650,
      sites: [],
      convoys: [
        {
          id: 7,
          ownerID: 2,
          sourceTile: 4,
          destinationTile: 14,
          ticksRemaining: 80,
          totalTicks: 100,
          escortShield: 0,
          goldReward: 180000,
          troopsReward: 1400,
          rewardMultiplier: 1,
          rewardScale: 1,
          strengthMultiplier: 1,
          phaseMultiplier: 1,
          riskMultiplier: 1,
          routeRisk: 0.2,
          routeDistance: 12,
          rewardMath: "test math",
          reroutePreviews: [],
        },
      ],
      beacons: [],
    };
    vi.spyOn(panel, "buildVaultNotices").mockReturnValue([]);
    vi.spyOn(panel, "shouldTrimUnderusedCommands").mockReturnValue(false);
    vi.spyOn(panel, "renderRewardExplainPanel").mockReturnValue("");
    vi.spyOn(panel, "currentCommandHint").mockReturnValue("");
    vi.spyOn(panel, "adaptiveNudgeText").mockReturnValue(null);
    vi.spyOn(panel, "nextVaultObjectiveText").mockReturnValue("Next vault opens in 20s");

    const container = document.createElement("div");
    render(panel.renderVaultHud(), container);

    expect(container.textContent).toContain("Ally Convoy 8s");
    expect(container.textContent).toContain(
      "Tracking allied convoy. Shield/reroute commands apply only to your convoy.",
    );
    expect(container.textContent).not.toContain("Pre-Action Reroute Preview");
  });

  test("personal convoy is shown immediately when present", () => {
    const panel = new ControlPanel() as any;
    const me = {
      smallID: () => 1,
      isFriendly: (player: { smallID: () => number }) => player.smallID() === 2,
    };
    panel.game = {
      ticks: () => 100,
      myPlayer: () => me,
      x: (tile: number) => tile,
      y: (tile: number) => tile,
      width: () => 100,
      height: () => 100,
      ref: (x: number, y: number) => x + y,
      owner: () => ({
        isPlayer: () => false,
      }),
      playerBySmallID: (id: number) => ({
        isPlayer: () => true,
        smallID: () => id,
      }),
    };
    panel.latestVaultStatus = {
      weeklyMutator: "none",
      captureTicksRequired: 90,
      cooldownTicksTotal: 650,
      sites: [],
      convoys: [
        {
          id: 3,
          ownerID: 1,
          sourceTile: 4,
          destinationTile: 14,
          ticksRemaining: 80,
          totalTicks: 100,
          escortShield: 1,
          goldReward: 210000,
          troopsReward: 1500,
          rewardMultiplier: 1.12,
          rewardScale: 1,
          strengthMultiplier: 1.04,
          phaseMultiplier: 1,
          riskMultiplier: 1.08,
          routeRisk: 0.24,
          routeDistance: 12,
          rewardMath: "test math",
          reroutePreviews: [],
        },
      ],
      beacons: [],
    };
    vi.spyOn(panel, "buildVaultNotices").mockReturnValue([]);
    vi.spyOn(panel, "shouldTrimUnderusedCommands").mockReturnValue(false);
    vi.spyOn(panel, "renderRewardExplainPanel").mockReturnValue("");
    vi.spyOn(panel, "currentCommandHint").mockReturnValue("");
    vi.spyOn(panel, "adaptiveNudgeText").mockReturnValue(null);
    vi.spyOn(panel, "nextVaultObjectiveText").mockReturnValue("Next vault opens in 20s");

    const container = document.createElement("div");
    render(panel.renderVaultHud(), container);

    expect(container.textContent).toContain("Vault Convoy 8s");
    expect(container.textContent).toContain("+210,000g +1,500t");
    expect(container.textContent).not.toContain("Ally Convoy 8s");
  });

  test("floating vault HUD and feed anchors do not conflict on desktop", () => {
    const panel = new ControlPanel() as any;
    panel.viewportWidth = () => 1440;
    const sidebar = new GameRightSidebar() as any;
    sidebar.viewportWidth = () => 1440;
    sidebar.spawnBarVisible = false;
    sidebar.immunityBarVisible = false;

    expect(sidebar.vaultFeedRightPx()).toBeGreaterThan(
      panel.floatingVaultHudWidthPx() + panel.floatingVaultHudRightPx(),
    );
    expect(sidebar.vaultFeedTopPx()).toBeGreaterThanOrEqual(
      panel.floatingVaultHudTopPx(),
    );
  });

  test("vault debug query flag enables persistent debug mode", () => {
    const originalPath = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, "", "/?vaultDebug=1");
    localStorage.removeItem("vaultfront.debug");
    sessionStorage.removeItem("vaultfront.debug");

    const panel = new ControlPanel() as any;
    panel.initializeVaultDebugState();

    expect(panel.vaultDebugActive).toBe(true);
    expect(localStorage.getItem("vaultfront.debug")).toBe("1");
    expect(sessionStorage.getItem("vaultfront.debug")).toBe("1");

    window.history.replaceState({}, "", originalPath);
  });

  test("vault debug panel renders live QA checklist", () => {
    const panel = new ControlPanel() as any;
    panel.vaultDebugActive = true;
    panel.vaultQaProgress = {
      vaultCaptured: true,
      passiveIncomeEvents: 1,
      convoyDelivered: 0,
      convoyIntercepted: 2,
    };

    const container = document.createElement("div");
    render(panel.renderVaultDebugPanel(), container);

    expect(container.textContent).toContain("Vault QA");
    expect(container.textContent).toContain("OK Capture a vault");
    expect(container.textContent).toContain("TODO Passive gold twice");
    expect(container.textContent).toContain("1/2");
    expect(container.textContent).toContain("2");
  });

  test("vault debug waiting card renders before status arrives", () => {
    const panel = new ControlPanel() as any;
    panel._isVisible = true;
    panel.vaultDebugActive = true;
    panel.latestVaultStatus = null;

    const container = document.createElement("div");
    render(panel.renderFloatingVaultHud(), container);

    expect(container.textContent).toContain("VaultFront Debug");
    expect(container.textContent).toContain("Waiting for VaultFront status");
  });

  test("vault debug toggle event updates panel state", () => {
    const panel = new ControlPanel() as any;
    panel.vaultDebugActive = false;

    panel.onVaultDebugToggle(
      new CustomEvent("vaultfront-debug-toggle", {
        detail: { enabled: true },
      }),
    );

    expect(panel.vaultDebugActive).toBe(true);
  });
});
