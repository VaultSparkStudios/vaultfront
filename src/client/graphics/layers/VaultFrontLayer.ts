import { Cell } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import {
  GameUpdateType,
  VaultFrontActivityUpdate,
  VaultFrontStatusUpdate,
} from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

interface ActiveVaultFrontPing extends VaultFrontActivityUpdate {
  createdAtTick: number;
  expiresAtTick: number;
}

export class VaultFrontLayer implements Layer {
  private status: VaultFrontStatusUpdate | null = null;
  private activePings: ActiveVaultFrontPing[] = [];
  /** Tick at which the mutator banner was first shown (0 = not yet shown) */
  private mutatorBannerShownAtTick = 0;
  /** Duration in ticks for the mutator banner to display */
  private readonly mutatorBannerDurationTicks = 60; // ~6 seconds

  constructor(
    private game: GameView,
    private transform: TransformHandler,
  ) {}

  getTickIntervalMs(): number {
    return 100;
  }

  shouldTransform(): boolean {
    return false;
  }

  tick(): void {
    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    const statusUpdates = updates[
      GameUpdateType.VaultFrontStatus
    ] as VaultFrontStatusUpdate[];
    if (statusUpdates.length > 0) {
      this.status = statusUpdates[statusUpdates.length - 1];
    }

    const activityUpdates = updates[
      GameUpdateType.VaultFrontActivity
    ] as VaultFrontActivityUpdate[];
    const now = this.game.ticks();
    for (const ping of activityUpdates) {
      this.activePings.push({
        ...ping,
        createdAtTick: now,
        expiresAtTick: now + ping.durationTicks,
      });
    }

    this.activePings = this.activePings
      .filter((ping) => ping.expiresAtTick >= now)
      .slice(-24);
  }

