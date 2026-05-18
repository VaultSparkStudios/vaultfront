/**
 * NarratorBus — streams AI-generated match commentary to spectators.
 *
 * Architecture:
 * - Subscribes to game activity events batched per game
 * - Calls Claude Haiku every 15s max per game to generate 1-sentence commentary
 * - Broadcasts SSE lines to subscribed HTTP clients (spectators)
 * - Clients connect via GET /api/vaultfront/narrator/:gameId
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import { logger as Logger } from "./Logger";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

const NARRATOR_SYSTEM_PROMPT =
  "You are a live sports commentator for VaultFront, a real-time strategy game. Generate ONE sentence of exciting broadcast commentary (max 100 characters) based on the game event provided. Tone: energetic, present-tense, specific. No emojis, no quotes.";

const RATE_LIMIT_MS = 15_000; // 15s minimum between calls per game

interface GameNarratorState {
  clients: Set<Response>;
  lastCallMs: number;
  pendingEvents: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

export class NarratorBus {
  private games = new Map<string, GameNarratorState>();

  private getOrCreate(gameId: string): GameNarratorState {
    if (!this.games.has(gameId)) {
      this.games.set(gameId, {
        clients: new Set(),
        lastCallMs: 0,
        pendingEvents: [],
        timer: null,
      });
    }
    return this.games.get(gameId)!;
  }

  subscribe(gameId: string, res: Response): void {
    const state = this.getOrCreate(gameId);
    state.clients.add(res);

    res.on("close", () => {
      state.clients.delete(res);
      if (state.clients.size === 0) {
        this.cleanup(gameId);
      }
    });

    res.write('data: {"type":"connected"}\n\n');
    Logger.info(`NarratorBus: client subscribed to ${gameId}`, {
      count: state.clients.size,
    });
  }

  /** Queue an activity event for narration. */
  queueEvent(gameId: string, activityLabel: string): void {
    if (!process.env.ANTHROPIC_API_KEY) return;
    const state = this.games.get(gameId);
    if (!state || state.clients.size === 0) return;

    state.pendingEvents.push(activityLabel);

    if (state.timer) return; // already scheduled
    const delay = Math.max(0, RATE_LIMIT_MS - (Date.now() - state.lastCallMs));
    state.timer = setTimeout(() => void this.flush(gameId), delay);
  }

  private async flush(gameId: string): Promise<void> {
    const state = this.games.get(gameId);
    if (!state) return;
    state.timer = null;

    const events = state.pendingEvents.splice(0, 3); // max 3 events per call
    if (events.length === 0) return;
    state.lastCallMs = Date.now();

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system: [
          {
            type: "text",
            text: NARRATOR_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `Events: ${events.join("; ")}`,
          },
        ],
      });
      const commentary =
        (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";
      if (commentary) {
        this.broadcast(gameId, { type: "commentary", text: commentary });
      }
    } catch (err) {
      Logger.warn("NarratorBus: generation failed", { gameId, err });
    }
  }

  private broadcast(gameId: string, payload: object): void {
    const state = this.games.get(gameId);
    if (!state) return;
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    const dead: Response[] = [];
    for (const res of state.clients) {
      try {
        res.write(line);
      } catch {
        dead.push(res);
      }
    }
    dead.forEach((r) => state.clients.delete(r));
  }

  closeGame(gameId: string): void {
    const state = this.games.get(gameId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    const end = `data: ${JSON.stringify({ type: "game_over" })}\n\n`;
    for (const res of state.clients) {
      try {
        res.write(end);
        res.end();
      } catch {
        // ignore
      }
    }
    this.games.delete(gameId);
  }

  private cleanup(gameId: string): void {
    const state = this.games.get(gameId);
    if (state?.timer) clearTimeout(state.timer);
    this.games.delete(gameId);
  }
}

export const narratorBus = new NarratorBus();
