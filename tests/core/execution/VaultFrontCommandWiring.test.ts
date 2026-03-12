import {
  SendVaultConvoyCommandIntentEvent,
  Transport,
} from "../../../src/client/Transport";
import { EventBus } from "../../../src/core/EventBus";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import { VaultConvoyCommandExecution } from "../../../src/core/execution/VaultConvoyCommandExecution";
import { PlayerInfo, PlayerType } from "../../../src/core/game/Game";
import { ClientIntentMessageSchema } from "../../../src/core/Schemas";
import { setup } from "../../util/Setup";

describe("Vault convoy command wiring", () => {
  test("reroute_safest flows from Transport intent to execution queue", async () => {
    const eventBus = new EventBus();
    const transport = new Transport(
      {
        gameID: "wire-game",
        playerName: "tester",
        serverConfig: {} as any,
        cosmetics: {} as any,
        turnstileToken: null,
        gameStartInfo: { config: { gameType: "Public" } } as any,
      } as any,
      eventBus,
    ) as any;

    const send = vi.fn();
    transport.socket = {
      readyState: WebSocket.OPEN,
      send,
      close: vi.fn(),
    };

    eventBus.emit(new SendVaultConvoyCommandIntentEvent("reroute_safest"));

    expect(send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(send.mock.calls[0][0]);
    const clientMessage = ClientIntentMessageSchema.parse(sent);
    expect(clientMessage.intent.type).toBe("vault_convoy_command");
    expect((clientMessage.intent as any).command).toBe("reroute_safest");

    const game = await setup("plains", {}, [
      new PlayerInfo("tester", PlayerType.Human, "client-1", "player-1"),
    ]);
    const executor = new Executor(game, "wire-game", "client-1");
    const execution = executor.createExec({
      ...clientMessage.intent,
      clientID: "client-1",
    } as any);

    expect(execution).toBeInstanceOf(VaultConvoyCommandExecution);
    execution.init(game, game.ticks());

    const queued = game.drainVaultFrontCommands();
    expect(queued).toHaveLength(1);
    expect(queued[0].type).toBe("reroute_safest");
  });
});
