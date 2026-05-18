import {
  Execution,
  Game,
  Player,
  Structures,
  UnitType,
  VaultFrontCommandType,
} from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";
import { AllianceExtensionExecution } from "./alliance/AllianceExtensionExecution";
import { DeleteUnitExecution } from "./DeleteUnitExecution";
import { AiAttackBehavior } from "./utils/AiAttackBehavior";

export type BotPersonality = "aggressor" | "economist" | "diplomat" | "ghost";

interface PersonalityWeights {
  attackWeight: number;
  convoyWeight: number;
  defendWeight: number;
  ghostRouteChance: number;
  alliancePingRate: number;
}

const PERSONALITY_WEIGHTS: Record<BotPersonality, PersonalityWeights> = {
  aggressor: {
    attackWeight: 0.8,
    convoyWeight: 0.3,
    defendWeight: 0.2,
    ghostRouteChance: 0.05,
    alliancePingRate: 0.01,
  },
  economist: {
    attackWeight: 0.2,
    convoyWeight: 0.9,
    defendWeight: 0.5,
    ghostRouteChance: 0.1,
    alliancePingRate: 0.05,
  },
  diplomat: {
    attackWeight: 0.4,
    convoyWeight: 0.6,
    defendWeight: 0.4,
    ghostRouteChance: 0.1,
    alliancePingRate: 0.3,
  },
  ghost: {
    attackWeight: 0.3,
    convoyWeight: 0.7,
    defendWeight: 0.3,
    ghostRouteChance: 0.6,
    alliancePingRate: 0.02,
  },
};

export class BotExecution implements Execution {
  private active = true;
  private random: PseudoRandom;
  private mg: Game;
  private neighborsTerraNullius = true;
  readonly personality: BotPersonality;
  private weights: PersonalityWeights;

  private attackBehavior: AiAttackBehavior | null = null;
  private attackRate: number;
  private attackTick: number;
  private triggerRatio: number;
  private reserveRatio: number;
  private expandRatio: number;
  private nextVaultCommandTick = 0;
  private vaultRouteIndex = 0;
  private diplomatBetrayalFired = false;

  constructor(private bot: Player) {
    this.random = new PseudoRandom(simpleHash(bot.id()));
    this.attackRate = this.random.nextInt(40, 80);
    this.attackTick = this.random.nextInt(0, this.attackRate);
    this.triggerRatio = this.random.nextInt(50, 60) / 100;
    this.reserveRatio = this.random.nextInt(30, 40) / 100;
    this.expandRatio = this.random.nextInt(10, 20) / 100;

    const personalities: BotPersonality[] = [
      "aggressor",
      "economist",
      "diplomat",
      "ghost",
    ];
    this.personality =
      personalities[this.random.nextInt(0, personalities.length - 1)];
    this.weights = PERSONALITY_WEIGHTS[this.personality];
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game) {
    this.mg = mg;
  }

  tick(ticks: number) {
    if (ticks % this.attackRate !== this.attackTick) return;

    if (!this.bot.isAlive()) {
      //removeOnDeath is called from bot's PlayerExecution
      this.active = false;
      return;
    }

    if (this.attackBehavior === null) {
      this.attackBehavior = new AiAttackBehavior(
        this.random,
        this.mg,
        this.bot,
        this.triggerRatio,
        this.reserveRatio,
        this.expandRatio,
      );

      // Send an attack on the first tick
      this.attackBehavior.sendAttack(this.mg.terraNullius());
      return;
    }

    this.acceptAllAllianceRequests();
    this.deleteAllStructures();
    this.maybeAttack();
    if (this.mg.config().vaultSitesEnabled()) {
      this.maybeIssueVaultFrontCommand(ticks);
    }
  }

