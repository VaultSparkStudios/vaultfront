/**
 * DiscordNotifier — sends structured webhook messages to a Discord channel.
 *
 * Configure via environment:
 *   DISCORD_WEBHOOK_URL — full Discord webhook URL (optional; disabled if unset)
 *
 * All methods are fire-and-forget and never throw — webhook failures are logged
 * but never propagate to game logic.
 */

import { Logger } from "./Logger";

const webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? "";

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

async function send(embeds: DiscordEmbed[]): Promise<void> {
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });
    if (!res.ok) {
      Logger.warn(`Discord webhook returned ${res.status}`);
    }
  } catch (err) {
    Logger.warn("Discord webhook failed", { err });
  }
}

// Color palette matching VaultFront brand
const Colors = {
  gold: 0xffc400,
  blue: 0x1fa2ff,
  orange: 0xff7a00,
  green: 0x22c55e,
  red: 0xef4444,
  gray: 0x6b7280,
};

export const DiscordNotifier = {
  /**
   * Notify when a new game lobby opens.
   */
  gameStarted(gameId: string, playerCount: number, mapName: string): void {
    send([
      {
        title: "New Game Started",
        color: Colors.blue,
        fields: [
          { name: "Game ID", value: `\`${gameId}\``, inline: true },
          { name: "Players", value: String(playerCount), inline: true },
          { name: "Map", value: mapName, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify when a vault is captured by a player.
   */
  vaultCaptured(
    gameId: string,
    playerName: string,
    vaultIndex: number,
  ): void {
    send([
      {
        title: "Vault Captured",
        description: `**${playerName}** captured Vault #${vaultIndex + 1}`,
        color: Colors.gold,
        fields: [{ name: "Game", value: `\`${gameId}\``, inline: true }],
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify when a convoy successfully delivers its payload.
   */
  convoyDelivered(
    gameId: string,
    playerName: string,
    goldDelivered: bigint,
  ): void {
    send([
      {
        title: "Convoy Delivered",
        description: `**${playerName}** delivered **${(goldDelivered / 1000n).toString()}k gold**`,
        color: Colors.orange,
        fields: [{ name: "Game", value: `\`${gameId}\``, inline: true }],
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify when an execution chain combo is triggered (rare/skill event).
   */
  executionChainTriggered(gameId: string, playerName: string): void {
    send([
      {
        title: "Execution Chain Triggered",
        description: `**${playerName}** completed the 3-step combo for a +20% convoy bonus`,
        color: Colors.green,
        fields: [{ name: "Game", value: `\`${gameId}\``, inline: true }],
        footer: { text: "Capture → Deliver → Jam" },
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify when a game ends with the final winner.
   */
  gameEnded(gameId: string, winnerName: string, durationSeconds: number): void {
    const mins = Math.floor(durationSeconds / 60);
    send([
      {
        title: "Game Over",
        description: `**${winnerName}** won the match`,
        color: Colors.gold,
        fields: [
          { name: "Game", value: `\`${gameId}\``, inline: true },
          { name: "Duration", value: `${mins}m`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify on server startup.
   */
  serverStarted(version: string, env: string): void {
    send([
      {
        title: "VaultFront Server Started",
        color: Colors.gray,
        fields: [
          { name: "Version", value: version, inline: true },
          { name: "Env", value: env, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ]);
  },
};
