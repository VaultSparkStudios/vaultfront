/**
 * AntiCheatMonitor — polls for newly flagged matches and alerts via Discord.
 *
 * Configure:
 *   ANTI_CHEAT_ALERT_THRESHOLD — number of flags in the window before alerting (default: 3)
 *   ANTI_CHEAT_POLL_INTERVAL_MS — poll interval in ms (default: 1800000 = 30 min)
 */

import { DiscordNotifier } from "./DiscordNotifier";
import { logger as Logger } from "./Logger";
import { playerStatsStore } from "./PlayerStatsStore";

const THRESHOLD = Number(process.env.ANTI_CHEAT_ALERT_THRESHOLD ?? 3);
const INTERVAL_MS = Number(
  process.env.ANTI_CHEAT_POLL_INTERVAL_MS ?? 30 * 60 * 1000,
);

export class AntiCheatMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAlertedAt = 0;
  private seenGameIds = new Set<string>();

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), INTERVAL_MS);
    Logger.info("AntiCheatMonitor started", {
      threshold: THRESHOLD,
      intervalMs: INTERVAL_MS,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const rows = await playerStatsStore.getFlaggedMatches(100);
      const newRows = rows.filter((r) => !this.seenGameIds.has(r.gameId));

      for (const r of newRows) this.seenGameIds.add(r.gameId);

      if (newRows.length >= THRESHOLD) {
        const summary = newRows
          .slice(0, 5)
          .map(
            (r) =>
              `\`${r.persistentId.slice(0, 8)}…\` game \`${r.gameId.slice(0, 8)}…\` — stddev ${r.cmdStddevMs.toFixed(0)}ms`,
          )
          .join("\n");
        DiscordNotifier.antiCheatAlert(newRows.length, summary);
        this.lastAlertedAt = Date.now();
        Logger.warn("AntiCheatMonitor: threshold exceeded", {
          count: newRows.length,
        });
      }
    } catch (err) {
      Logger.warn("AntiCheatMonitor poll failed", { err });
    }
  }
}

export const antiCheatMonitor = new AntiCheatMonitor();
