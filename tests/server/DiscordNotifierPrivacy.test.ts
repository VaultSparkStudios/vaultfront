import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/Logger", () => ({
  logger: { warn: vi.fn() },
}));

describe("DiscordNotifier privacy boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.useRealTimers();
    delete process.env.DISCORD_WEBHOOK_URL;
  });

  it("bounds outbound text and strips control characters", async () => {
    const { normalizeDiscordEmbeds } =
      await import("../../src/server/DiscordNotifier");
    const [embed] = normalizeDiscordEmbeds([
      {
        title: `alert${String.fromCharCode(0)}${"x".repeat(400)}`,
        description: `hello${String.fromCharCode(7)}world`,
        fields: Array.from({ length: 30 }, (_, index) => ({
          name: `field-${index}`,
          value: "v".repeat(2_000),
        })),
      },
    ]);

    expect(embed.title).not.toContain(String.fromCharCode(0));
    expect(embed.title?.length).toBe(256);
    expect(embed.description).toBe("hello world");
    expect(embed.fields).toHaveLength(25);
    expect(embed.fields?.[0].value).toHaveLength(1_024);
  });

  it("disables every Discord mention class and exposes bounded posture", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://example.invalid/webhook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    const { DiscordNotifier, discordNotificationPosture } =
      await import("../../src/server/DiscordNotifier");

    DiscordNotifier.vaultCaptured("game", "@everyone", 0);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.allowed_mentions).toEqual({
      parse: [],
      users: [],
      roles: [],
      replied_user: false,
    });
    expect(discordNotificationPosture()).toMatchObject({
      enabled: true,
      timeoutMs: 3_500,
      maxInFlight: 4,
      delivered: 1,
      inFlight: 0,
    });
  });

  it("drops excess work deterministically at the concurrency boundary", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://example.invalid/webhook";
    const releases: Array<() => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            releases.push(() => resolve({ ok: true, status: 204 } as Response));
          }),
      ),
    );
    const { DiscordNotifier, discordNotificationPosture } =
      await import("../../src/server/DiscordNotifier");

    for (let index = 0; index < 5; index += 1) {
      DiscordNotifier.gameStarted(`game-${index}`, 1, "Vault");
    }
    expect(discordNotificationPosture()).toMatchObject({
      inFlight: 4,
      dropped: 1,
    });

    releases.forEach((release) => release());
    await vi.waitFor(() =>
      expect(discordNotificationPosture()).toMatchObject({
        inFlight: 0,
        delivered: 4,
        dropped: 1,
      }),
    );
  });

  it("aborts a stalled delivery and records the bounded failure", async () => {
    vi.useFakeTimers();
    process.env.DISCORD_WEBHOOK_URL = "https://example.invalid/webhook";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, request: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const { DiscordNotifier, discordNotificationPosture } =
      await import("../../src/server/DiscordNotifier");

    DiscordNotifier.serverStarted("test", "test");
    expect(discordNotificationPosture().inFlight).toBe(1);
    await vi.advanceTimersByTimeAsync(3_500);
    await Promise.resolve();

    expect(discordNotificationPosture()).toMatchObject({
      inFlight: 0,
      failed: 1,
      delivered: 0,
    });
  });
});
