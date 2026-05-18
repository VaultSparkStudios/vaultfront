/**
 * NarratorBus — streams AI-generated match commentary to spectators.
 *
 * Architecture:
 * - Subscribes to game activity events batched per game
 * - Calls Claude Haiku every 15s max per game to generate 1-sentence commentary
 * - Broadcasts SSE lines to subscribed HTTP clients (spectators)
 * - Clients connect via GET /api/vaultfront/narrator/:gameId?persona=hype|tactical|comedic
 * - Each spectator can choose their own commentary persona; commentary is per-group
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import { logger as Logger } from "./Logger";

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  anthropic ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    dangerouslyAllowBrowser: process.env.NODE_ENV === "test",
  });
  return anthropic;
}

export type NarratorPersona = "hype" | "tactical" | "comedic";

const PERSONA_PROMPTS: Record<NarratorPersona, string> = {
  hype: "You are a hype live sports commentator for VaultFront, a real-time strategy game. Generate ONE sentence of exciting broadcast commentary (max 100 characters). Tone: energetic, present-tense, exclamation-heavy, crowd-pumping. No emojis, no quotes.",
  tactical:
    "You are a tactical analyst commentating VaultFront, a real-time strategy game. Generate ONE sentence of incisive strategic commentary (max 100 characters). Tone: precise, observational, focused on decision-making and implications. No emojis, no quotes.",
  comedic:
    "You are a comedic color commentator for VaultFront, a real-time strategy game. Generate ONE sentence of witty commentary (max 100 characters). Tone: dry, playful, finds the absurd angle in every event. No emojis, no quotes.",
};

const RATE_LIMIT_MS = 15_000; // 15s minimum between calls per game
const MAX_PENDING_EVENTS = 12;
const MAX_COMMENTARY_CHARS = 140;

interface GameNarratorState {
  clients: Map<Response, NarratorPersona>;
  lastCallMs: number;
  lastCommentaryByPersona: Map<NarratorPersona, string>;
  pendingEvents: string[];
  timer: ReturnType<typeof setTimeout> | null;
  /** NarratorContextSnapshot — injected by Worker.ts for contextual commentary */
  context: NarratorContextSnapshot | null;
}

export interface NarratorContextSnapshot {
  tickBucket: "early" | "mid" | "late";
  leadingPlayer: string;
  siteBalance: string;
  mutator: string;
}

export class NarratorBus {
  private games = new Map<string, GameNarratorState>();

  private getOrCreate(gameId: string): GameNarratorState {
    if (!this.games.has(gameId)) {
      this.games.set(gameId, {
        clients: new Map(),
        lastCallMs: 0,
        lastCommentaryByPersona: new Map(),
        pendingEvents: [],
        timer: null,
        context: null,
      });
    }
    return this.games.get(gameId)!;
  }

  subscribe(
    gameId: string,
    res: Response,
    persona: NarratorPersona = "hype",
  ): void {
    const state = this.getOrCreate(gameId);
    state.clients.set(res, persona);

    res.on("close", () => {
      state.clients.delete(res);
      if (state.clients.size === 0) {
        this.cleanup(gameId);
      }
    });

    res.write(`data: ${JSON.stringify({ type: "connected", persona })}\n\n`);
    const lastCommentary = state.lastCommentaryByPersona.get(persona);
    if (lastCommentary) {
      res.write(
        `data: ${JSON.stringify({ type: "commentary", text: lastCommentary, persona, replay: true })}\n\n`,
      );
    }
    Logger.info(`NarratorBus: client subscribed to ${gameId}`, {
      count: state.clients.size,
      persona,
    });
  }

  /** Queue an activity event for narration. */
  queueEvent(
    gameId: string,
    activityLabel: string,
    context?: NarratorContextSnapshot,
  ): void {
    if (!process.env.ANTHROPIC_API_KEY) return;
    const state = this.games.get(gameId);
    if (!state || state.clients.size === 0) return;

    if (context) state.context = context;

    if (state.pendingEvents[state.pendingEvents.length - 1] === activityLabel) {
      return;
    }
    state.pendingEvents.push(activityLabel);
    if (state.pendingEvents.length > MAX_PENDING_EVENTS) {
      state.pendingEvents.splice(
        0,
        state.pendingEvents.length - MAX_PENDING_EVENTS,
      );
    }

    if (state.timer) return; // already scheduled
    const delay = Math.max(0, RATE_LIMIT_MS - (Date.now() - state.lastCallMs));
    state.timer = setTimeout(() => void this.flush(gameId), delay);
    state.timer.unref?.();
  }

  private async flush(gameId: string): Promise<void> {
    const state = this.games.get(gameId);
    if (!state) return;
    state.timer = null;

    const events = [...new Set(state.pendingEvents.splice(0, 3))];
    if (events.length === 0) return;
    state.lastCallMs = Date.now();

    // Determine which personas have active subscribers
    const activePersonas = new Set(state.clients.values());
    if (activePersonas.size === 0) return;

    // Build context suffix for the user message
    const ctx = state.context;
    const contextSuffix = ctx
      ? ` [Phase: ${ctx.tickBucket}; Leader: ${ctx.leadingPlayer}; Sites: ${ctx.siteBalance}; Mutator: ${ctx.mutator}]`
      : "";
    const userContent = `Events: ${events.join("; ")}${contextSuffix}`;

    await Promise.allSettled(
      [...activePersonas].map((persona) =>
        this.flushForPersona(gameId, state, persona, userContent),
      ),
    );
  }

  private async flushForPersona(
    gameId: string,
    state: GameNarratorState,
    persona: NarratorPersona,
    userContent: string,
  ): Promise<void> {
    try {
      const msg = await getAnthropicClient().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system: [
          {
            type: "text",
            text: PERSONA_PROMPTS[persona],
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      });
      const commentary =
        (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";
      if (commentary) {
        const safeCommentary = commentary
          .replace(/\s+/g, " ")
          .slice(0, MAX_COMMENTARY_CHARS);
        state.lastCommentaryByPersona.set(persona, safeCommentary);
        this.broadcastToPersona(gameId, state, persona, {
          type: "commentary",
          text: safeCommentary,
          persona,
        });
      }
    } catch (err) {
      Logger.warn("NarratorBus: generation failed", { gameId, persona, err });
    }
  }

  private broadcastToPersona(
    gameId: string,
    state: GameNarratorState,
    persona: NarratorPersona,
    payload: object,
  ): void {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    const dead: Response[] = [];
    for (const [res, clientPersona] of state.clients) {
      if (clientPersona !== persona) continue;
      try {
        res.write(line);
      } catch {
        dead.push(res);
      }
    }
    dead.forEach((r) => state.clients.delete(r));
  }

  /** Broadcast a raw payload to ALL subscribers for a game (any persona). */
  broadcastRaw(gameId: string, payload: object): void {
    const state = this.games.get(gameId);
    if (!state) return;
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    const dead: Response[] = [];
    for (const [res] of state.clients) {
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
    for (const [res] of state.clients) {
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

  debugState(gameId: string): {
    subscribers: number;
    pendingEvents: number;
    hasLastCommentary: boolean;
  } {
    const state = this.games.get(gameId);
    return {
      subscribers: state?.clients.size ?? 0,
      pendingEvents: state?.pendingEvents.length ?? 0,
      hasLastCommentary: state?.lastCommentaryByPersona.size !== 0,
    };
  }
}

export const narratorBus = new NarratorBus();