  private acceptAllAllianceRequests() {
    // Accept all alliance requests
    for (const req of this.bot.incomingAllianceRequests()) {
      req.accept();
    }

    // Accept all alliance extension requests
    for (const alliance of this.bot.alliances()) {
      // Alliance expiration tracked by Events Panel, only human ally can click Request to Renew
      // Skip if no expiration yet/ ally didn't request extension yet / bot already agreed to extend
      if (!alliance.onlyOneAgreedToExtend()) continue;

      const human = alliance.other(this.bot);
      this.mg.addExecution(
        new AllianceExtensionExecution(this.bot, human.id()),
      );
    }
  }

  private deleteAllStructures() {
    for (const unit of this.bot.units()) {
      if (Structures.has(unit.type()) && this.bot.canDeleteUnit()) {
        this.mg.addExecution(new DeleteUnitExecution(this.bot, unit.id()));
      }
    }
  }

  private maybeAttack() {
    if (this.attackBehavior === null) {
      throw new Error("not initialized");
    }
    const toAttack = this.attackBehavior.getNeighborTraitorToAttack();
    if (toAttack !== null) {
      const odds = this.bot.isFriendly(toAttack) ? 6 : 3;
      if (this.random.chance(odds)) {
        // Check and break alliance before attacking if needed
        const alliance = this.bot.allianceWith(toAttack);

        if (alliance !== null) {
          this.bot.breakAlliance(alliance);
        }

        this.attackBehavior.sendAttack(toAttack);
        return;
      }
    }

    if (this.neighborsTerraNullius) {
      if (this.bot.neighbors().some((n) => !n.isPlayer())) {
        this.attackBehavior.sendAttack(this.mg.terraNullius());
        return;
      }
      this.neighborsTerraNullius = false;
    }

    this.attackBehavior.attackRandomTarget();
  }

  private maybeIssueVaultFrontCommand(ticks: number): void {
    if (ticks < this.nextVaultCommandTick) return;
    if (!this.bot.isAlive()) return;

    const neighbors = this.bot.neighbors().filter((n) => n.isPlayer());
    const hostile = neighbors.filter(
      (n) => n.isPlayer() && !this.bot.isFriendly(n as Player),
    ).length;
    const pressure = neighbors.length > 0 ? hostile / neighbors.length : 0;
    const canAffordJam =
      this.bot.gold() >= 115_000n &&
      this.bot.unitsOwned(UnitType.DefensePost) > 0;
    const w = this.weights;

    let command: VaultFrontCommandType | null = null;

    // Ghost personality uses ghost routes frequently
    if (
      this.personality === "ghost" &&
      this.random.nextFloat(0, 1) < w.ghostRouteChance
    ) {
      command = "ghost_route";
    } else if (pressure >= 0.5 && canAffordJam && this.random.chance(3)) {
      command = "jam_breaker";
    } else if (
      pressure >= 0.35 * (1 / Math.max(w.attackWeight, 0.1)) &&
      this.random.chance(3)
    ) {
      command = "escort";
    } else if (
      this.random.nextFloat(0, 1) < w.convoyWeight * 0.3 &&
      this.random.chance(4)
    ) {
      const routes: VaultFrontCommandType[] = [
        "reroute_safest",
        "reroute_city",
        "reroute_port",
        "reroute_factory",
      ];
      command = routes[this.vaultRouteIndex % routes.length];
      this.vaultRouteIndex++;
    }

    // Diplomat: ally ping at high rate, betray at tick 500
    if (this.personality === "diplomat") {
      if (!this.diplomatBetrayalFired && ticks >= 500 && neighbors.length > 0) {
        this.diplomatBetrayalFired = true;
      }
    }

    if (command !== null) {
      this.mg.queueVaultFrontCommand({
        playerSmallID: this.bot.smallID(),
        type: command,
        issuedAtTick: ticks,
      });
    }
    const baseInterval = Math.round(120 * (1 - w.convoyWeight * 0.4));
    this.nextVaultCommandTick =
      ticks + this.random.nextInt(baseInterval, baseInterval + 60);
  }

  isActive(): boolean {
    return this.active;
  }
}
