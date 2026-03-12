import {
  Execution,
  Game,
  MessageType,
  Player,
  UnitType,
  VaultFrontCommand,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { GameUpdateType, VaultFrontStatusUpdate } from "../game/GameUpdates";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";

interface VaultSite {
  id: number;
  tile: TileRef;
  controllerID: number | null;
  controlTicks: number;
  cooldownTicks: number;
  passiveOwnerID: number | null;
  nextPassiveGoldTick: number;
  reducedRewardNextCapture: boolean;
}

interface VaultConvoy {
  id: number;
  ownerID: number;
  sourceTile: TileRef;
  destinationTile: TileRef;
  ticksRemaining: number;
  totalTicks: number;
  goldReward: bigint;
  troopsReward: number;
  rewardMultiplier: number;
  rewardScale: number;
  strengthMultiplier: number;
  phaseMultiplier: number;
  riskMultiplier: number;
  routeRisk: number;
  routeDistance: number;
  rewardMath: string;
  escortShield: number;
  reroutes: number;
}

interface BeaconState {
  charge: number;
  cooldownUntil: number;
  maskedUntil: number;
  anchorTile?: TileRef;
}

interface RewardPlan {
  goldReward: bigint;
  troopsReward: number;
  rewardMultiplier: number;
  rewardScale: number;
  strengthMultiplier: number;
  phaseMultiplier: number;
  riskMultiplier: number;
  rewardMath: string;
}

interface SquadObjectiveWindow {
  siteID: number;
  ownerID: number;
  anchorTile: TileRef;
  expiresAtTick: number;
  participants: Set<number>;
  rewarded: boolean;
}

export class VaultFrontExecution implements Execution {
  private active = true;
  private game!: Game;
  private random!: PseudoRandom;

  private vaultSites: VaultSite[] = [];
  private convoys: VaultConvoy[] = [];
  private nextConvoyID = 1;
  private beacons = new Map<number, BeaconState>();
  private preferredConvoyDestination = new Map<number, UnitType>();
  private escortUntilTick = new Map<number, number>();
  private jamBreakerCooldownUntil = new Map<number, number>();
  private behindSinceTick = new Map<number, number>();
  private surgeUntilTick = new Map<number, number>();
  private minute8BehindMarked = new Set<number>();
  private executionChainStep = new Map<number, 0 | 1 | 2>();
  private executionChainExpiresAtTick = new Map<number, number>();
  private executionStreakNextConvoyMultiplier = new Map<number, number>();
  private squadObjectiveWindows: SquadObjectiveWindow[] = [];
  private lastPublishedConvoyDebugKey = "";
  private weeklyMutator:
    | "none"
    | "lane_fog"
    | "accelerated_cooldowns"
    | "double_passive" = "none";

  // Vault sites and convoy extraction.
  private readonly vaultCaptureTicks = 90;
  private readonly vaultCooldownTicks = 650;
  private readonly vaultPassiveIncomeIntervalTicks = 600;
  private readonly vaultPassiveGoldPerMinute = 75_000n;

  // Defense Factory balance.
  private readonly beaconChargeCap = 100;
  private readonly beaconTriggerCost = 72;
  private readonly beaconPulseDurationTicks = 95;
  private readonly beaconPulseCooldownTicks = 320;
  private readonly jamBreakerGoldCost = 115_000n;
  private readonly jamBreakerCooldownTicks = 900;
  private readonly jamBreakerMaskClampTicks = 20;

  // Comeback tuning.
  private readonly surgeBehindThresholdRatio = 0.85;
  private readonly surgeActivationHoldTicks = 3_600;
  private readonly surgeDurationTicks = 1_200;
  private readonly surgeCaptureGoldBonus = 65_000n;
  private readonly surgeInterceptGoldMultiplier = 1.3;
  private readonly cleanExecutionChainWindowTicks = 1_500;
  private readonly cleanExecutionStreakConvoyMultiplier = 1.2;
  private readonly squadObjectiveWindowTicks = 520;
  private readonly squadObjectiveRadius = 30;
  private readonly squadObjectiveGoldBonus = 35_000n;
  private readonly squadObjectiveTroopsBonus = 450;

  init(mg: Game): void {
    this.game = mg;
    const seed = simpleHash(
      `vaultfront:${mg.width()}x${mg.height()}:${mg.numLandTiles()}`,
    );
    this.random = new PseudoRandom(seed);
    this.weeklyMutator = this.game.config().vaultWeeklyMutator();

    for (const player of this.game.allPlayers()) {
      this.preferredConvoyDestination.set(player.smallID(), UnitType.City);
      this.escortUntilTick.set(player.smallID(), 0);
      this.jamBreakerCooldownUntil.set(player.smallID(), 0);
      this.behindSinceTick.set(player.smallID(), -1);
      this.surgeUntilTick.set(player.smallID(), 0);
      this.executionChainStep.set(player.smallID(), 0);
      this.executionChainExpiresAtTick.set(player.smallID(), 0);
      this.executionStreakNextConvoyMultiplier.set(player.smallID(), 1);
      this.beacons.set(player.smallID(), {
        charge: this.random.nextInt(15, 45),
        cooldownUntil: 0,
        maskedUntil: 0,
      });
    }

    if (this.game.config().vaultSitesEnabled()) {
      this.createVaultSites();
      if (this.vaultSites.length > 0) {
        this.game.displayMessage(
          `VaultFront: ${this.vaultSites.length} vault sites are now contested.`,
          MessageType.ATTACK_REQUEST,
          null,
        );
        if (this.weeklyMutator !== "none") {
          const mutatorLabel =
            this.weeklyMutator === "lane_fog"
              ? "Lane Fog"
              : this.weeklyMutator === "accelerated_cooldowns"
                ? "Accelerated Cooldowns"
                : "Double Passive";
          this.game.displayMessage(
            `Weekly VaultFront mutator active: ${mutatorLabel}.`,
            MessageType.CHAT,
            null,
          );
        }
      }
    }
  }

  tick(ticks: number): void {
    if (this.game.inSpawnPhase()) {
      return;
    }

    this.handleQueuedCommands(ticks);
    this.updateComebackState(ticks);
    this.sweepExpiredSquadObjectives(ticks);
    for (const player of this.game.players()) {
      const playerID = player.smallID();
      const step = this.executionChainStep.get(playerID) ?? 0;
      if (
        step > 0 &&
        ticks > (this.executionChainExpiresAtTick.get(playerID) ?? 0)
      ) {
        this.resetExecutionChain(playerID);
      }
    }

    if (this.game.config().vaultSitesEnabled()) {
      this.tickVaultSites(ticks);
      this.tickConvoys(ticks);
    }

    if (this.game.config().intelOperationsEnabled()) {
      this.tickCountersurveillance(ticks);
    }

    this.publishStatusUpdate();
  }

  private createVaultSites(): void {
    const landTiles: TileRef[] = [];
    this.game.forEachTile((tile) => {
      if (this.game.isLand(tile)) {
        landTiles.push(tile);
      }
    });

    const maxSites = Math.min(
      5,
      Math.max(2, Math.floor(landTiles.length / 180_000)),
    );
    const minSpacing = Math.max(
      35,
      Math.floor(Math.sqrt(this.game.numLandTiles()) / 3),
    );
    const shuffled = this.random.shuffleArray(landTiles);

    const selected: TileRef[] = [];
    for (const tile of shuffled) {
      const farEnough = selected.every(
        (existing) => this.game.manhattanDist(existing, tile) >= minSpacing,
      );
      if (!farEnough) {
        continue;
      }
      selected.push(tile);
      if (selected.length >= maxSites) {
        break;
      }
    }

    this.vaultSites = selected.map((tile, index) => ({
      id: index + 1,
      tile,
      controllerID: null,
      controlTicks: 0,
      cooldownTicks: 0,
      passiveOwnerID: null,
      nextPassiveGoldTick: 0,
      reducedRewardNextCapture: false,
    }));
  }

  private handleQueuedCommands(ticks: number): void {
    const commands = this.game.drainVaultFrontCommands();
    if (commands.length === 0) {
      return;
    }

    for (const command of commands) {
      const player = this.game.playerBySmallID(command.playerSmallID);
      if (!player.isPlayer() || !player.isAlive()) {
        continue;
      }
      this.handleCommand(player, command, ticks);
    }
  }

  private handleCommand(
    player: Player,
    command: VaultFrontCommand,
    ticks: number,
  ): void {
    switch (command.type) {
      case "reroute_city":
      case "reroute_port":
      case "reroute_factory":
      case "reroute_silo":
      case "reroute_safest":
        this.applyRerouteCommand(player, command.type, ticks);
        return;
      case "escort":
        this.applyEscortCommand(player, ticks);
        return;
      case "jam_breaker":
        this.applyJamBreakerCommand(player, ticks);
        return;
      default:
        return;
    }
  }

  private commandUnitType(
    command:
      | "reroute_city"
      | "reroute_port"
      | "reroute_factory"
      | "reroute_silo"
      | "reroute_safest",
  ): UnitType | undefined {
    if (command === "reroute_port") return UnitType.Port;
    if (command === "reroute_factory") return UnitType.Factory;
    if (command === "reroute_silo") return UnitType.MissileSilo;
    if (command === "reroute_safest") return undefined;
    return UnitType.City;
  }

  private applyRerouteCommand(
    player: Player,
    command:
      | "reroute_city"
      | "reroute_port"
      | "reroute_factory"
      | "reroute_silo"
      | "reroute_safest",
    ticks: number,
  ): void {
    const preferred = this.commandUnitType(command);
    if (preferred !== undefined) {
      this.preferredConvoyDestination.set(player.smallID(), preferred);
    }

    const active = this.convoys
      .filter((convoy) => convoy.ownerID === player.smallID())
      .sort((a, b) => a.ticksRemaining - b.ticksRemaining)[0];
    if (!active) {
      this.game.displayMessage(
        command === "reroute_safest"
          ? "No active Vault Convoy to reroute yet."
          : "Vault Convoy preference updated for your next launch.",
        MessageType.CHAT,
        player.id(),
      );
      return;
    }

    const currentTile = this.convoyProgressTile(active);
    const destination = this.bestConvoyDestination(
      player,
      currentTile,
      preferred,
      command,
    );
    if (destination === active.destinationTile) {
      return;
    }
    active.destinationTile = destination;
    const distance = this.game.manhattanDist(currentTile, destination);
    active.ticksRemaining = Math.max(
      35,
      Math.min(320, Math.floor(distance / 2)),
    );
    active.totalTicks = Math.max(active.totalTicks, active.ticksRemaining + 1);
    const routeRisk = this.routeRiskScore(player, currentTile, destination);
    const updatedPlan = this.convoyRewardPlan(
      player,
      distance,
      routeRisk,
      ticks,
      active.rewardScale,
    );
    active.routeDistance = distance;
    active.routeRisk = routeRisk;
    active.rewardMultiplier = updatedPlan.rewardMultiplier;
    active.strengthMultiplier = updatedPlan.strengthMultiplier;
    active.phaseMultiplier = updatedPlan.phaseMultiplier;
    active.riskMultiplier = updatedPlan.riskMultiplier;
    active.rewardMath = updatedPlan.rewardMath;
    active.goldReward = updatedPlan.goldReward;
    active.troopsReward = updatedPlan.troopsReward;
    active.reroutes += 1;

    this.emitActivity(
      "convoy_rerouted",
      currentTile,
      player.smallID(),
      null,
      "Vault Convoy rerouted",
      120,
    );
    this.game.stats().vaultConvoyRerouted(player);
    this.game.displayMessage(
      command === "reroute_safest"
        ? `Vault Convoy rerouted to safest lane. New ETA ${Math.ceil(active.ticksRemaining / 10)}s.`
        : `Vault Convoy rerouted. New ETA ${Math.ceil(active.ticksRemaining / 10)}s.`,
      MessageType.CHAT,
      player.id(),
    );
  }

  private applyEscortCommand(player: Player, ticks: number): void {
    const until = ticks + this.escortDurationTicksEffective();
    this.escortUntilTick.set(player.smallID(), until);

    for (const convoy of this.convoys) {
      if (convoy.ownerID === player.smallID()) {
        convoy.escortShield = Math.max(convoy.escortShield, 1);
      }
    }

    const anchor = player.spawnTile();
    this.game.stats().vaultConvoyEscortCommand(player);
    if (anchor !== undefined) {
      this.emitActivity(
        "convoy_escorted",
        anchor,
        player.smallID(),
        null,
        "Vault Convoy escort active",
        130,
      );
      this.contributeToSquadObjective(player, ticks, anchor);
    }
    this.game.displayMessage(
      "Escort command active: your Vault Convoys can evade one intercept.",
      MessageType.CHAT,
      player.id(),
    );
  }

  private applyJamBreakerCommand(player: Player, ticks: number): void {
    const cooldownUntil =
      this.jamBreakerCooldownUntil.get(player.smallID()) ?? 0;
    if (ticks < cooldownUntil) {
      return;
    }
    if (player.gold() < this.jamBreakerGoldCost) {
      const shortfall = this.jamBreakerGoldCost - player.gold();
      this.game.displayMessage(
        `Jam Breaker requires ${this.jamBreakerGoldCost.toLocaleString()} gold (short ${shortfall.toLocaleString()}).`,
        MessageType.ATTACK_FAILED,
        player.id(),
      );
      return;
    }
    player.removeGold(this.jamBreakerGoldCost);
    this.game.stats().defenseFactoryJamBreaker(player);
    this.jamBreakerCooldownUntil.set(
      player.smallID(),
      ticks + this.jamBreakerCooldownTicksEffective(),
    );

    let deniedPulse = false;
    for (const [playerID, beacon] of this.beacons.entries()) {
      if (playerID === player.smallID()) continue;
      const other = this.game.playerBySmallID(playerID);
      if (!other.isPlayer() || player.isFriendly(other)) continue;
      if (beacon.maskedUntil > ticks) {
        deniedPulse = true;
      }
      beacon.maskedUntil = Math.min(
        beacon.maskedUntil,
        ticks + this.jamBreakerMaskClampTicks,
      );
      beacon.charge = Math.max(0, beacon.charge - 20);
    }

    const anchor = player.spawnTile();
    if (anchor !== undefined) {
      this.emitActivity(
        "jam_breaker",
        anchor,
        player.smallID(),
        null,
        "Jam Breaker triggered",
        150,
      );
      this.contributeToSquadObjective(player, ticks, anchor);
    }
    this.updateExecutionChainPulseDeny(player, ticks, deniedPulse);
    this.game.displayMessage(
      "Jam Breaker active: enemy intel masking pulse duration reduced.",
      MessageType.CHAT,
      player.id(),
    );
  }

  private updateComebackState(ticks: number): void {
    const players = this.game.players().filter((player) => player.isAlive());
    if (players.length <= 1) return;

    const avgStrength =
      players.reduce(
        (acc, player) => acc + this.playerStrengthScore(player),
        0,
      ) / players.length;
    if (avgStrength <= 0) return;

    const minute8Tick = this.game.config().numSpawnPhaseTurns() + 4_800;

    for (const player of players) {
      const playerID = player.smallID();
      const ratio = this.playerStrengthScore(player) / avgStrength;
      const behind = ratio < this.surgeBehindThresholdRatio;
      const started = this.behindSinceTick.get(playerID) ?? -1;
      const surgeUntil = this.surgeUntilTick.get(playerID) ?? 0;

      if (behind) {
        if (started < 0) {
          this.behindSinceTick.set(playerID, ticks);
        } else if (
          ticks - started >= this.surgeActivationHoldTicks &&
          ticks >= surgeUntil
        ) {
          const nextSurgeUntil = ticks + this.surgeDurationTicks;
          this.surgeUntilTick.set(playerID, nextSurgeUntil);
          this.behindSinceTick.set(playerID, ticks);
          const anchor = player.spawnTile();
          if (anchor !== undefined) {
            this.emitActivity(
              "comeback_surge",
              anchor,
              playerID,
              null,
              "Comeback surge active",
              140,
            );
          }
          this.game.stats().comebackSurgeActivated(player);
          this.game.displayMessage(
            "Comeback Surge active: extra bonus on vault recapture and convoy interceptions.",
            MessageType.CHAT,
            player.id(),
          );
        }
      } else {
        this.behindSinceTick.set(playerID, -1);
      }

      if (
        ticks >= minute8Tick &&
        !this.minute8BehindMarked.has(playerID) &&
        behind
      ) {
        this.minute8BehindMarked.add(playerID);
        this.game.stats().minute8Behind(player);
      }
    }
  }

  private playerStrengthScore(player: Player): number {
    const tiles = Math.max(1, player.numTilesOwned());
    const troops = Math.max(1, player.troops());
    const gold = Math.max(1, Number(player.gold()));
    return tiles * 0.45 + troops * 0.35 + Math.sqrt(gold) * 0.2;
  }

  private tickVaultSites(ticks: number): void {
    for (const site of this.vaultSites) {
      this.syncPassiveOwner(site);
      this.tickVaultPassiveIncome(site, ticks);

      if (site.cooldownTicks > 0) {
        site.cooldownTicks--;
        const reopenWindowTicks = Math.min(
          200,
          Math.floor(this.vaultCooldownTicksEffective() * 0.33),
        );
        if (site.cooldownTicks <= reopenWindowTicks) {
          const challenger = this.game.owner(site.tile);
          if (
            challenger.isPlayer() &&
            site.passiveOwnerID !== null &&
            challenger.smallID() !== site.passiveOwnerID
          ) {
            site.cooldownTicks = 0;
            site.reducedRewardNextCapture = true;
          }
        }
        if (site.cooldownTicks > 0) {
          continue;
        }
      }

      const owner = this.game.owner(site.tile);
      if (!owner.isPlayer()) {
        site.controllerID = null;
        site.controlTicks = 0;
        continue;
      }

      if (site.controllerID !== owner.smallID()) {
        site.controllerID = owner.smallID();
        site.controlTicks = 1;
      } else {
        site.controlTicks++;
      }

      if (site.controlTicks < this.vaultCaptureTicks) {
        continue;
      }

      this.emitActivity(
        "vault_captured",
        site.tile,
        owner.smallID(),
        null,
        `Vault ${site.id} captured`,
        150,
      );
      this.game.stats().vaultCaptured(owner);
      this.game.stats().vaultInteraction(owner);
      this.applyCaptureSurgeBonus(owner, site);
      this.updateExecutionChainCapture(owner, ticks);
      this.openSquadObjectiveWindow(owner, site, ticks);

      this.startConvoy(
        owner,
        site,
        ticks,
        site.reducedRewardNextCapture ? 0.72 : 1,
      );
      site.controllerID = null;
      site.controlTicks = 0;
      site.cooldownTicks = this.vaultCooldownTicksEffective();
      site.passiveOwnerID = owner.smallID();
      site.nextPassiveGoldTick =
        ticks + this.vaultPassiveIncomeIntervalTicksEffective();
      site.reducedRewardNextCapture = false;
    }
  }

  private syncPassiveOwner(site: VaultSite): void {
    if (site.passiveOwnerID === null) {
      return;
    }
    const owner = this.game.playerBySmallID(site.passiveOwnerID);
    const tileOwner = this.game.owner(site.tile);
    if (
      !owner.isPlayer() ||
      !owner.isAlive() ||
      !tileOwner.isPlayer() ||
      tileOwner.smallID() !== site.passiveOwnerID
    ) {
      site.passiveOwnerID = null;
      site.nextPassiveGoldTick = 0;
      site.reducedRewardNextCapture = false;
    }
  }

  private tickVaultPassiveIncome(site: VaultSite, ticks: number): void {
    if (site.passiveOwnerID === null || ticks < site.nextPassiveGoldTick) {
      return;
    }
    const owner = this.game.playerBySmallID(site.passiveOwnerID);
    if (!owner.isPlayer() || !owner.isAlive()) {
      site.passiveOwnerID = null;
      site.nextPassiveGoldTick = 0;
      return;
    }

    const passiveGold = this.vaultPassiveGoldPerMinuteEffective();
    owner.addGold(passiveGold, site.tile);
    this.game.stats().vaultPassiveGold(owner, passiveGold);
    this.game.displayMessage(
      `Vault ${site.id} generated +${passiveGold.toLocaleString()} gold passive income.`,
      MessageType.RECEIVED_GOLD_FROM_TRADE,
      owner.id(),
      passiveGold,
    );
    this.emitActivity(
      "vault_passive_income",
      site.tile,
      owner.smallID(),
      null,
      `Vault ${site.id} passive +${this.bigintToSafeNumber(passiveGold).toLocaleString()}g`,
      120,
    );
    site.nextPassiveGoldTick =
      ticks + this.vaultPassiveIncomeIntervalTicksEffective();
  }

  private hasSurgeActive(player: Player): boolean {
    return (this.surgeUntilTick.get(player.smallID()) ?? 0) > this.game.ticks();
  }

  private applyCaptureSurgeBonus(player: Player, site: VaultSite): void {
    if (!this.hasSurgeActive(player)) {
      return;
    }
    player.addGold(this.surgeCaptureGoldBonus, site.tile);
    this.game.displayMessage(
      `Comeback Surge bonus: +${this.surgeCaptureGoldBonus} gold from vault recapture.`,
      MessageType.RECEIVED_GOLD_FROM_TRADE,
      player.id(),
      this.surgeCaptureGoldBonus,
    );
  }

  private applyInterceptSurgeBonus(interceptor: Player, tile: TileRef): void {
    if (!this.hasSurgeActive(interceptor)) {
      return;
    }
    const bonus = BigInt(
      Math.floor(30_000 * this.surgeInterceptGoldMultiplier),
    );
    interceptor.addGold(bonus, tile);
    interceptor.addTroops(650);
    this.game.displayMessage(
      "Comeback Surge bonus: interception reward amplified.",
      MessageType.CHAT,
      interceptor.id(),
    );
  }

  private vaultCooldownTicksEffective(): number {
    if (this.weeklyMutator === "accelerated_cooldowns") {
      return Math.max(260, Math.floor(this.vaultCooldownTicks * 0.75));
    }
    return this.vaultCooldownTicks;
  }

  private vaultPassiveIncomeIntervalTicksEffective(): number {
    if (this.weeklyMutator === "double_passive") {
      return Math.max(
        300,
        Math.floor(this.vaultPassiveIncomeIntervalTicks * 0.5),
      );
    }
    return this.vaultPassiveIncomeIntervalTicks;
  }

  private vaultPassiveGoldPerMinuteEffective(): bigint {
    if (this.weeklyMutator === "double_passive") {
      return this.vaultPassiveGoldPerMinute * 2n;
    }
    return this.vaultPassiveGoldPerMinute;
  }

  private beaconPulseCooldownTicksEffective(): number {
    if (this.weeklyMutator === "accelerated_cooldowns") {
      return Math.max(180, Math.floor(this.beaconPulseCooldownTicks * 0.75));
    }
    return this.beaconPulseCooldownTicks;
  }

  private jamBreakerCooldownTicksEffective(): number {
    if (this.weeklyMutator === "accelerated_cooldowns") {
      return Math.max(480, Math.floor(this.jamBreakerCooldownTicks * 0.75));
    }
    return this.jamBreakerCooldownTicks;
  }

  private escortDurationTicksEffective(): number {
    if (this.weeklyMutator === "accelerated_cooldowns") {
      return 460;
    }
    return 600;
  }

  private laneFogActivitySuppressed(
    activity:
      | "vault_captured"
      | "vault_passive_income"
      | "convoy_launched"
      | "convoy_rerouted"
      | "convoy_escorted"
      | "convoy_intercepted"
      | "convoy_delivered"
      | "beacon_pulse"
      | "jam_breaker"
      | "comeback_surge",
  ): boolean {
    return (
      this.weeklyMutator === "lane_fog" &&
      (activity === "convoy_launched" ||
        activity === "convoy_rerouted" ||
        activity === "convoy_escorted")
    );
  }

  private resetExecutionChain(playerID: number): void {
    this.executionChainStep.set(playerID, 0);
    this.executionChainExpiresAtTick.set(playerID, 0);
  }

  private updateExecutionChainCapture(player: Player, ticks: number): void {
    const playerID = player.smallID();
    this.executionChainStep.set(playerID, 1);
    this.executionChainExpiresAtTick.set(
      playerID,
      ticks + this.cleanExecutionChainWindowTicks,
    );
  }

  private updateExecutionChainConvoyDelivered(
    player: Player,
    ticks: number,
  ): void {
    const playerID = player.smallID();
    const step = this.executionChainStep.get(playerID) ?? 0;
    const expiresAt = this.executionChainExpiresAtTick.get(playerID) ?? 0;
    if (step !== 1 || ticks > expiresAt) {
      this.resetExecutionChain(playerID);
      return;
    }
    this.executionChainStep.set(playerID, 2);
    this.executionChainExpiresAtTick.set(
      playerID,
      ticks + this.cleanExecutionChainWindowTicks,
    );
  }

  private updateExecutionChainPulseDeny(
    player: Player,
    ticks: number,
    deniedPulse: boolean,
  ): void {
    const playerID = player.smallID();
    if (!deniedPulse) return;
    const step = this.executionChainStep.get(playerID) ?? 0;
    const expiresAt = this.executionChainExpiresAtTick.get(playerID) ?? 0;
    if (step !== 2 || ticks > expiresAt) {
      this.resetExecutionChain(playerID);
      return;
    }
    this.executionStreakNextConvoyMultiplier.set(
      playerID,
      this.cleanExecutionStreakConvoyMultiplier,
    );
    this.game.stats().cleanExecutionStreak(player);
    this.resetExecutionChain(playerID);
    this.game.displayMessage(
      `Clean execution chain complete. Next Vault Convoy rewards +${Math.round((this.cleanExecutionStreakConvoyMultiplier - 1) * 100)}%.`,
      MessageType.CHAT,
      player.id(),
    );
  }

  private sweepExpiredSquadObjectives(ticks: number): void {
    this.squadObjectiveWindows = this.squadObjectiveWindows.filter(
      (window) => window.expiresAtTick > ticks && !window.rewarded,
    );
  }

  private openSquadObjectiveWindow(
    owner: Player,
    site: VaultSite,
    ticks: number,
  ): void {
    this.squadObjectiveWindows.push({
      siteID: site.id,
      ownerID: owner.smallID(),
      anchorTile: site.tile,
      expiresAtTick: ticks + this.squadObjectiveWindowTicks,
      participants: new Set([owner.smallID()]),
      rewarded: false,
    });
  }

  private contributeToSquadObjective(
    actor: Player,
    ticks: number,
    tile: TileRef,
  ): void {
    this.sweepExpiredSquadObjectives(ticks);
    for (const window of this.squadObjectiveWindows) {
      if (window.rewarded || ticks > window.expiresAtTick) continue;
      const owner = this.game.playerBySmallID(window.ownerID);
      if (!owner.isPlayer() || !owner.isAlive()) continue;
      if (owner.smallID() !== actor.smallID() && !owner.isFriendly(actor))
        continue;
      if (
        this.game.manhattanDist(tile, window.anchorTile) >
        this.squadObjectiveRadius
      ) {
        continue;
      }
      window.participants.add(actor.smallID());
      if (window.participants.size < 2) continue;
      window.rewarded = true;
      for (const participantID of window.participants) {
        const participant = this.game.playerBySmallID(participantID);
        if (!participant.isPlayer() || !participant.isAlive()) continue;
        participant.addGold(this.squadObjectiveGoldBonus, window.anchorTile);
        participant.addTroops(this.squadObjectiveTroopsBonus);
        this.game.stats().squadObjectiveCompleted(participant);
        this.game.displayMessage(
          "Squad objective complete: coordinated Vault window bonus awarded.",
          MessageType.CHAT,
          participant.id(),
          this.squadObjectiveGoldBonus,
        );
      }
    }
  }

  private strengthAdjustmentMultiplier(player: Player): number {
    const alive = this.game.players().filter((p) => p.isAlive());
    if (alive.length === 0) return 1;
    const avgStrength =
      alive.reduce((acc, p) => acc + this.playerStrengthScore(p), 0) /
      alive.length;
    if (avgStrength <= 0.01) return 1;
    const ratio = this.playerStrengthScore(player) / avgStrength;
    return Math.max(0.72, Math.min(1.22, 1.04 - (ratio - 1) * 0.34));
  }

  private phaseAdjustmentMultiplier(ticks: number): number {
    const elapsedAfterSpawn = Math.max(
      0,
      ticks - this.game.config().numSpawnPhaseTurns(),
    );
    if (elapsedAfterSpawn < 2_400) return 1.06;
    if (elapsedAfterSpawn < 7_200) return 1;
    return 0.97;
  }

  private routeRiskScore(
    owner: Player,
    source: TileRef,
    destination: TileRef,
  ): number {
    const srcX = this.game.x(source);
    const srcY = this.game.y(source);
    const dstX = this.game.x(destination);
    const dstY = this.game.y(destination);

    let hostileSamples = 0;
    const samples = 9;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const x = Math.round(srcX + (dstX - srcX) * t);
      const y = Math.round(srcY + (dstY - srcY) * t);
      if (!this.game.isValidCoord(x, y)) continue;
      const tileOwner = this.game.owner(this.game.ref(x, y));
      if (
        tileOwner.isPlayer() &&
        tileOwner.smallID() !== owner.smallID() &&
        !owner.isFriendly(tileOwner)
      ) {
        hostileSamples++;
      }
    }
    const baseRisk = hostileSamples / samples;
    if (this.weeklyMutator === "lane_fog") {
      return Math.min(1, baseRisk + 0.08);
    }
    return baseRisk;
  }

  private convoyRewardPlan(
    owner: Player,
    distance: number,
    routeRisk: number,
    ticks: number,
    rewardScale: number,
  ): RewardPlan {
    const tuning = this.game.config().vaultConvoyRewardTuning();
    const strengthMultiplier = this.strengthAdjustmentMultiplier(owner);
    const phaseMultiplier = this.phaseAdjustmentMultiplier(ticks);
    const riskMultiplier =
      tuning.riskMultiplierBase + routeRisk * tuning.riskMultiplierScale;
    const rewardMultiplier = Math.max(
      tuning.rewardMultiplierMin,
      Math.min(
        tuning.rewardMultiplierMax,
        strengthMultiplier * phaseMultiplier * riskMultiplier * rewardScale,
      ),
    );

    const alive = this.game.players().filter((p) => p.isAlive());
    const avgStrength =
      alive.length > 0
        ? alive.reduce((acc, p) => acc + this.playerStrengthScore(p), 0) /
          alive.length
        : this.playerStrengthScore(owner);
    const ownerStrength = this.playerStrengthScore(owner);
    const baselineGold = Math.max(
      tuning.minGoldReward,
      Math.floor(
        (ownerStrength * tuning.baselineGoldOwnerStrengthScale +
          avgStrength * tuning.baselineGoldAvgStrengthScale) *
          (tuning.baselineGoldRiskBase +
            routeRisk * tuning.baselineGoldRiskScale),
      ),
    );
    const distanceGold = Math.max(
      tuning.distanceGoldMin,
      Math.floor(
        (ownerStrength * tuning.distanceGoldOwnerStrengthScale +
          tuning.distanceGoldFlat) *
          (tuning.distanceGoldRiskBase +
            routeRisk * tuning.distanceGoldRiskScale),
      ),
    );

    const goldReward = BigInt(
      Math.floor((baselineGold + distance * distanceGold) * rewardMultiplier),
    );
    const troopsReward = Math.max(
      tuning.minTroopsReward,
      Math.floor(
        (Math.sqrt(Math.max(1, baselineGold)) * tuning.troopsSqrtGoldScale +
          distance *
            (tuning.troopsDistanceBase +
              routeRisk * tuning.troopsDistanceRiskScale)) *
          rewardMultiplier,
      ),
    );

    const rewardMath =
      `Gold=(${baselineGold}+${distance}*${distanceGold})x${rewardMultiplier.toFixed(2)} | ` +
      `Troops=max(${tuning.minTroopsReward},f(distance,risk)x${rewardMultiplier.toFixed(2)})`;

    return {
      goldReward,
      troopsReward,
      rewardMultiplier,
      rewardScale,
      strengthMultiplier,
      phaseMultiplier,
      riskMultiplier,
      rewardMath,
    };
  }

  private startConvoy(
    owner: Player,
    site: VaultSite,
    ticks: number,
    rewardScale: number,
  ): void {
    const streakMultiplier =
      this.executionStreakNextConvoyMultiplier.get(owner.smallID()) ?? 1;
    const finalRewardScale = rewardScale * streakMultiplier;
    this.executionStreakNextConvoyMultiplier.set(owner.smallID(), 1);
    const preferred = this.preferredConvoyDestination.get(owner.smallID());
    const destinationTile = this.bestConvoyDestination(
      owner,
      site.tile,
      preferred,
    );
    const distance = this.game.manhattanDist(site.tile, destinationTile);
    const travelTicks = Math.max(60, Math.min(320, Math.floor(distance / 2)));
    const routeRisk = this.routeRiskScore(owner, site.tile, destinationTile);
    const rewardPlan = this.convoyRewardPlan(
      owner,
      distance,
      routeRisk,
      ticks,
      finalRewardScale,
    );
    const escorted =
      (this.escortUntilTick.get(owner.smallID()) ?? 0) > ticks ? 1 : 0;

    this.convoys.push({
      id: this.nextConvoyID++,
      ownerID: owner.smallID(),
      sourceTile: site.tile,
      destinationTile,
      ticksRemaining: travelTicks,
      totalTicks: travelTicks,
      goldReward: rewardPlan.goldReward,
      troopsReward: rewardPlan.troopsReward,
      rewardMultiplier: rewardPlan.rewardMultiplier,
      rewardScale: rewardPlan.rewardScale,
      strengthMultiplier: rewardPlan.strengthMultiplier,
      phaseMultiplier: rewardPlan.phaseMultiplier,
      riskMultiplier: rewardPlan.riskMultiplier,
      routeRisk,
      routeDistance: distance,
      rewardMath: rewardPlan.rewardMath,
      escortShield: escorted,
      reroutes: 0,
    });
    this.game.stats().vaultConvoyLaunched(owner);
    this.game.stats().vaultInteraction(owner);

    this.game.displayMessage(
      `Vault site ${site.id} breached. Extraction Vault Convoy launched.`,
      MessageType.ATTACK_REQUEST,
      null,
    );
    this.game.displayMessage(
      `Your Vault Convoy departs. ETA ${Math.ceil(travelTicks / 10)}s.`,
      MessageType.RECEIVED_GOLD_FROM_TRADE,
      owner.id(),
      rewardPlan.goldReward,
    );
    if (streakMultiplier > 1) {
      this.game.displayMessage(
        `Execution streak bonus applied (+${Math.round((streakMultiplier - 1) * 100)}% convoy rewards).`,
        MessageType.CHAT,
        owner.id(),
      );
    }

    this.emitActivity(
      "convoy_launched",
      site.tile,
      owner.smallID(),
      null,
      `Vault Convoy launched from vault ${site.id}`,
      130,
    );
    this.debugVault("start_convoy", {
      convoyID: this.nextConvoyID - 1,
      ownerID: owner.smallID(),
      siteID: site.id,
      sourceTile: site.tile,
      destinationTile,
      etaSeconds: Math.ceil(travelTicks / 10),
      routeRisk,
      routeDistance: distance,
      rewardGold: this.bigintToSafeNumber(rewardPlan.goldReward),
      rewardTroops: rewardPlan.troopsReward,
      rewardScale: rewardPlan.rewardScale,
    });
  }

  private bestConvoyDestination(
    owner: Player,
    sourceTile: TileRef,
    preferredType?: UnitType,
    commandHint?:
      | "reroute_city"
      | "reroute_port"
      | "reroute_factory"
      | "reroute_silo"
      | "reroute_safest",
  ): TileRef {
    const allStructures = owner.units(
      UnitType.City,
      UnitType.Port,
      UnitType.Factory,
      UnitType.MissileSilo,
    );
    if (allStructures.length === 0) {
      return owner.spawnTile() ?? sourceTile;
    }

    const preferredStructures =
      preferredType === undefined
        ? allStructures
        : allStructures.filter(
            (structure) => structure.type() === preferredType,
          );
    const structures =
      preferredStructures.length > 0 ? preferredStructures : allStructures;

    if (commandHint === "reroute_safest") {
      let safest = structures[0].tile();
      let safestRisk = Number.POSITIVE_INFINITY;
      let safestDistance = Number.POSITIVE_INFINITY;
      for (const structure of structures) {
        const tile = structure.tile();
        const risk = this.routeRiskScore(owner, sourceTile, tile);
        const dist = this.game.manhattanDist(sourceTile, tile);
        if (
          risk < safestRisk ||
          (Math.abs(risk - safestRisk) < 0.0001 && dist < safestDistance)
        ) {
          safest = tile;
          safestRisk = risk;
          safestDistance = dist;
        }
      }
      return safest;
    }

    let best = structures[0].tile();
    let bestDist = this.game.manhattanDist(best, sourceTile);
    for (const structure of structures) {
      const d = this.game.manhattanDist(sourceTile, structure.tile());
      if (d < bestDist) {
        best = structure.tile();
        bestDist = d;
      }
    }
    return best;
  }

  private tickConvoys(ticks: number): void {
    const remaining: VaultConvoy[] = [];

    for (const convoy of this.convoys) {
      const owner = this.game.playerBySmallID(convoy.ownerID);
      if (!owner.isPlayer() || !owner.isAlive()) {
        continue;
      }

      const currentTile = this.convoyProgressTile(convoy);
      const interceptor = this.hostileOwnerAtTile(owner, currentTile);
      if (interceptor) {
        const escortActive =
          (this.escortUntilTick.get(owner.smallID()) ?? 0) > ticks;
        if (escortActive && convoy.escortShield > 0) {
          convoy.escortShield -= 1;
          this.game.displayMessage(
            "Vault Convoy escort evaded an intercept attempt.",
            MessageType.CHAT,
            owner.id(),
          );
          this.game.displayMessage(
            `${owner.displayName()}'s Vault Convoy escaped with escort support.`,
            MessageType.ATTACK_REQUEST,
            interceptor.id(),
          );
          remaining.push(convoy);
          continue;
        }

        const gold = convoy.goldReward / 2n;
        const troops = Math.floor(convoy.troopsReward / 2);

        interceptor.addGold(gold, currentTile);
        interceptor.addTroops(troops);
        this.applyInterceptSurgeBonus(interceptor, currentTile);
        this.game.stats().vaultConvoyIntercepted(interceptor);
        this.game.stats().vaultConvoyLost(owner);
        this.game.stats().vaultInteraction(interceptor);
        this.resetExecutionChain(owner.smallID());
        this.contributeToSquadObjective(interceptor, ticks, currentTile);

        this.game.displayMessage(
          `You captured a Vault Convoy in transit from ${owner.displayName()} (+${gold.toLocaleString()} gold, +${troops.toLocaleString()} troops).`,
          MessageType.CAPTURED_ENEMY_UNIT,
          interceptor.id(),
          gold,
        );
        this.game.displayMessage(
          `${interceptor.displayName()} captured your Vault Convoy (enemy gained +${gold.toLocaleString()} gold, +${troops.toLocaleString()} troops).`,
          MessageType.UNIT_CAPTURED_BY_ENEMY,
          owner.id(),
        );

        this.emitActivity(
          "convoy_intercepted",
          currentTile,
          interceptor.smallID(),
          owner.smallID(),
          `Convoy intercepted +${gold.toLocaleString()}g +${troops.toLocaleString()}t`,
          150,
        );
        continue;
      }

      convoy.ticksRemaining--;
      if (convoy.ticksRemaining > 0) {
        remaining.push(convoy);
        continue;
      }

      owner.addGold(convoy.goldReward, convoy.destinationTile);
      owner.addTroops(convoy.troopsReward);
      this.game.stats().vaultConvoyDelivered(owner);
      this.game.stats().vaultInteraction(owner);
      this.updateExecutionChainConvoyDelivered(owner, ticks);
      this.contributeToSquadObjective(owner, ticks, convoy.destinationTile);

      this.game.displayMessage(
        `Vault Convoy delivered (+${convoy.goldReward.toLocaleString()} gold, +${convoy.troopsReward.toLocaleString()} troops).`,
        MessageType.RECEIVED_GOLD_FROM_TRADE,
        owner.id(),
        convoy.goldReward,
      );

      this.emitActivity(
        "convoy_delivered",
        convoy.destinationTile,
        owner.smallID(),
        null,
        `Convoy delivered +${convoy.goldReward.toLocaleString()}g +${convoy.troopsReward.toLocaleString()}t`,
        130,
      );
    }

    this.convoys = remaining;
  }

  private tickCountersurveillance(ticks: number): void {
    for (const player of this.game.players()) {
      const playerID = player.smallID();
      const factoryCount = player.unitCount(UnitType.Factory);
      const cityCount = player.unitCount(UnitType.City);

      let state = this.beacons.get(playerID);
      if (!state) {
        state = {
          charge: 0,
          cooldownUntil: 0,
          maskedUntil: 0,
        };
        this.beacons.set(playerID, state);
      }

      const chargeGain = 0.05 + factoryCount * 0.12 + cityCount * 0.01;
      state.charge = Math.min(this.beaconChargeCap, state.charge + chargeGain);

      if (factoryCount <= 0 || !player.isAlive()) {
        continue;
      }
      if (ticks < state.cooldownUntil) {
        continue;
      }
      if (state.charge < this.beaconTriggerCost) {
        continue;
      }

      const anchorTile = this.pickBeaconAnchorTile(player);
      if (anchorTile === undefined) {
        continue;
      }

      state.charge -= this.beaconTriggerCost;
      state.cooldownUntil = ticks + this.beaconPulseCooldownTicksEffective();
      state.maskedUntil = ticks + this.beaconPulseDurationTicks;
      state.anchorTile = anchorTile;

      const pulseSeconds = Math.ceil(this.beaconPulseDurationTicks / 10);
      this.game.displayMessage(
        `Defense Factory pulse active: troop intel hidden for ${pulseSeconds}s.`,
        MessageType.CHAT,
        player.id(),
      );

      for (const other of this.game.players()) {
        if (other.smallID() === playerID) {
          continue;
        }
        this.game.displayMessage(
          `${player.displayName()} activated a Defense Factory pulse. Their troop intel is obscured temporarily.`,
          MessageType.ATTACK_REQUEST,
          other.id(),
        );
      }

      this.emitActivity(
        "beacon_pulse",
        anchorTile,
        playerID,
        null,
        "Defense Factory pulse",
        140,
      );
      this.contributeToSquadObjective(player, ticks, anchorTile);
      this.game
        .stats()
        .defenseFactoryPulse(player, this.beaconPulseDurationTicks);
    }
  }

  private pickBeaconAnchorTile(player: Player): TileRef | undefined {
    const factories = player
      .units(UnitType.Factory)
      .filter((unit) => !unit.isUnderConstruction());
    if (factories.length > 0) {
      return this.random.randElement(factories).tile();
    }
    return player.spawnTile();
  }

  private hostileOwnerAtTile(owner: Player, tile: TileRef): Player | null {
    const tileOwner = this.game.owner(tile);
    if (!tileOwner.isPlayer()) {
      return null;
    }
    if (tileOwner.smallID() === owner.smallID()) {
      return null;
    }
    if (tileOwner.isFriendly(owner)) {
      return null;
    }
    return tileOwner;
  }

  private convoyProgressTile(convoy: VaultConvoy): TileRef {
    const srcX = this.game.x(convoy.sourceTile);
    const srcY = this.game.y(convoy.sourceTile);
    const dstX = this.game.x(convoy.destinationTile);
    const dstY = this.game.y(convoy.destinationTile);

    const progress =
      convoy.totalTicks > 0
        ? Math.max(
            0,
            Math.min(
              1,
              (convoy.totalTicks - convoy.ticksRemaining) / convoy.totalTicks,
            ),
          )
        : 1;

    const x = Math.max(
      0,
      Math.min(
        this.game.width() - 1,
        Math.round(srcX + (dstX - srcX) * progress),
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        this.game.height() - 1,
        Math.round(srcY + (dstY - srcY) * progress),
      ),
    );
    return this.game.ref(x, y);
  }

  private emitActivity(
    activity:
      | "vault_captured"
      | "vault_passive_income"
      | "convoy_launched"
      | "convoy_rerouted"
      | "convoy_escorted"
      | "convoy_intercepted"
      | "convoy_delivered"
      | "beacon_pulse"
      | "jam_breaker"
      | "comeback_surge",
    tile: TileRef,
    sourcePlayerID: number | null,
    targetPlayerID: number | null,
    label: string,
    durationTicks: number,
  ): void {
    if (this.laneFogActivitySuppressed(activity)) {
      return;
    }
    const tuning = this.game.config().vaultConvoyRewardTuning();
    const liveTicks = Math.max(
      0,
      this.game.ticks() - this.game.config().numSpawnPhaseTurns(),
    );
    if (liveTicks < tuning.lowSignalEarlyWindowTicks) {
      const lowSignal =
        activity === "convoy_launched" ||
        activity === "convoy_rerouted" ||
        activity === "convoy_escorted";
      if (lowSignal) {
        return;
      }
    }
    this.game.addUpdate({
      type: GameUpdateType.VaultFrontActivity,
      activity,
      tile,
      sourcePlayerID,
      targetPlayerID,
      label,
      durationTicks,
    });
  }

  private projectedSiteReward(site: VaultSite): {
    projectedGoldReward: number;
    projectedTroopsReward: number;
    projectedRewardMultiplier: number;
    projectedRewardScale: number;
    projectedStrengthMultiplier: number;
    projectedPhaseMultiplier: number;
    projectedRiskMultiplier: number;
    projectedDistance: number;
    projectedRisk: number;
    rewardMath: string;
  } {
    const tileOwner = this.game.owner(site.tile);
    const candidate =
      (site.passiveOwnerID !== null
        ? this.game.playerBySmallID(site.passiveOwnerID)
        : site.controllerID !== null
          ? this.game.playerBySmallID(site.controllerID)
          : tileOwner) ?? tileOwner;
    const owner =
      candidate && candidate.isPlayer() && candidate.isAlive()
        ? candidate
        : (this.game.players().find((p) => p.isAlive()) ?? null);
    const tuning = this.game.config().vaultConvoyRewardTuning();
    if (!owner) {
      return {
        projectedGoldReward: tuning.minGoldReward,
        projectedTroopsReward: tuning.minTroopsReward,
        projectedRewardMultiplier: 1,
        projectedRewardScale: 1,
        projectedStrengthMultiplier: 1,
        projectedPhaseMultiplier: 1,
        projectedRiskMultiplier: 1,
        projectedDistance: 0,
        projectedRisk: 0,
        rewardMath: "Reward model unavailable",
      };
    }
    const preferred = this.preferredConvoyDestination.get(owner.smallID());
    const destination = this.bestConvoyDestination(owner, site.tile, preferred);
    const distance = this.game.manhattanDist(site.tile, destination);
    const risk = this.routeRiskScore(owner, site.tile, destination);
    const rewardScale = site.reducedRewardNextCapture ? 0.72 : 1;
    const plan = this.convoyRewardPlan(
      owner,
      distance,
      risk,
      this.game.ticks(),
      rewardScale,
    );
    return {
      projectedGoldReward: this.bigintToSafeNumber(plan.goldReward),
      projectedTroopsReward: plan.troopsReward,
      projectedRewardMultiplier: plan.rewardMultiplier,
      projectedRewardScale: plan.rewardScale,
      projectedStrengthMultiplier: plan.strengthMultiplier,
      projectedPhaseMultiplier: plan.phaseMultiplier,
      projectedRiskMultiplier: plan.riskMultiplier,
      projectedDistance: distance,
      projectedRisk: risk,
      rewardMath: plan.rewardMath,
    };
  }

  private buildConvoyReroutePreviews(
    owner: Player,
    convoy: VaultConvoy,
    ticks: number,
  ): Array<{
    command:
      | "reroute_city"
      | "reroute_port"
      | "reroute_factory"
      | "reroute_silo"
      | "reroute_safest";
    destinationTile: TileRef;
    etaSeconds: number;
    routeRisk: number;
    routeDistance: number;
    rewardMultiplier: number;
    rewardScale: number;
    strengthMultiplier: number;
    phaseMultiplier: number;
    riskMultiplier: number;
    goldReward: number;
    troopsReward: number;
    rewardMath: string;
    deltaGold: number;
    deltaTroops: number;
    deltaEtaSeconds: number;
    deltaRisk: number;
  }> {
    const currentTile = this.convoyProgressTile(convoy);
    const currentEta = Math.ceil(convoy.ticksRemaining / 10);
    const currentGold = this.bigintToSafeNumber(convoy.goldReward);
    const currentTroops = convoy.troopsReward;
    const commands = [
      "reroute_city",
      "reroute_port",
      "reroute_factory",
      "reroute_silo",
      "reroute_safest",
    ] as const;

    return commands.map((command) => {
      const preferred = this.commandUnitType(command);
      const destinationTile = this.bestConvoyDestination(
        owner,
        currentTile,
        preferred,
        command,
      );
      const distance = this.game.manhattanDist(currentTile, destinationTile);
      const travelTicks = Math.max(35, Math.min(320, Math.floor(distance / 2)));
      const routeRisk = this.routeRiskScore(
        owner,
        currentTile,
        destinationTile,
      );
      const plan = this.convoyRewardPlan(
        owner,
        distance,
        routeRisk,
        ticks,
        convoy.rewardScale,
      );
      const gold = this.bigintToSafeNumber(plan.goldReward);
      const troops = plan.troopsReward;
      const etaSeconds = Math.ceil(travelTicks / 10);
      return {
        command,
        destinationTile,
        etaSeconds,
        routeRisk,
        routeDistance: distance,
        rewardMultiplier: plan.rewardMultiplier,
        rewardScale: plan.rewardScale,
        strengthMultiplier: plan.strengthMultiplier,
        phaseMultiplier: plan.phaseMultiplier,
        riskMultiplier: plan.riskMultiplier,
        goldReward: gold,
        troopsReward: troops,
        rewardMath: plan.rewardMath,
        deltaGold: gold - currentGold,
        deltaTroops: troops - currentTroops,
        deltaEtaSeconds: etaSeconds - currentEta,
        deltaRisk: routeRisk - convoy.routeRisk,
      };
    });
  }

  private publishStatusUpdate(): void {
    const statusUpdate: VaultFrontStatusUpdate = {
      type: GameUpdateType.VaultFrontStatus,
      weeklyMutator: this.weeklyMutator,
      captureTicksRequired: this.vaultCaptureTicks,
      cooldownTicksTotal: this.vaultCooldownTicksEffective(),
      passiveGoldPerMinute: this.bigintToSafeNumber(
        this.vaultPassiveGoldPerMinuteEffective(),
      ),
      jamBreakerGoldCost: this.bigintToSafeNumber(this.jamBreakerGoldCost),
      escortDurationTicks: this.escortDurationTicksEffective(),
      sites: this.vaultSites.map((site) => {
        const projected = this.projectedSiteReward(site);
        return {
          id: site.id,
          tile: site.tile,
          controllerID: site.controllerID,
          controlTicks: site.controlTicks,
          cooldownTicks: site.cooldownTicks,
          passiveOwnerID: site.passiveOwnerID,
          nextPassiveIncomeTick: site.nextPassiveGoldTick,
          reducedRewardNextCapture: site.reducedRewardNextCapture,
          projectedGoldReward: projected.projectedGoldReward,
          projectedTroopsReward: projected.projectedTroopsReward,
          projectedRewardMultiplier: projected.projectedRewardMultiplier,
          projectedRewardScale: projected.projectedRewardScale,
          projectedStrengthMultiplier: projected.projectedStrengthMultiplier,
          projectedPhaseMultiplier: projected.projectedPhaseMultiplier,
          projectedRiskMultiplier: projected.projectedRiskMultiplier,
          projectedDistance: projected.projectedDistance,
          projectedRisk: projected.projectedRisk,
          rewardMath: projected.rewardMath,
        };
      }),
      convoys: this.convoys.map((convoy) => {
        const owner = this.game.playerBySmallID(convoy.ownerID);
        const reroutePreviews =
          owner && owner.isPlayer()
            ? this.buildConvoyReroutePreviews(owner, convoy, this.game.ticks())
            : [];
        return {
          id: convoy.id,
          ownerID: convoy.ownerID,
          sourceTile: convoy.sourceTile,
          destinationTile: convoy.destinationTile,
          ticksRemaining: convoy.ticksRemaining,
          totalTicks: convoy.totalTicks,
          escortShield: convoy.escortShield,
          goldReward: this.bigintToSafeNumber(convoy.goldReward),
          troopsReward: convoy.troopsReward,
          rewardMultiplier: convoy.rewardMultiplier,
          rewardScale: convoy.rewardScale,
          strengthMultiplier: convoy.strengthMultiplier,
          phaseMultiplier: convoy.phaseMultiplier,
          riskMultiplier: convoy.riskMultiplier,
          routeRisk: convoy.routeRisk,
          routeDistance: convoy.routeDistance,
          rewardMath: convoy.rewardMath,
          reroutePreviews,
        };
      }),
      beacons: [...this.beacons.entries()].map(([playerID, state]) => {
        const player = this.game.playerBySmallID(playerID);
        const factoryCount =
          player && player.isPlayer() ? player.unitCount(UnitType.Factory) : 0;
        return {
          playerID,
          charge: state.charge,
          cooldownUntilTick: state.cooldownUntil,
          maskedUntilTick: state.maskedUntil,
          jamBreakerCooldownUntilTick:
            this.jamBreakerCooldownUntil.get(playerID) ?? 0,
          escortUntilTick: this.escortUntilTick.get(playerID) ?? 0,
          anchorTile: state.anchorTile,
          factoryCount,
        };
      }),
    };
    this.game.addUpdate(statusUpdate);
    this.debugPublishedStatus(statusUpdate);
  }

  private vaultDebugEnabled(): boolean {
    return (
      (
        globalThis as {
          __OPENFRONT_VAULT_DEBUG__?: boolean;
          __VAULTFRONT_DEBUG__?: boolean;
        }
      ).__OPENFRONT_VAULT_DEBUG__ === true ||
      (
        globalThis as {
          __OPENFRONT_VAULT_DEBUG__?: boolean;
          __VAULTFRONT_DEBUG__?: boolean;
        }
      ).__VAULTFRONT_DEBUG__ === true
    );
  }

  private debugVault(stage: string, payload: Record<string, unknown>): void {
    if (!this.vaultDebugEnabled()) return;
    console.debug(`[VaultFrontExecution:${stage}]`, payload);
  }

  private debugPublishedStatus(statusUpdate: {
    convoys: Array<{
      id: number;
      ownerID: number;
      sourceTile: TileRef;
      destinationTile: TileRef;
      goldReward: number;
      troopsReward: number;
    }>;
    sites: Array<{
      id: number;
      controllerID: number | null;
      passiveOwnerID: number | null;
      cooldownTicks: number;
    }>;
  }): void {
    const key = statusUpdate.convoys
      .map(
        (convoy) =>
          `${convoy.id}:${convoy.ownerID}:${convoy.sourceTile}:${convoy.destinationTile}`,
      )
      .join("|");
    if (key === this.lastPublishedConvoyDebugKey) return;
    this.lastPublishedConvoyDebugKey = key;
    this.debugVault("publish_status", {
      convoyCount: statusUpdate.convoys.length,
      convoys: statusUpdate.convoys.map((convoy) => ({
        id: convoy.id,
        ownerID: convoy.ownerID,
        sourceTile: convoy.sourceTile,
        destinationTile: convoy.destinationTile,
        goldReward: convoy.goldReward,
        troopsReward: convoy.troopsReward,
      })),
      sites: statusUpdate.sites.map((site) => ({
        id: site.id,
        controllerID: site.controllerID,
        passiveOwnerID: site.passiveOwnerID,
        cooldownTicks: site.cooldownTicks,
      })),
    });
  }

  private bigintToSafeNumber(value: bigint): number {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (value >= max) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (value <= 0n) {
      return 0;
    }
    return Number(value);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
