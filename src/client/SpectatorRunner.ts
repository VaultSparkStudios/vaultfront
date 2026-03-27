/**
 * SpectatorRunner — connects to a live game as a read-only observer.
 *
 * Architecture:
 * - Connects to wss://<host>/spectate/:gameId
 * - Receives binary turn payloads (same format as player turns)
 * - Feeds them to a local deterministic simulation worker
 * - The simulation output drives the existing GameRenderer (same as players)
 * - No intents are sent — the connection is receive-only
 *
 * Usage:
 *   const runner = new SpectatorRunner(gameId, eventBus);
 *   runner.connect();
 *
 * Status: SCAFFOLDED — integrate with ClientGameRunner.ts; reuse the
 * existing worker init flow with a `spectator: true` flag to suppress
 * intent sending.
 */

import { EventBus } from "../core/EventBus";

export class SpectatorRunner {
  private gameId: string;
  private eventBus: EventBus;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(gameId: string, eventBus: EventBus) {
    this.gameId = gameId;
    this.eventBus = eventBus;
  }

  connect(): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/spectate/${encodeURIComponent(this.gameId)}`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      console.info(`[SpectatorRunner] Connected to game ${this.gameId}`);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleTurnData(new Uint8Array(event.data));
      }
    };

    this.ws.onclose = (event) => {
      if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
        this.reconnectAttempts++;
        console.warn(
          `[SpectatorRunner] Disconnected, retrying in ${delay}ms (attempt ${this.reconnectAttempts})`,
        );
        setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[SpectatorRunner] WebSocket error", err);
    };
  }

  disconnect(): void {
    this.ws?.close(1000, "Spectator left");
    this.ws = null;
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
  }

  /**
   * Handle an incoming binary turn payload.
   * TODO: deserialize and dispatch to the local simulation worker.
   * Use the same deserialization path as ClientGameRunner.handleServerMessage().
   */
  private handleTurnData(data: Uint8Array): void {
    // Dispatch to the event bus so existing game update listeners receive it
    // without modification. This re-uses all existing rendering, HUD, and
    // vault layer logic without changes.
    this.eventBus.emit({ type: "spectator:turn", data });
  }
}
