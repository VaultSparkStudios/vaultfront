import { Execution, Game, Player } from "../game/Game";

export class DefenseFactoryCommandExecution implements Execution {
  constructor(
    private player: Player,
    private command: "jam_breaker",
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

