import { GameView } from "../../../core/game/GameView";

export interface UIState {
  showVaultPanel: boolean;
  showConvoyControls: boolean;
  isSpectatorMode: boolean;
  isEliminatedPlayer: boolean;
  playerGold: bigint;
  gamePhase: "early" | "mid" | "late" | "spectator";
}

export class UIStateManager {
  private state: UIState = {
    showVaultPanel: true,
    showConvoyControls: true,
    isSpectatorMode: false,
    isEliminatedPlayer: false,
    playerGold: 0n,
    gamePhase: "early",
  };

  private listeners = new Set<(state: UIState) => void>();

  refresh(game: GameView): void {
    const player = game.myPlayer();
    if (!player) {
      this.update({
        showVaultPanel: false,
        showConvoyControls: false,
        isSpectatorMode: true,
        isEliminatedPlayer: false,
        playerGold: 0n,
        gamePhase: "spectator",
      });
      return;
    }

    const isAlive = player.isAlive();
    const gold = player.gold();
    const ticks = game.ticks();
    const phase: UIState["gamePhase"] =
      ticks < 500 ? "early" : ticks < 2000 ? "mid" : "late";

    this.update({
      showVaultPanel: isAlive && phase !== "early",
      showConvoyControls: isAlive && gold >= 20_000n,
      isSpectatorMode: !isAlive,
      isEliminatedPlayer: !isAlive,
      playerGold: gold,
      gamePhase: isAlive ? phase : "spectator",
    });
  }

  private update(next: UIState): void {
    const changed =
      next.showVaultPanel !== this.state.showVaultPanel ||
      next.showConvoyControls !== this.state.showConvoyControls ||
      next.isSpectatorMode !== this.state.isSpectatorMode;
    this.state = next;
    if (changed) {
      this.listeners.forEach((fn) => fn(this.state));
    }
  }

  get(): UIState {
    return this.state;
  }

  subscribe(fn: (state: UIState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  showVaultPanel(): boolean {
    return this.state.showVaultPanel;
  }

  showConvoyControls(): boolean {
    return this.state.showConvoyControls;
  }

  isSpectatorMode(): boolean {
    return this.state.isSpectatorMode;
  }
}

export const uiStateManager = new UIStateManager();
