import { Execution, Game, Player } from "../game/Game";

export class SetResourceFocusExecution implements Execution {
  constructor(
    private player: Player,
    private focus: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.player.setGoldTroopFocus(this.focus);
    mg.stats().resourceFocusSet(this.player, this.focus);
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
