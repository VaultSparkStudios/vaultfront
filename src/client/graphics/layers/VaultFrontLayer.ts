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

    this.drawConvoys(ctx);
    this.drawVaultSites(ctx);
    this.drawBeaconFields(ctx);
    this.drawActivityPings(ctx);
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
        ctx.fillText(`Passive +gold in ${passiveSecs}s`, screen.x + 13, screen.y + 8);
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
      ctx.lineDashOffset = reducedMotion ? 0 : -((this.game.ticks() % 24) * 0.75);
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
      const glowPulse = reducedMotion ? 0.55 : 0.45 + ((this.game.ticks() % 30) / 30) * 0.5;
      ctx.fillStyle = `rgba(250, 204, 21, ${0.08 + glowPulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(dst.x, dst.y, this.markerSize() * (2.2 + glowPulse), 0, Math.PI * 2);
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
      ctx.fillText(`Vault Convoy ETA ${etaSeconds}s${shieldLabel}`, midX, midY - 8);
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

      const secondsLeft = Math.max(0, Math.ceil((beacon.maskedUntilTick - now) / 10));
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

  private markerSize(): number {
    return Math.max(4, Math.min(12, this.transform.scale * 2.8));
  }

  private fontSize(): number {
    return Math.max(10, Math.min(18, this.transform.scale * 4.4));
  }
}