  renderLayer(ctx: CanvasRenderingContext2D): void {
    if (!this.status && this.activePings.length === 0) {
      return;
    }

    this.drawSurgeOverlays(ctx);
    this.drawConvoys(ctx);
    this.drawVaultSites(ctx);
    this.drawBeaconFields(ctx);
    this.drawActivityPings(ctx);
    this.drawSquadObjectiveRings(ctx);
    this.drawExecutionChainHUD(ctx);
    this.drawSurgeHUD(ctx);
    this.drawMutatorBanner(ctx);
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  private drawVaultSites(ctx: CanvasRenderingContext2D): void {
    if (!this.status || this.status.sites.length === 0) return;

    const baseSize = this.markerSize();
    for (const site of this.status.sites) {
      const screen = this.screenForTile(site.tile);
      if (!screen) continue;

      const progress =
        this.status.captureTicksRequired > 0
          ? Math.max(
              0,
              Math.min(1, site.controlTicks / this.status.captureTicksRequired),
            )
          : 0;
      const cooldownRatio =
        this.status.cooldownTicksTotal > 0
          ? Math.max(
              0,
              Math.min(1, site.cooldownTicks / this.status.cooldownTicksTotal),
            )
          : 0;

      const cooldownSecs = Math.ceil(site.cooldownTicks / 10);
      const passiveSecs = Math.max(
        0,
        Math.ceil((site.nextPassiveIncomeTick - this.game.ticks()) / 10),
      );

      ctx.save();
      this.drawVaultIcon(
        ctx,
        screen.x,
        screen.y,
        baseSize,
        site.cooldownTicks > 0
          ? "cooldown"
          : site.controllerID !== null
            ? "capturing"
            : site.passiveOwnerID !== null
              ? "owned"
              : "neutral",
      );

      if (site.controllerID !== null && site.cooldownTicks <= 0) {
        ctx.strokeStyle = "rgba(251, 146, 60, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          screen.x,
          screen.y,
          baseSize + 5,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * progress,
        );
        ctx.stroke();
      } else if (site.cooldownTicks > 0) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          screen.x,
          screen.y,
          baseSize + 5,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * cooldownRatio,
        );
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `${Math.round(this.fontSize())}px Overpass, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`Vault ${site.id}`, screen.x + 13, screen.y - 8);
      if (site.cooldownTicks > 0) {
        ctx.fillStyle = "rgba(203, 213, 225, 0.92)";
        ctx.font = `${Math.round(this.fontSize() - 2)}px Overpass, sans-serif`;
        ctx.fillText(`Cooldown ${cooldownSecs}s`, screen.x + 13, screen.y + 8);
      } else if (site.passiveOwnerID !== null) {
        ctx.fillStyle = "rgba(167, 243, 208, 0.92)";
        ctx.font = `${Math.round(this.fontSize() - 2)}px Overpass, sans-serif`;
        ctx.fillText(
          `Passive +gold in ${passiveSecs}s`,
          screen.x + 13,
          screen.y + 8,
        );
      }
      ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
      ctx.font = `${Math.round(this.fontSize() - 3)}px Overpass, sans-serif`;
      ctx.fillText(
        `Est +${site.projectedGoldReward.toLocaleString()}g +${site.projectedTroopsReward.toLocaleString()}t`,
        screen.x + 13,
        screen.y + 22,
      );
      ctx.restore();
    }
  }

  private drawConvoys(ctx: CanvasRenderingContext2D): void {
    if (!this.status || this.status.convoys.length === 0) return;
    const reducedMotion = this.prefersReducedMotion();

    for (const convoy of this.status.convoys) {
      const src = this.screenForTile(convoy.sourceTile);
      const dst = this.screenForTile(convoy.destinationTile);
      if (!src || !dst) continue;

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

      const routeX = dst.x - src.x;
      const routeY = dst.y - src.y;
      const routeLen = Math.hypot(routeX, routeY);
      if (routeLen <= 0.01) continue;
      const angle = Math.atan2(routeY, routeX);

      ctx.save();
      const laneGradient = ctx.createLinearGradient(src.x, src.y, dst.x, dst.y);
      laneGradient.addColorStop(0, "rgba(253, 224, 71, 0.25)");
      laneGradient.addColorStop(0.5, "rgba(250, 204, 21, 0.82)");
      laneGradient.addColorStop(1, "rgba(253, 224, 71, 0.28)");
      ctx.strokeStyle = laneGradient;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = reducedMotion
        ? 0
        : -((this.game.ticks() % 24) * 0.75);
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(dst.x, dst.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;

      ctx.strokeStyle = "rgba(120, 53, 15, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y + 1.5);
      ctx.lineTo(dst.x, dst.y + 1.5);
      ctx.stroke();

      const convoyScale = Math.max(0.72, Math.min(1.5, this.markerSize() / 5));
      const glowPulse = reducedMotion
        ? 0.55
        : 0.45 + ((this.game.ticks() % 30) / 30) * 0.5;
      ctx.fillStyle = `rgba(250, 204, 21, ${0.08 + glowPulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(
        dst.x,
        dst.y,
        this.markerSize() * (2.2 + glowPulse),
        0,
        Math.PI * 2,
      );
      ctx.fill();

      const offsets = [0, 0.045, 0.09];
      for (let i = offsets.length - 1; i >= 0; i--) {
        const p = Math.max(0, progress - offsets[i]);
        const x = src.x + routeX * p;
        const y = src.y + routeY * p;
        this.drawConvoyTruck(
          ctx,
          x,
          y,
          angle,
          convoyScale,
          i === 0,
          convoy.escortShield > 0,
        );
      }

      const etaSeconds = Math.ceil(convoy.ticksRemaining / 10);
      const midX = src.x + (dst.x - src.x) * 0.5;
      const midY = src.y + (dst.y - src.y) * 0.5;
      ctx.fillStyle = "rgba(255, 248, 214, 0.95)";
      ctx.font = `${Math.round(this.fontSize() - 1)}px Overpass, sans-serif`;
      ctx.textAlign = "center";
      const shieldLabel =
        convoy.escortShield > 0 ? ` | Shield x${convoy.escortShield}` : "";
      ctx.fillText(
        `Vault Convoy ETA ${etaSeconds}s${shieldLabel}`,
        midX,
        midY - 8,
      );
      ctx.fillStyle = "rgba(255, 236, 179, 0.9)";
      ctx.font = `${Math.round(this.fontSize() - 3)}px Overpass, sans-serif`;
      ctx.fillText(
        `+${convoy.goldReward.toLocaleString()}g +${convoy.troopsReward.toLocaleString()}t`,
        midX,
        midY + 6,
      );
      ctx.restore();
    }
  }

  private drawBeaconFields(ctx: CanvasRenderingContext2D): void {
    if (!this.status || this.status.beacons.length === 0) return;

    const now = this.game.ticks();
    for (const beacon of this.status.beacons) {
      if (!beacon.anchorTile || beacon.factoryCount <= 0) {
        continue;
      }

      const screen = this.screenForTile(beacon.anchorTile);
      if (!screen) continue;

      const active = now < beacon.maskedUntilTick;
      const reducedMotion = this.prefersReducedMotion();
      const pulsePhase = reducedMotion ? 0 : (now % 50) / 50;
      const pulse = reducedMotion
        ? 0.35
        : Math.sin(pulsePhase * Math.PI * 2) * 0.5 + 0.5;
      const baseRadius = this.markerSize() * 1.7;
      const radius = baseRadius + pulse * 10;

      ctx.save();
      if (active) {
        ctx.strokeStyle = "rgba(96, 165, 250, 0.96)";
        ctx.fillStyle = "rgba(59, 130, 246, 0.18)";
        ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.78)";
        ctx.fillStyle = "rgba(71, 85, 105, 0.14)";
        ctx.lineWidth = 1.7;
      }

      ctx.beginPath();
      ctx.arc(screen.x, screen.y, active ? radius : baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const chargeRatio = Math.max(0, Math.min(1, beacon.charge / 100));
      ctx.strokeStyle = active
        ? "rgba(191, 219, 254, 0.95)"
        : "rgba(147, 197, 253, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        screen.x,
        screen.y,
        baseRadius + 3,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * chargeRatio,
      );
      ctx.stroke();

      const secondsLeft = Math.max(
        0,
        Math.ceil((beacon.maskedUntilTick - now) / 10),
      );
      const label = active
        ? `Defense Factory Active ${secondsLeft}s`
        : `Defense Factory Charge ${Math.floor(beacon.charge)}%`;
      ctx.fillStyle = "rgba(219, 234, 254, 0.95)";
      ctx.font = `${Math.round(this.fontSize() - 1)}px Overpass, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(label, screen.x + 12, screen.y + 5);
      ctx.restore();
    }
  }

  private drawActivityPings(ctx: CanvasRenderingContext2D): void {
    if (this.activePings.length === 0) return;
    const now = this.game.ticks();
    const reducedMotion = this.prefersReducedMotion();

    for (const ping of this.activePings) {
      const screen = this.screenForTile(ping.tile);
      if (!screen) continue;

      const total = Math.max(1, ping.durationTicks);
      const remaining = Math.max(0, ping.expiresAtTick - now);
      const ratio = remaining / total;
      const alpha = 0.2 + ratio * 0.8;
      const color = this.activityColor(ping.activity);
      const pulse = reducedMotion ? 1.25 : 1 + (1 - ratio) * 2.4;
      const radius = this.markerSize() * pulse;

      ctx.save();
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        screen.x,
        screen.y,
        Math.max(2, this.markerSize() * 0.5),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.25 + alpha * 0.6})`;
      ctx.fill();

      if (ping.activity === "convoy_delivered") {
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.max(0.35, alpha)})`;
        ctx.lineWidth = 1.3;
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6;
          const inner = this.markerSize() * 0.75;
          const outer = radius + this.markerSize() * 0.8;
          ctx.beginPath();
          ctx.moveTo(
            screen.x + Math.cos(angle) * inner,
            screen.y + Math.sin(angle) * inner,
          );
          ctx.lineTo(
            screen.x + Math.cos(angle) * outer,
            screen.y + Math.sin(angle) * outer,
          );
          ctx.stroke();
        }
      }

      if (ping.activity === "convoy_intercepted") {
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.max(0.4, alpha)})`;
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
          const angle = (Math.PI * 2 * i) / 5 + 0.35;
          const start = this.markerSize() * 0.35;
          const end = radius + this.markerSize() * 0.45;
          ctx.beginPath();
          ctx.moveTo(
            screen.x + Math.cos(angle) * start,
            screen.y + Math.sin(angle) * start,
          );
          ctx.lineTo(
            screen.x + Math.cos(angle) * end,
            screen.y + Math.sin(angle) * end,
          );
          ctx.stroke();
        }
      }

      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.4, alpha)})`;
      ctx.font = `${Math.round(this.fontSize() - 1)}px Overpass, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(ping.label, screen.x + 10, screen.y - 5);
      ctx.restore();
    }
  }

  private drawVaultIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    state: "neutral" | "capturing" | "cooldown" | "owned",
  ): void {
    const half = size * 0.9;
    const doorW = size * 0.72;
    const doorH = size * 0.72;

    const palette =
      state === "cooldown"
        ? {
            stroke: "rgba(148, 163, 184, 0.95)",
            fill: "rgba(71, 85, 105, 0.58)",
            door: "rgba(30, 41, 59, 0.88)",
          }
        : state === "capturing"
          ? {
              stroke: "rgba(251, 146, 60, 0.96)",
              fill: "rgba(249, 115, 22, 0.28)",
              door: "rgba(120, 53, 15, 0.85)",
            }
          : state === "owned"
            ? {
                stroke: "rgba(52, 211, 153, 0.96)",
                fill: "rgba(16, 185, 129, 0.24)",
                door: "rgba(6, 95, 70, 0.84)",
              }
            : {
                stroke: "rgba(34, 211, 238, 0.95)",
                fill: "rgba(34, 211, 238, 0.18)",
                door: "rgba(8, 47, 73, 0.82)",
              };

    ctx.lineWidth = 2.4;
    ctx.strokeStyle = palette.stroke;
    ctx.fillStyle = palette.fill;
    ctx.beginPath();
    ctx.moveTo(x - half * 0.7, y - half);
    ctx.lineTo(x + half * 0.7, y - half);
    ctx.lineTo(x + half, y - half * 0.7);
    ctx.lineTo(x + half, y + half * 0.7);
    ctx.lineTo(x + half * 0.7, y + half);
    ctx.lineTo(x - half * 0.7, y + half);
    ctx.lineTo(x - half, y + half * 0.7);
    ctx.lineTo(x - half, y - half * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.door;
    ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rect(x - doorW / 2, y - doorH / 2, doorW, doorH);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
    ctx.fill();
  }

  private drawConvoyTruck(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    scale: number,
    lead: boolean,
    escorted: boolean,
  ): void {
    const bodyW = 16 * scale;
    const bodyH = 8 * scale;
    const cabW = 6 * scale;
    const wheelR = 1.6 * scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = lead
      ? "rgba(251, 191, 36, 0.98)"
      : "rgba(253, 224, 71, 0.82)";
    ctx.strokeStyle = "rgba(120, 53, 15, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(245, 158, 11, 0.96)";
    ctx.beginPath();
    ctx.rect(bodyW / 2 - cabW, -bodyH / 2, cabW, bodyH * 0.82);
    ctx.fill();

    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.beginPath();
    ctx.rect(bodyW / 2 - cabW + 1, -bodyH / 2 + 1, cabW * 0.5, bodyH * 0.28);
    ctx.fill();

    ctx.fillStyle = "rgba(217, 119, 6, 0.9)";
    ctx.beginPath();
    ctx.rect(-bodyW * 0.28, -bodyH * 0.18, bodyW * 0.3, bodyH * 0.36);
    ctx.fill();

    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.beginPath();
    ctx.arc(-bodyW * 0.27, bodyH * 0.58, wheelR, 0, Math.PI * 2);
    ctx.arc(bodyW * 0.2, bodyH * 0.58, wheelR, 0, Math.PI * 2);
    ctx.fill();

    if (escorted) {
      ctx.strokeStyle = "rgba(147, 197, 253, 0.92)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, bodyW * 0.66, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private screenForTile(tile: TileRef): { x: number; y: number } | null {
    const world = new Cell(this.game.x(tile) + 0.5, this.game.y(tile) + 0.5);
    if (!this.transform.isOnScreen(world)) {
      return null;
    }
    return this.transform.worldToScreenCoordinates(world);
  }

  private activityColor(activity: VaultFrontActivityUpdate["activity"]): {
    r: number;
    g: number;
    b: number;
  } {
    switch (activity) {
      case "vault_captured":
        return { r: 34, g: 211, b: 238 };
      case "vault_passive_income":
        return { r: 52, g: 211, b: 153 };
      case "convoy_launched":
      case "convoy_rerouted":
      case "convoy_escorted":
      case "convoy_delivered":
        return { r: 250, g: 204, b: 21 };
      case "convoy_intercepted":
        return { r: 251, g: 113, b: 133 };
      case "beacon_pulse":
        return { r: 96, g: 165, b: 250 };
      case "jam_breaker":
        return { r: 244, g: 114, b: 182 };
      case "comeback_surge":
        return { r: 110, g: 231, b: 183 };
      default:
        return { r: 255, g: 255, b: 255 };
    }
  }

  /**
   * Draw squad objective rings on the map for all active windows.
   * A fading circle + timer arc centered on the vault tile.
   */
  private drawSquadObjectiveRings(ctx: CanvasRenderingContext2D): void {
    if (!this.status || this.status.squadObjectives.length === 0) return;
    const now = this.game.ticks();
    for (const obj of this.status.squadObjectives) {
      if (obj.rewarded || obj.expiresAtTick <= now) continue;
      const screen = this.screenForTile(obj.anchorTile);
      if (!screen) continue;

      const totalTicks = 520; // squad window duration from GAMEPLAY_DESIGN.md
      const remaining = obj.expiresAtTick - now;
      const ratio = Math.max(0, Math.min(1, remaining / totalTicks));
      const ringRadius = Math.max(24, this.transform.scale * 6);
      const alpha = 0.4 + ratio * 0.5;

      ctx.save();
      // Outer dashed ring
      ctx.strokeStyle = `rgba(167, 243, 208, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Timer arc (solid, fills clockwise as time runs out)
      ctx.strokeStyle = "rgba(52, 211, 153, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        screen.x,
        screen.y,
        ringRadius + 4,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * ratio,
      );
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(167, 243, 208, 0.95)";
      ctx.font = `bold ${Math.round(this.fontSize() - 1)}px Overpass, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("SQUAD", screen.x, screen.y - ringRadius - 8);
      const secsLeft = Math.ceil(remaining / 10);
      ctx.fillStyle = "rgba(209, 250, 229, 0.85)";
      ctx.font = `${Math.round(this.fontSize() - 3)}px Overpass, sans-serif`;
      ctx.fillText(`${secsLeft}s`, screen.x, screen.y + ringRadius + 14);
      ctx.restore();
    }
  }

  /**
   * Draw the execution chain combo meter in the bottom-right HUD corner.
   * Three nodes: [Capture] → [Deliver] → [Jam+Deny]
   * Active step lights up; a timer arc shows remaining window.
   */
  private drawExecutionChainHUD(ctx: CanvasRenderingContext2D): void {
    if (!this.status) return;
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;
    const chainState = this.status.executionChains[myPlayer.smallID()];
    if (!chainState || chainState.step === 0) return;

    const now = this.game.ticks();
    const remaining = chainState.expiresAtTick - now;
    if (remaining <= 0) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const baseX = w - 180;
    const baseY = h - 56;
    const nodeR = 10;
    const nodeSpacing = 44;
    const labels = ["CAPTURE", "DELIVER", "JAM"];

    ctx.save();
    // Background pill
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.beginPath();
    ctx.roundRect(baseX - 16, baseY - 28, 3 * nodeSpacing + 16, 52, 8);
    ctx.fill();

    // Connector lines
    for (let i = 0; i < 2; i++) {
      const x1 = baseX + i * nodeSpacing + nodeR;
      const x2 = baseX + (i + 1) * nodeSpacing - nodeR;
      ctx.strokeStyle =
        i + 1 < chainState.step
          ? "rgba(52, 211, 153, 0.9)"
          : "rgba(71, 85, 105, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, baseY);
      ctx.lineTo(x2, baseY);
      ctx.stroke();
    }

    // Nodes
    for (let i = 0; i < 3; i++) {
      const x = baseX + i * nodeSpacing;
      const filled = i + 1 <= chainState.step;
      const active = i + 1 === chainState.step;

      // Glow for active node
      if (active) {
        ctx.shadowColor = "rgba(52, 211, 153, 0.8)";
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = filled
        ? active
          ? "rgba(52, 211, 153, 0.95)"
          : "rgba(52, 211, 153, 0.6)"
        : "rgba(51, 65, 85, 0.8)";
      ctx.beginPath();
      ctx.arc(x, baseY, nodeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Node number
      ctx.fillStyle = filled
        ? "rgba(15, 23, 42, 0.9)"
        : "rgba(148,163,184,0.8)";
      ctx.font = `bold 9px Overpass, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x, baseY + 3.5);

      // Label below
      ctx.fillStyle = filled
        ? "rgba(167, 243, 208, 0.9)"
        : "rgba(100, 116, 139, 0.8)";
      ctx.font = `7px Overpass, sans-serif`;
      ctx.fillText(labels[i], x, baseY + 20);
    }

    // Timer arc around the pill
    const windowTicks = 1500; // cleanExecutionChainWindowTicks from GAMEPLAY_DESIGN.md
    const timerRatio = Math.max(0, Math.min(1, remaining / windowTicks));
    const timerX = baseX + nodeSpacing;
    ctx.strokeStyle = "rgba(52, 211, 153, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(
      timerX,
      baseY - 22,
      6,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * timerRatio,
    );
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw a surge active badge in the bottom-left HUD corner.
   * Pulses while active; shows countdown.
   */
  private drawSurgeHUD(ctx: CanvasRenderingContext2D): void {
    if (!this.status) return;
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;
    const surgeState = this.status.surges[myPlayer.smallID()];
    if (!surgeState?.active) return;

    const now = this.game.ticks();
    const remaining = surgeState.surgeUntilTick - now;
    if (remaining <= 0) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const x = 16;
    const y = h - 64;
    const pulse = 0.7 + 0.3 * Math.sin((now / 5) * Math.PI);
    const secsLeft = Math.ceil(remaining / 10);

    ctx.save();
    ctx.shadowColor = `rgba(52, 211, 153, ${pulse * 0.8})`;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = `rgba(52, 211, 153, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.roundRect(x, y, 148, 40, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgba(110, 231, 183, ${pulse})`;
    ctx.font = `bold 12px Overpass, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("⚡ SURGE ACTIVE", x + 10, y + 16);
    ctx.fillStyle = "rgba(167, 243, 208, 0.85)";
    ctx.font = `10px Overpass, sans-serif`;
    ctx.fillText(`+gold  +troops  ${secsLeft}s left`, x + 10, y + 30);
    ctx.restore();

    // Ignore the no-explicit-any note: ctx.canvas.width/height are always numbers
    void w; // used above
  }

  /**
   * One-time mutator banner shown at game start for ~6 seconds then fades.
   */
  private drawMutatorBanner(ctx: CanvasRenderingContext2D): void {
    if (!this.status || this.status.weeklyMutator === "none") return;

    const now = this.game.ticks();
    if (this.mutatorBannerShownAtTick === 0) {
      this.mutatorBannerShownAtTick = now;
    }

    const elapsed = now - this.mutatorBannerShownAtTick;
    if (elapsed >= this.mutatorBannerDurationTicks) return;

    const fadeInTicks = 10;
    const fadeOutStart = this.mutatorBannerDurationTicks - 15;
    let alpha: number;
    if (elapsed < fadeInTicks) {
      alpha = elapsed / fadeInTicks;
    } else if (elapsed > fadeOutStart) {
      alpha = 1 - (elapsed - fadeOutStart) / 15;
    } else {
      alpha = 1;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    const mutatorLabels: Record<string, { name: string; desc: string }> = {
      lane_fog: {
        name: "LANE FOG",
        desc: "Convoy activity hidden from feed  •  Routes +8% riskier",
      },
      accelerated_cooldowns: {
        name: "ACCELERATED COOLDOWNS",
        desc: "Vault cooldowns ×0.75  •  Beacon, jam, escort faster",
      },
      double_passive: {
        name: "DOUBLE PASSIVE",
        desc: "Passive vault income ×2  •  Interval halved",
      },
    };

    const label = mutatorLabels[this.status.weeklyMutator];
    if (!label) return;

    const w = ctx.canvas.width;
    const bannerW = Math.min(420, w - 32);
    const bx = (w - bannerW) / 2;
    const by = 16;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = "rgba(96, 165, 250, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bannerW, 52, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(147, 197, 253, 0.95)";
    ctx.font = `bold 11px Overpass, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("THIS WEEK'S MUTATOR", w / 2, by + 16);

    ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
    ctx.font = `bold 14px Overpass, sans-serif`;
    ctx.fillText(label.name, w / 2, by + 32);

    ctx.fillStyle = "rgba(203, 213, 225, 0.85)";
    ctx.font = `10px Overpass, sans-serif`;
    ctx.fillText(label.desc, w / 2, by + 46);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Pulsing amber territory glow for each player currently in comeback surge.
   * Drawn beneath all other overlays so it doesn't obscure icons or text.
   */
  private drawSurgeOverlays(ctx: CanvasRenderingContext2D): void {
    if (!this.status) return;
    const now = this.game.ticks();
    const pulse = 0.45 + 0.25 * Math.sin((now / 4) * Math.PI);
    const radius = Math.max(60, this.transform.scale * 28);

    for (const [smallIDStr, surgeState] of Object.entries(this.status.surges)) {
      if (!surgeState.active || surgeState.surgeUntilTick <= now) continue;

      const player = this.game.playerBySmallID(Number(smallIDStr));
      if (!player || !("nameLocation" in player)) continue;

      const loc = (
        player as { nameLocation(): { x: number; y: number } }
      ).nameLocation();
      const screen = this.transform.worldToScreenCoordinates(
        new Cell(loc.x, loc.y),
      );
      if (!screen) continue;

      const gradient = ctx.createRadialGradient(
        screen.x,
        screen.y,
        radius * 0.1,
        screen.x,
        screen.y,
        radius,
      );
      gradient.addColorStop(0, `rgba(251, 146, 60, ${pulse * 0.55})`);
      gradient.addColorStop(0.5, `rgba(245, 158, 11, ${pulse * 0.28})`);
      gradient.addColorStop(1, `rgba(251, 146, 60, 0)`);

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private markerSize(): number {
    return Math.max(4, Math.min(12, this.transform.scale * 2.8));
  }

  private fontSize(): number {
    return Math.max(10, Math.min(18, this.transform.scale * 4.4));
  }
}
