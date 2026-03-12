import { Execution, Game, Player, VaultFrontCommandType } from "../game/Game";

export class VaultConvoyCommandExecution implements Execution {
  constructor(
    private player: Player,
    private command: VaultFrontCommandType,
  ) {}

  init(mg: Game): void {
    mg.queueVaultFrontCommand({
      playerSmallID: this.player.smallID(),
      type: this.command,
      issuedAtTick: mg.ticks(),
    });
  }

  tick(): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
