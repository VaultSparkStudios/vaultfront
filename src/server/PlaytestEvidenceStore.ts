import type { Pool } from "pg";
import { getDatabasePosture, pool } from "./db/pool";
import {
  buildVaultFrontPlaytestPulseSummaryFromEvents,
  isAllowedVaultFrontPulseEvent,
  type VaultFrontPlaytestPulseEvent,
  type VaultFrontPlaytestPulseSummary,
} from "./VaultFrontPlaytestPulse";

const EVIDENCE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const EVIDENCE_RETENTION_DAYS = 30;
const EVIDENCE_RETENTION_MS = EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type AuthenticatedPlaytestEvidence = Required<
  Pick<
    VaultFrontPlaytestPulseEvent,
    "surface" | "event" | "value" | "evidenceSessionId" | "eventId" | "actorKey"
  >
> & { source: "human"; at: number };

export interface PlaytestEvidenceStoreOptions {
  now?: () => number;
  pool?: () => Pool | null;
  databaseConfigured?: () => boolean;
}

export class PlaytestEvidenceConflictError extends Error {}

export class PlaytestEvidenceStore {
  private readonly now: () => number;
  private readonly poolProvider: () => Pool | null;
  private readonly databaseConfigured: () => boolean;
  private readonly memoryEvents = new Map<
    string,
    AuthenticatedPlaytestEvidence
  >();
  private readonly memorySessionActors = new Map<string, string>();

  constructor(options: PlaytestEvidenceStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.poolProvider = options.pool ?? (() => pool);
    this.databaseConfigured =
      options.databaseConfigured ?? (() => getDatabasePosture().configured);
  }

  async record(
    input: Omit<AuthenticatedPlaytestEvidence, "at">,
  ): Promise<VaultFrontPlaytestPulseSummary> {
    if (!isAllowedVaultFrontPulseEvent(input)) {
      throw new TypeError("unsupported playtest evidence event");
    }
    const at = this.now();
    const event: AuthenticatedPlaytestEvidence = { ...input, at };
    const database = this.poolProvider();
    if (database) {
      await this.recordPostgres(database, event);
      return this.summaryPostgres(database, at);
    }
    if (this.databaseConfigured()) {
      throw new Error("playtest evidence persistence unavailable");
    }
    this.recordMemory(event);
    return this.summaryMemory(at);
  }

  async summary(): Promise<VaultFrontPlaytestPulseSummary> {
    const now = this.now();
    const database = this.poolProvider();
    if (database) return this.summaryPostgres(database, now);
    if (this.databaseConfigured()) {
      throw new Error("playtest evidence persistence unavailable");
    }
    return this.summaryMemory(now);
  }

  private recordMemory(event: AuthenticatedPlaytestEvidence): void {
    this.pruneMemory(event.at);
    if (this.memoryEvents.has(event.eventId)) return;
    const actor = this.memorySessionActors.get(event.evidenceSessionId);
    if (actor && actor !== event.actorKey) {
      throw new PlaytestEvidenceConflictError(
        "evidence session is already bound to another actor",
      );
    }
    this.memorySessionActors.set(event.evidenceSessionId, event.actorKey);
    this.memoryEvents.set(event.eventId, event);
  }

  private summaryMemory(now: number): VaultFrontPlaytestPulseSummary {
    this.pruneMemory(now);
    const cutoff = now - EVIDENCE_WINDOW_MS;
    const events = [...this.memoryEvents.values()].filter(
      (event) => event.at >= cutoff && event.at <= now,
    );
    return buildVaultFrontPlaytestPulseSummaryFromEvents(
      events,
      now,
      "process-local",
    );
  }

  private pruneMemory(now: number): void {
    const cutoff = now - EVIDENCE_RETENTION_MS;
    for (const [eventId, event] of this.memoryEvents) {
      if (event.at < cutoff) this.memoryEvents.delete(eventId);
    }
    const retainedSessions = new Set(
      [...this.memoryEvents.values()].map((event) => event.evidenceSessionId),
    );
    for (const sessionId of this.memorySessionActors.keys()) {
      if (!retainedSessions.has(sessionId))
        this.memorySessionActors.delete(sessionId);
    }
  }

  private async recordPostgres(
    database: Pool,
    event: AuthenticatedPlaytestEvidence,
  ): Promise<void> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const session = await client.query(
        `INSERT INTO playtest_evidence_sessions
           (evidence_session_id, actor_key, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (evidence_session_id) DO UPDATE
           SET last_seen_at = EXCLUDED.last_seen_at
         WHERE playtest_evidence_sessions.actor_key = EXCLUDED.actor_key
         RETURNING actor_key`,
        [event.evidenceSessionId, event.actorKey, new Date(event.at)],
      );
      if (session.rowCount === 0) {
        throw new PlaytestEvidenceConflictError(
          "evidence session is already bound to another actor",
        );
      }
      await client.query(
        `INSERT INTO playtest_evidence_events
           (event_id, evidence_session_id, actor_key, surface, event_name,
            source, occurred_at)
         VALUES ($1, $2, $3, $4, $5, 'human', $6)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          event.eventId,
          event.evidenceSessionId,
          event.actorKey,
          event.surface,
          event.event,
          new Date(event.at),
        ],
      );
      await client.query(
        `DELETE FROM playtest_evidence_events
          WHERE occurred_at < $1`,
        [new Date(event.at - EVIDENCE_RETENTION_MS)],
      );
      await client.query(
        `DELETE FROM playtest_evidence_sessions
          WHERE last_seen_at < $1
            AND NOT EXISTS (
              SELECT 1 FROM playtest_evidence_events events
               WHERE events.evidence_session_id =
                     playtest_evidence_sessions.evidence_session_id
            )`,
        [new Date(event.at - EVIDENCE_RETENTION_MS)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async summaryPostgres(
    database: Pool,
    now: number,
  ): Promise<VaultFrontPlaytestPulseSummary> {
    const result = await database.query(
      `SELECT event_id, evidence_session_id, actor_key, surface, event_name,
              source, occurred_at
         FROM playtest_evidence_events
        WHERE occurred_at >= $1 AND occurred_at <= $2
        ORDER BY occurred_at ASC, event_id ASC`,
      [new Date(now - EVIDENCE_WINDOW_MS), new Date(now)],
    );
    const events = result.rows.map((row): AuthenticatedPlaytestEvidence => ({
      surface: row.surface,
      event: row.event_name,
      value: 1,
      at: new Date(row.occurred_at).getTime(),
      evidenceSessionId: row.evidence_session_id,
      eventId: row.event_id,
      source: "human",
      actorKey: row.actor_key,
    }));
    return buildVaultFrontPlaytestPulseSummaryFromEvents(
      events,
      now,
      "postgres",
    );
  }
}

export const playtestEvidenceStore = new PlaytestEvidenceStore();
