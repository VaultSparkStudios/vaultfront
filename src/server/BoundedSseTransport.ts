import type { Response } from "express";

export interface BoundedSsePolicy {
  maxSubscribersPerGame: number;
  maxSubscribersPerWorker: number;
  maxSubscribersPerIp: number;
  maxQueuedEventsPerClient: number;
  maxQueuedBytesPerClient: number;
  drainTimeoutMs: number;
}

export interface BoundedSseCounters {
  accepted: number;
  rejectedPerGame: number;
  rejectedPerWorker: number;
  rejectedPerIp: number;
  backpressureSignals: number;
  queuedEvents: number;
  slowConsumerEvictions: number;
  writeFailures: number;
}

export type SseAdmission =
  | { accepted: true }
  | {
      accepted: false;
      reason: "game-capacity" | "worker-capacity" | "ip-capacity";
    };

interface ClientState {
  gameId: string;
  clientKey: string;
  response: Response;
  queue: string[];
  queuedBytes: number;
  blocked: boolean;
  drainTimer: ReturnType<typeof setTimeout> | null;
  onRemove: () => void;
}

const utf8Bytes = (value: string): number => Buffer.byteLength(value, "utf8");

/**
 * Process-local bounded Server-Sent Event transport.
 *
 * Express exposes Node's boolean write() backpressure signal. This registry
 * turns that signal into a bounded queue and deterministic slow-consumer
 * eviction instead of retaining responses indefinitely.
 */
export class BoundedSseTransport {
  private readonly clients = new Map<Response, ClientState>();
  private readonly counters: BoundedSseCounters = {
    accepted: 0,
    rejectedPerGame: 0,
    rejectedPerWorker: 0,
    rejectedPerIp: 0,
    backpressureSignals: 0,
    queuedEvents: 0,
    slowConsumerEvictions: 0,
    writeFailures: 0,
  };

  constructor(readonly policy: BoundedSsePolicy) {}

  admit(gameId: string, clientKey: string): SseAdmission {
    if (this.clients.size >= this.policy.maxSubscribersPerWorker) {
      return { accepted: false, reason: "worker-capacity" };
    }
    let gameCount = 0;
    let ipCount = 0;
    for (const client of this.clients.values()) {
      if (client.gameId === gameId) gameCount++;
      if (client.clientKey === clientKey) ipCount++;
    }
    if (gameCount >= this.policy.maxSubscribersPerGame) {
      return { accepted: false, reason: "game-capacity" };
    }
    if (ipCount >= this.policy.maxSubscribersPerIp) {
      return { accepted: false, reason: "ip-capacity" };
    }
    return { accepted: true };
  }

  subscribe(
    gameId: string,
    clientKey: string,
    response: Response,
    onRemove: () => void,
  ): SseAdmission {
    const admission = this.admit(gameId, clientKey);
    if (!admission.accepted) {
      if (admission.reason === "game-capacity") this.counters.rejectedPerGame++;
      if (admission.reason === "worker-capacity")
        this.counters.rejectedPerWorker++;
      if (admission.reason === "ip-capacity") this.counters.rejectedPerIp++;
      return admission;
    }
    const state: ClientState = {
      gameId,
      clientKey,
      response,
      queue: [],
      queuedBytes: 0,
      blocked: false,
      drainTimer: null,
      onRemove,
    };
    this.clients.set(response, state);
    this.counters.accepted++;
    response.on("close", () => this.remove(response));
    return admission;
  }

  write(response: Response, line: string): boolean {
    const client = this.clients.get(response);
    if (!client) return false;
    if (client.blocked) return this.enqueue(client, line);
    try {
      if (!response.write(line)) {
        client.blocked = true;
        this.counters.backpressureSignals++;
        this.armDrain(client);
      }
      return true;
    } catch {
      this.counters.writeFailures++;
      this.evict(client, false);
      return false;
    }
  }

  remove(response: Response): void {
    const client = this.clients.get(response);
    if (!client) return;
    if (client.drainTimer) clearTimeout(client.drainTimer);
    this.clients.delete(response);
    client.onRemove();
  }

  closeGame(gameId: string): void {
    for (const client of [...this.clients.values()]) {
      if (client.gameId !== gameId) continue;
      try {
        client.response.end();
      } finally {
        this.remove(client.response);
      }
    }
  }

  snapshot() {
    const games = new Set<string>();
    let blockedSubscribers = 0;
    let queuedEvents = 0;
    let queuedBytes = 0;
    for (const client of this.clients.values()) {
      games.add(client.gameId);
      if (client.blocked) blockedSubscribers++;
      queuedEvents += client.queue.length;
      queuedBytes += client.queuedBytes;
    }
    return {
      scope: "process-local-worker" as const,
      policy: { ...this.policy },
      live: {
        subscribers: this.clients.size,
        games: games.size,
        blockedSubscribers,
        queuedEvents,
        queuedBytes,
      },
      counters: { ...this.counters },
    };
  }

  private enqueue(client: ClientState, line: string): boolean {
    const bytes = utf8Bytes(line);
    if (
      client.queue.length >= this.policy.maxQueuedEventsPerClient ||
      client.queuedBytes + bytes > this.policy.maxQueuedBytesPerClient
    ) {
      this.evict(client, true);
      return false;
    }
    client.queue.push(line);
    client.queuedBytes += bytes;
    this.counters.queuedEvents++;
    return true;
  }

  private armDrain(client: ClientState): void {
    client.response.once("drain", () => this.drain(client));
    client.drainTimer = setTimeout(
      () => this.evict(client, true),
      this.policy.drainTimeoutMs,
    );
    client.drainTimer.unref?.();
  }

  private drain(client: ClientState): void {
    if (!this.clients.has(client.response)) return;
    if (client.drainTimer) clearTimeout(client.drainTimer);
    client.drainTimer = null;
    client.blocked = false;
    while (client.queue.length > 0) {
      const line = client.queue.shift()!;
      client.queuedBytes -= utf8Bytes(line);
      try {
        if (!client.response.write(line)) {
          client.blocked = true;
          this.counters.backpressureSignals++;
          this.armDrain(client);
          return;
        }
      } catch {
        this.counters.writeFailures++;
        this.evict(client, false);
        return;
      }
    }
  }

  private evict(client: ClientState, slow: boolean): void {
    if (!this.clients.has(client.response)) return;
    if (slow) this.counters.slowConsumerEvictions++;
    try {
      client.response.end();
    } catch {
      // Removal is authoritative even when the socket already failed.
    }
    this.remove(client.response);
  }
}
