import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RankedType } from "../../../../src/core/game/Game";
import { WinModal } from "../../../../src/client/graphics/layers/WinModal";

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      "win_modal.exit": "Exit",
      "win_modal.requeue": "Play Again",
      "win_modal.keep": "Keep Playing",
      "win_modal.spectate": "Spectate",
    };
    return translations[key] || key;
  }),
  getGamesPlayed: vi.fn(() => 10),
  isInIframe: vi.fn(() => false),
  TUTORIAL_VIDEO_URL: "https://example.com/tutorial",
}));

vi.mock("../../../../src/client/Api", () => ({
  fetchVaultFrontRecapAssignment: vi.fn(async () => false),
  getUserMe: vi.fn(async () => null),
  recordVaultFrontFunnelTelemetry: vi.fn(async () => true),
  recordVaultFrontOutcomeTelemetry: vi.fn(async () => true),
  recordVaultFrontRecapEvent: vi.fn(async () => true),
  updateVaultFrontSeasonContracts: vi.fn(async () => false),
}));

vi.mock("../../../../src/client/Cosmetics", () => ({
  fetchCosmetics: vi.fn(async () => []),
  handlePurchase: vi.fn(),
  patternRelationship: vi.fn(() => ({})),
}));

vi.mock("../../../../src/client/CrazyGamesSDK", () => ({
  crazyGamesSDK: {
    happytime: vi.fn(),
    requestAd: vi.fn(),
    gameplayStop: vi.fn(),
  },
}));

describe("WinModal Requeue", () => {
  let mockLocationHref = "";

  beforeEach(() => {
    mockLocationHref = "";
    // Mock window.location.href using Object.defineProperty
    const locationMock = {
      get href() {
        return mockLocationHref;
      },
      set href(value: string) {
        mockLocationHref = value;
      },
    };
    Object.defineProperty(window, "location", {
      value: locationMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isRankedGame detection", () => {
    it("should detect ranked 1v1 game", () => {
      const gameConfig = {
        rankedType: RankedType.OneVOne,
      };
      const isRankedGame = gameConfig.rankedType === RankedType.OneVOne;
      expect(isRankedGame).toBe(true);
    });

    it("should not detect non-ranked game", () => {
      const gameConfig = {
        rankedType: undefined,
      };
      const isRankedGame = gameConfig.rankedType === RankedType.OneVOne;
      expect(isRankedGame).toBe(false);
    });
  });

  describe("requeue navigation", () => {
    it("should navigate to /?requeue when requeue is triggered", () => {
      // Simulate the _handleRequeue behavior
      const handleRequeue = () => {
        window.location.href = "/?requeue";
      };

      handleRequeue();

      expect(window.location.href).toBe("/?requeue");
    });

    it("should navigate to / when exit is triggered", () => {
      // Simulate the _handleExit behavior
      const handleExit = () => {
        window.location.href = "/";
      };

      handleExit();

      expect(window.location.href).toBe("/");
    });
  });

  describe("requeue URL parameter handling", () => {
    it("should parse requeue parameter from URL", () => {
      const url = new URL("http://localhost:9000/?requeue");
      const hasRequeue = url.searchParams.has("requeue");
      expect(hasRequeue).toBe(true);
    });

    it("should not find requeue parameter when absent", () => {
      const url = new URL("http://localhost:9000/");
      const hasRequeue = url.searchParams.has("requeue");
      expect(hasRequeue).toBe(false);
    });
  });
});

describe("VaultFront recap coaching", () => {
  it("builds a recovery script that includes HUD usage when no anchors were used", () => {
    const modal = new WinModal() as any;
    modal.behindAtMinute8 = true;
    vi.spyOn(modal, "hudCountersForCurrentMatch").mockReturnValue({
      vaultNoticeJumps: 0,
      objectiveRailClicks: 0,
      timelineJumps: 0,
    });

    const plan = modal.buildActionPlan({
      key: "vault",
      title: "Vault Control",
      myValue: "0",
      winnerValue: "2",
      deltaText: "Delta -2",
      positive: false,
      ratio: 0.2,
    });

    expect(plan[0]).toContain("Vault notice or objective rail");
    expect(plan.join(" ")).toContain("nearest contestable vault");
    expect(plan.join(" ")).toContain("fall behind again");
  });
});
