import { GameView } from "../../../core/game/GameView";

export interface TutorialTip {
  id: string;
  text: string;
  anchor?: string;
}

const ADVANCED_HINTS: Record<string, string> = {
  convoy_first_launch:
    "First convoy dispatched! Route through friendly territory. If intercepted, try Ghost Route to cloak the next one.",
  heist_available:
    "Vault Heist is available — steal gold from the dominant player's vault when you have fewer than 3 territories.",
  intel_purchase_available:
    "Purchase Intel (30k gold) to reveal all enemy convoy routes for 60 seconds — best used before a key intercept.",
  ghost_route_unlocked:
    "Ghost Route hides your convoy from enemy detection. Activate before dispatching on contested lanes.",
  dynasty_season_start:
    "Dynasty Season has started — your clan's combined gold pool carries across matches. Coordinate deliveries!",
};

const TUTORIAL_TIPS: TutorialTip[] = [
  {
    id: "first_vault_nearby",
    text: "A vault site is nearby — move your territory to it and hold it to generate gold.",
    anchor: "vault-panel",
  },
  {
    id: "first_gold_threshold",
    text: "You have enough gold to dispatch a convoy. Convoys deliver gold to vault sites.",
    anchor: "convoy-controls",
  },
  {
    id: "first_convoy_intercepted",
    text: "Your convoy was intercepted! Try dispatching via a safer route or activate Ghost Route to hide it.",
    anchor: "vault-panel",
  },
  {
    id: "ghost_route_hint",
    text: "Ghost Route cloaks your convoy from enemy view. Use it when routes are contested.",
    anchor: "vault-panel",
  },
  {
    id: "execution_chain_hint",
    text: "Clean deliveries without interruption build an Execution Chain — bonus gold on completion!",
    anchor: "vault-panel",
  },
  {
    id: "surge_hint",
    text: "You've been behind for a while — Comeback Surge is activating to help you recover.",
    anchor: "vault-panel",
  },
  {
    id: "last_stand_hint",
    text: "LAST STAND triggered! One player controls many vaults — you receive bonus convoy gold for 90 seconds.",
    anchor: "vault-panel",
  },
  {
    id: "vault_heist_hint",
    text: "With only 2 territories left, you can activate Vault Heist to steal gold from an enemy vault.",
    anchor: "vault-panel",
  },
  {
    id: "bounty_hint",
    text: "A bounty has been posted! Intercept that player's convoy to collect the reward.",
    anchor: "vault-panel",
  },
  {
    id: "intel_hint",
    text: "Purchase Intel to reveal all enemy convoy routes for 60 seconds. Costs 30k gold.",
    anchor: "vault-panel",
  },
];

export class TutorialTriggerEngine {
  private seenTips = new Set<string>();
  private pendingTips: TutorialTip[] = [];
  private listeners = new Set<(tip: TutorialTip) => void>();
  private lastGold = 0n;
  private survivalTicks = 0;
  private initialized = false;

  init(_game: GameView): void {
    const stored = localStorage.getItem("vf_seen_tips");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        parsed.forEach((id) => this.seenTips.add(id));
      } catch {
        // ignore
      }
    }
    this.initialized = true;
  }

  tick(game: GameView, ticks: number): void {
    if (!this.initialized) return;
    const player = game.myPlayer();
    if (!player || !player.isAlive()) return;

    const gold = player.gold();
    const tiles = player.numTilesOwned();

    if (ticks === 1) {
      this.maybeShow("first_vault_nearby");
    }
    if (gold >= 50_000n && this.lastGold < 50_000n) {
      this.maybeShow("first_gold_threshold");
    }
    if (gold >= 30_000n && ticks > 200) {
      this.maybeShow("intel_hint");
      this.maybeShowAdvanced("intel_purchase_available");
    }
    if (tiles <= 2 && gold >= 20_000n && ticks > 100) {
      this.maybeShow("vault_heist_hint");
      this.maybeShowAdvanced("heist_available");
    }
    this.lastGold = gold;
    this.survivalTicks++;
  }

  onFirstConvoyLaunched(): void {
    this.maybeShowAdvanced("convoy_first_launch");
    this.maybeShowAdvanced("ghost_route_unlocked");
  }

  onDynastySeasonStart(): void {
    this.maybeShowAdvanced("dynasty_season_start");
  }

  onConvoyIntercepted(): void {
    this.maybeShow("first_convoy_intercepted");
    this.maybeShow("ghost_route_hint");
  }

  onSurgeActive(): void {
    this.maybeShow("surge_hint");
  }

  onLastStand(): void {
    this.maybeShow("last_stand_hint");
  }

  onBountyBoard(): void {
    this.maybeShow("bounty_hint");
  }

  private maybeShowAdvanced(hintKey: string): void {
    if (this.seenTips.has(`adv_${hintKey}`)) return;
    const text = ADVANCED_HINTS[hintKey];
    if (!text) return;
    this.seenTips.add(`adv_${hintKey}`);
    this.saveSeen();
    this.emit({ id: `adv_${hintKey}`, text, anchor: "vault-panel" });
  }

  private maybeShow(tipId: string): void {
    if (this.seenTips.has(tipId)) return;
    const tip = TUTORIAL_TIPS.find((t) => t.id === tipId);
    if (!tip) return;
    this.seenTips.add(tipId);
    this.saveSeen();
    this.emit(tip);
  }

  private emit(tip: TutorialTip): void {
    this.pendingTips.push(tip);
    this.listeners.forEach((fn) => fn(tip));
  }

  private saveSeen(): void {
    try {
      localStorage.setItem("vf_seen_tips", JSON.stringify([...this.seenTips]));
    } catch {
      // ignore
    }
  }

  onTipShown(tipId: string): void {
    this.seenTips.add(tipId);
    this.saveSeen();
  }

  subscribe(fn: (tip: TutorialTip) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset(): void {
    this.seenTips.clear();
    localStorage.removeItem("vf_seen_tips");
  }
}

export const tutorialEngine = new TutorialTriggerEngine();
