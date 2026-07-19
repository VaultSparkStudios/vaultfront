import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Api", () => ({
  claimSeasonMilestone: vi.fn(),
  fetchAchievements: vi.fn().mockResolvedValue(null),
  fetchSeasonProgress: vi.fn().mockResolvedValue(null),
  getApiBase: vi.fn(() => "http://localhost:3000"),
  getUserMe: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../src/client/Auth", () => ({
  getAuthHeader: vi.fn().mockResolvedValue(""),
  getPlayToken: vi.fn().mockResolvedValue(""),
}));

describe("Command Center lifecycle", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("removes every document-level listener when the surface unmounts", async () => {
    await import("../../src/client/CommandCenter");
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const center = document.createElement("command-center");

    document.body.append(center);
    const registered = add.mock.calls.filter(([type]) =>
      ["userMeResponse", "vaultfront-achievement-unlocked"].includes(
        String(type),
      ),
    );
    expect(registered.map(([type]) => type).sort()).toEqual([
      "userMeResponse",
      "vaultfront-achievement-unlocked",
    ]);

    center.remove();
    for (const [type, listener] of registered) {
      expect(remove).toHaveBeenCalledWith(type, listener);
    }
  });

  it("cancels queued toast transitions after disconnection", async () => {
    vi.useFakeTimers();
    await import("../../src/client/AchievementToast");
    const toast = document.createElement(
      "achievement-toast",
    ) as import("../../src/client/AchievementToast").AchievementToast;
    const showNext = vi.spyOn(toast as never, "_showNext");
    document.body.append(toast);

    toast.show({ name: "First", description: "First unlock" });
    await vi.advanceTimersByTimeAsync(50);
    (toast as unknown as { _dismiss(): void })._dismiss();
    toast.remove();
    await vi.advanceTimersByTimeAsync(350);

    expect(showNext).toHaveBeenCalledTimes(1);
  });
});
