/**
 * DiscordNotifier — sends structured webhook messages to a Discord channel.
 *
 * Configure via environment:
 *   DISCORD_WEBHOOK_URL — full Discord webhook URL (optional; disabled if unset)
 *
 * All methods are fire-and-forget and never throw — webhook failures are logged
 * but never propagate to game logic.
 */

import { logger as Logger } from "./Logger";

const webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? "";
const DELIVERY_TIMEOUT_MS = 3_500;
const MAX_IN_FLIGHT = 4;

export interface DiscordNotificationPosture {
  enabled: boolean;
  timeoutMs: number;
  maxInFlight: number;
  inFlight: number;
  delivered: number;
  failed: number;
  dropped: number;
  lastStatus: number | null;
}

const deliveryPosture: DiscordNotificationPosture = {
  enabled: webhookUrl.length > 0,
  timeoutMs: DELIVERY_TIMEOUT_MS,
  maxInFlight: MAX_IN_FLIGHT,
  inFlight: 0,
  delivered: 0,
  failed: 0,
  dropped: 0,
  lastStatus: null,
};

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

function boundedText(value: unknown, maxLength: number): string {
  const withoutControls = Array.from(String(value ?? ""), (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
      ? " "
      : character;
  }).join("");
  return withoutControls
    .replace(/\s{3,}/g, "  ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeDiscordEmbeds(embeds: DiscordEmbed[]): DiscordEmbed[] {
  return embeds.slice(0, 10).map((embed) => ({
    ...(embed.title ? { title: boundedText(embed.title, 256) } : {}),
    ...(embed.description
      ? { description: boundedText(embed.description, 2_048) }
      : {}),
    ...(embed.color !== undefined ? { color: embed.color } : {}),
    ...(embed.fields
      ? {
          fields: embed.fields.slice(0, 25).map((field) => ({
            name: boundedText(field.name, 256),
            value: boundedText(field.value, 1_024),
            ...(field.inline !== undefined ? { inline: field.inline } : {}),
          })),
        }
      : {}),
    ...(embed.footer
      ? { footer: { text: boundedText(embed.footer.text, 2_048) } }
      : {}),
    ...(embed.timestamp ? { timestamp: embed.timestamp } : {}),
  }));
}

export function discordNotificationPosture(): Readonly<DiscordNotificationPosture> {
  return { ...deliveryPosture };
}

async function send(embeds: DiscordEmbed[]): Promise<void> {
  if (!webhookUrl) return;
  if (deliveryPosture.inFlight >= MAX_IN_FLIGHT) {
    deliveryPosture.dropped += 1;
    Logger.warn("Discord webhook delivery dropped at concurrency limit");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  deliveryPosture.inFlight += 1;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: normalizeDiscordEmbeds(embeds),
        allowed_mentions: {
          parse: [],
          users: [],
          roles: [],
          replied_user: false,
        },
      }),
      signal: controller.signal,
    });
    deliveryPosture.lastStatus = res.status;
    if (!res.ok) {
      deliveryPosture.failed += 1;
      Logger.warn(`Discord webhook returned ${res.status}`);
    } else {
      deliveryPosture.delivered += 1;
    }
  } catch (error) {
    deliveryPosture.failed += 1;
    Logger.warn("Discord webhook failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    clearTimeout(timeout);
    deliveryPosture.inFlight -= 1;
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
  vaultCaptured(gameId: string, playerName: string, vaultIndex: number): void {
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

  /**
   * Notify when a player unlocks an achievement.
   */
  achievementUnlocked(
    playerName: string,
    achievementName: string,
    achievementDesc: string,
  ): void {
    send([
      {
        title: "Achievement Unlocked",
        description: `**${playerName}** unlocked **${achievementName}**`,
        color: Colors.gold,
        footer: { text: achievementDesc },
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Announce the weekly mutator that is now active.
   */
  weeklyMutatorAnnounced(
    mutatorName: string,
    mutatorDesc: string,
    weekNumber: number,
  ): void {
    send([
      {
        title: `⚡ Weekly Mutator — Week ${weekNumber}`,
        description: `**${mutatorName}** is now active\n${mutatorDesc}`,
        color: Colors.gold,
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Announce that a community vote is open for next week's mutator.
   */
  weeklyVoteOpened(
    candidates: Array<{ key: string; name: string }>,
    closesAt: Date,
  ): void {
    const emojiNumbers = ["1️⃣", "2️⃣", "3️⃣"];
    const lines = candidates
      .slice(0, 3)
      .map((c, i) => `${emojiNumbers[i] ?? `${i + 1}.`} **${c.name}**`);
    const description =
      lines.join("\n") +
      "\n\nReact with 1️⃣ 2️⃣ 3️⃣ to vote for next week's mutator.";
    send([
      {
        title: "🗳️ Vote: Next Week's Mutator",
        description,
        color: Colors.blue,
        footer: { text: `Vote closes ${closesAt.toISOString()}` },
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Post the result of the community vote.
   */
  voteResultPosted(
    winnerName: string,
    votes: number,
    totalVotes: number,
  ): void {
    send([
      {
        title: "🏆 Community Vote Result",
        description: `**${winnerName}** wins with ${votes}/${totalVotes} votes`,
        color: Colors.green,
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify when a surge window activates for a player who has been behind.
   */
  surgeActivated(gameId: string, playerName: string): void {
    send([
      {
        title: "Comeback Surge Activated",
        description: `**${playerName}** triggered a surge window — +20% rewards for 2 minutes`,
        color: Colors.orange,
        fields: [{ name: "Game", value: `\`${gameId}\``, inline: true }],
        footer: { text: "Behind for 6+ minutes → surge window open" },
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify when a squad objective window is successfully completed.
   */
  squadObjectiveCompleted(
    gameId: string,
    participants: string[],
    siteIndex: number,
  ): void {
    const names = participants.slice(0, 4).join(", ");
    const extra =
      participants.length > 4 ? ` (+${participants.length - 4} more)` : "";
    send([
      {
        title: "Squad Objective Completed",
        description: `Joint capture of Vault #${siteIndex + 1} by **${names}${extra}**`,
        color: Colors.green,
        fields: [{ name: "Game", value: `\`${gameId}\``, inline: true }],
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Notify when a player reaches a convoy delivery milestone (every 10 deliveries).
   */
  convoyMilestoneReached(
    gameId: string,
    playerName: string,
    totalDeliveries: number,
  ): void {
    send([
      {
        title: `${totalDeliveries} Convoy Deliveries`,
        description: `**${playerName}** has delivered **${totalDeliveries} convoys** across all matches`,
        color: Colors.gold,
        fields: [{ name: "Game", value: `\`${gameId}\``, inline: true }],
        timestamp: new Date().toISOString(),
      },
    ]);
  },

  /**
   * Alert when anti-cheat signals exceed the configured threshold.
   */
  antiCheatAlert(count: number, summary: string): void {
    send([
      {
        title: `🚨 Anti-Cheat Alert — ${count} flagged match${count === 1 ? "" : "es"}`,
        description: `**${count} new flagged match${count === 1 ? "" : "es"}** detected in the last poll window.\n\n${summary}`,
        color: Colors.red,
        footer: { text: "Review via /api/admin/anti-cheat/flagged" },
        timestamp: new Date().toISOString(),
      },
    ]);
  },
};
