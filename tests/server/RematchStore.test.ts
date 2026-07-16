import { describe, expect, it } from "vitest";
import { RematchStore } from "../../src/server/RematchStore";

describe("RematchStore real lobby corridor", () => {
  it("publishes only a created lobby and deduplicates participants", () => {
    let now = 10_000;
    const store = new RematchStore(() => now);
    const created = store.create({
      gameId: "oldgame1",
      lobbyId: "newgame1",
      actorKey: "actor-a",
      mapName: "World",
      joinUrl: "https://play.example/w0/game/newgame1?lobby",
    });

    expect(created).toMatchObject({
      gameId: "oldgame1",
      lobbyId: "newgame1",
      participantCount: 1,
      status: "ready",
    });
    expect(created).not.toHaveProperty("participantKeys");
    expect(store.join("oldgame1", "actor-a")?.participantCount).toBe(1);
    expect(store.join("oldgame1", "actor-b")?.participantCount).toBe(2);
    expect(store.getByCode(created.code)?.lobbyId).toBe("newgame1");

    now += 5 * 60 * 1_000 + 1;
    expect(store.get("oldgame1")).toBeNull();
  });

  it("does not invent a rematch for an intent without a created lobby", () => {
    const store = new RematchStore();
    expect(store.join("missing-game", "actor-a")).toBeNull();
    expect(store.get("missing-game")).toBeNull();
  });
});
