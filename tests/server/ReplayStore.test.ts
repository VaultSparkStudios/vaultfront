import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getReplayIntegrityPosture,
  InMemoryReplayBackend,
  ReplayStore,
} from "../../src/server/ReplayStore";

const originalEnv = {
  replaySecret: process.env.REPLAY_SECRET,
  gameEnv: process.env.GAME_ENV,
  nodeEnv: process.env.NODE_ENV,
};

function restore(
  name: "REPLAY_SECRET" | "GAME_ENV" | "NODE_ENV",
  value: string | undefined,
) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("ReplayStore verified consumption", () => {
  beforeEach(() => {
    process.env.REPLAY_SECRET = "focused-test-replay-key";
    process.env.GAME_ENV = "dev";
  });

  afterEach(() => {
    restore("REPLAY_SECRET", originalEnv.replaySecret);
    restore("GAME_ENV", originalEnv.gameEnv);
    restore("NODE_ENV", originalEnv.nodeEnv);
  });

  it("returns signed manifests and rejects a tampered payload at every load", async () => {
    const backend = new InMemoryReplayBackend();
    const store = new ReplayStore(backend);
    store.startRecording("game0001", "World", 42, { gameMode: "ffa" });
    store.recordTurn("game0001", {
      turnNumber: 1,
      intents: [{ type: "spawn" }],
    });
    await store.finishRecording("game0001");

    expect(await store.getReplay("game0001")).not.toBeNull();
    const raw = await backend.load("game0001");
    expect(raw).not.toBeNull();
    raw!.turns![0].intents.push({ type: "forged-achievement" });
    await backend.save("game0001", raw!);

    expect(await store.getReplay("game0001")).toBeNull();
    expect(await store.listReplays()).toEqual([]);
  });

  it("fails closed outside development and test when the key is absent", async () => {
    delete process.env.REPLAY_SECRET;
    process.env.GAME_ENV = "prod";
    process.env.NODE_ENV = "production";
    const store = new ReplayStore(new InMemoryReplayBackend());
    store.startRecording("game0002", "World", 7, {});

    expect(getReplayIntegrityPosture()).toMatchObject({
      status: "missing",
      canSignAndVerify: false,
    });
    await expect(store.finishRecording("game0002")).rejects.toThrow(
      "REPLAY_SECRET is required",
    );
  });
});
