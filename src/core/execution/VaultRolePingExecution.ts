import { Execution, Game, MessageType, Player } from "../game/Game";

export class VaultRolePingExecution implements Execution {
  constructor(
    private player: Player,
    private ping: "escort_convoy" | "intercept_lane" | "pulse_soon",
  ) {}

  init(mg: Game): void {
    const label =
      this.ping === "escort_convoy"
        ? "Escort this Vault Convoy lane"
        : this.ping === "intercept_lane"
          ? "Intercept enemy Vault Convoy lane"
          : "Defense Factory pulse soon";

    mg.displayMessage(`${this.player.displayName()}: ${label}`, MessageType.CHAT, null);
  }

  tick(): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}

