/**
 * Privacy-minimal, match-bound evidence for the VaultFront core loop.
 *
 * Inputs come from the certified result envelope and server-stamped intent
 * funnel. Browser clocks, sessionStorage, and player-authored counters are not
 * accepted. Only aggregate records are retained.
 */
import type { Pool } from "pg";
import { getDatabasePosture, pool } from "./db/pool";

export type LoopPhase = "early" | "mid" | "late";
export type LoopIntentFunnel = Record<LoopPhase, Record<string, number>>;

export interface CertifiedLoopEvidencePlayer {
  vaultCaptures: number;
  convoyDeliveries: number;
  convoyIntercepts: number;
  convoysLost: number;
  firstVaultCaptureTick?: number;
  firstConvoyOutcomeTick?: number;
}

export interface CertifiedLoopEvidenceInput {
  gameId: string;
  durationSeconds: number;
  turnIntervalMs: number;
  players: CertifiedLoopEvidencePlayer[];
  intentFunnel: LoopIntentFunnel;
}

interface LoopEvidenceRecord {
  gameId: string;
  durationSeconds: number;
  playerSamples: number;
  vaultParticipants: number;
  outcomeParticipants: number;
  completedCycleParticipants: number;
  firstVaultSecondsTotal: number;
  firstVaultSamples: number;
  firstOutcomeSecondsTotal: number;
  firstOutcomeSamples: number;
  phases: LoopIntentFunnel;
}

export interface CertifiedLoopEvidenceReceipt {
  gameId: string;
  playerSamples: number;
  vaultParticipants: number;
  outcomeParticipants: number;
  completedCycleParticipants: number;
  evidence: "certified-match-result";
  durability: "postgres" | "process-local";
}

export interface CertifiedLoopEvidenceSummary {
  generatedAt: number;
  matches: number;
  playerSamples: number;
  vaultParticipants: number;
  outcomeParticipants: number;
  completedCycleParticipants: number;
  vaultParticipationRatePct: number;
  cycleCompletionRatePct: number;
  averageFirstVaultSeconds: number | null;
  averageFirstOutcomeSeconds: number | null;
  phases: LoopIntentFunnel;
  evidence: "certified-match-result";
  durability: "postgres" | "process-local";
}

export interface CertifiedLoopEvidenceStoreOptions {
  pool?: () => Pool | null;
  databaseConfigured?: () => boolean;
  now?: () => number;
  maxMemoryRecords?: number;
}

const emptyPhases = (): LoopIntentFunnel => ({
  early: {},
  mid: {},
  late: {},
});

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, 100_000)
    : 0;
}

function safeSeconds(
  tick: number | undefined,
  turnIntervalMs: number,
): number | null {
  if (!Number.isSafeInteger(tick) || (tick ?? -1) < 0) return null;
  if (!Number.isFinite(turnIntervalMs) || turnIntervalMs <= 0) return null;
  return (tick! * turnIntervalMs) / 1000;
}

function sanitizePhases(input: LoopIntentFunnel): LoopIntentFunnel {
  const output = emptyPhases();
  for (const phase of ["early", "mid", "late"] as const) {
    for (const [intent, count] of Object.entries(input[phase] ?? {})) {
      const key = intent.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 96);
      if (!key) continue;
      output[phase][key] = safeCount(count);
    }
  }
  return output;
}

export class CertifiedLoopEvidenceStore {
  private readonly records = new Map<string, LoopEvidenceRecord>();
  private readonly poolProvider: () => Pool | null;
  private readonly databaseConfigured: () => boolean;
  private readonly now: () => number;
  private readonly maxMemoryRecords: number;

  constructor(options: CertifiedLoopEvidenceStoreOptions = {}) {
    this.poolProvider = options.pool ?? (() => pool);
    this.databaseConfigured =
      options.databaseConfigured ?? (() => getDatabasePosture().configured);
    this.now = options.now ?? (() => Date.now());
    this.maxMemoryRecords = options.maxMemoryRecords ?? 1_000;
  }

  async recordCertifiedMatch(
    input: CertifiedLoopEvidenceInput,
  ): Promise<CertifiedLoopEvidenceReceipt | null> {
    const record = this.derive(input);
    const database = this.poolProvider();
    if (database) return this.recordPostgres(database, record);
    this.assertFallbackAvailable();
    if (this.records.has(record.gameId)) return null;
    this.records.set(record.gameId, record);
    while (this.records.size > this.maxMemoryRecords) {
      const oldest = this.records.keys().next().value;
      if (oldest === undefined) break;
      this.records.delete(oldest);
    }
    return this.receipt(record, "process-local");
  }

  async getSummary(limit = 1_000): Promise<CertifiedLoopEvidenceSummary> {
    const boundedLimit = Math.min(10_000, Math.max(1, Math.floor(limit)));
    const database = this.poolProvider();
    if (database) {
      const result = await database.query(
        `SELECT game_id, duration_seconds, player_samples,
                vault_participants, outcome_participants,
                completed_cycle_participants, first_vault_seconds_total,
                first_vault_samples, first_outcome_seconds_total,
                first_outcome_samples, intent_funnel
           FROM certified_loop_evidence
          ORDER BY recorded_at DESC
          LIMIT $1`,
        [boundedLimit],
      );
      return this.summarize(
        result.rows.map((row) => ({
          gameId: String(row.game_id),
          durationSeconds: Number(row.duration_seconds),
          playerSamples: Number(row.player_samples),
          vaultParticipants: Number(row.vault_participants),
          outcomeParticipants: Number(row.outcome_participants),
          completedCycleParticipants: Number(row.completed_cycle_participants),
          firstVaultSecondsTotal: Number(row.first_vault_seconds_total),
          firstVaultSamples: Number(row.first_vault_samples),
          firstOutcomeSecondsTotal: Number(row.first_outcome_seconds_total),
          firstOutcomeSamples: Number(row.first_outcome_samples),
          phases: sanitizePhases(
            (row.intent_funnel ?? emptyPhases()) as LoopIntentFunnel,
          ),
        })),
        "postgres",
      );
    }
    this.assertFallbackAvailable();
    return this.summarize(
      [...this.records.values()].slice(-boundedLimit),
      "process-local",
    );
  }

  private derive(input: CertifiedLoopEvidenceInput): LoopEvidenceRecord {
    let vaultParticipants = 0;
    let outcomeParticipants = 0;
    let completedCycleParticipants = 0;
    let firstVaultSecondsTotal = 0;
    let firstVaultSamples = 0;
    let firstOutcomeSecondsTotal = 0;
    let firstOutcomeSamples = 0;
    for (const player of input.players) {
      const hasVault = safeCount(player.vaultCaptures) > 0;
      const hasOutcome =
        safeCount(player.convoyDeliveries) + safeCount(player.convoysLost) > 0;
      if (hasVault) vaultParticipants += 1;
      if (hasOutcome) outcomeParticipants += 1;
      if (hasVault && hasOutcome) completedCycleParticipants += 1;
      const firstVault = safeSeconds(
        player.firstVaultCaptureTick,
        input.turnIntervalMs,
      );
      if (firstVault !== null) {
        firstVaultSecondsTotal += firstVault;
        firstVaultSamples += 1;
      }
      const firstOutcome = safeSeconds(
        player.firstConvoyOutcomeTick,
        input.turnIntervalMs,
      );
      if (firstOutcome !== null) {
        firstOutcomeSecondsTotal += firstOutcome;
        firstOutcomeSamples += 1;
      }
    }
    return {
      gameId: input.gameId,
      durationSeconds: safeCount(input.durationSeconds),
      playerSamples: input.players.length,
      vaultParticipants,
      outcomeParticipants,
      completedCycleParticipants,
      firstVaultSecondsTotal,
      firstVaultSamples,
      firstOutcomeSecondsTotal,
      firstOutcomeSamples,
      phases: sanitizePhases(input.intentFunnel),
    };
  }

  private async recordPostgres(
    database: Pool,
    record: LoopEvidenceRecord,
  ): Promise<CertifiedLoopEvidenceReceipt | null> {
    const result = await database.query(
      `INSERT INTO certified_loop_evidence
         (game_id, duration_seconds, player_samples, vault_participants,
          outcome_participants, completed_cycle_participants,
          first_vault_seconds_total, first_vault_samples,
          first_outcome_seconds_total, first_outcome_samples, intent_funnel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING game_id`,
      [
        record.gameId,
        record.durationSeconds,
        record.playerSamples,
        record.vaultParticipants,
        record.outcomeParticipants,
        record.completedCycleParticipants,
        record.firstVaultSecondsTotal,
        record.firstVaultSamples,
        record.firstOutcomeSecondsTotal,
        record.firstOutcomeSamples,
        JSON.stringify(record.phases),
      ],
    );
    return result.rowCount === 0 ? null : this.receipt(record, "postgres");
  }

  private summarize(
    records: LoopEvidenceRecord[],
    durability: CertifiedLoopEvidenceSummary["durability"],
  ): CertifiedLoopEvidenceSummary {
    const totals = {
      playerSamples: 0,
      vaultParticipants: 0,
      outcomeParticipants: 0,
      completedCycleParticipants: 0,
      firstVaultSecondsTotal: 0,
      firstVaultSamples: 0,
      firstOutcomeSecondsTotal: 0,
      firstOutcomeSamples: 0,
    };
    const phases = emptyPhases();
    for (const record of records) {
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        totals[key] += record[key];
      }
      for (const phase of ["early", "mid", "late"] as const) {
        for (const [intent, count] of Object.entries(record.phases[phase])) {
          phases[phase][intent] = (phases[phase][intent] ?? 0) + count;
        }
      }
    }
    const pct = (part: number, whole: number) =>
      whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0;
    const average = (total: number, samples: number) =>
      samples > 0 ? Number((total / samples).toFixed(2)) : null;
    return {
      generatedAt: this.now(),
      matches: records.length,
      playerSamples: totals.playerSamples,
      vaultParticipants: totals.vaultParticipants,
      outcomeParticipants: totals.outcomeParticipants,
      completedCycleParticipants: totals.completedCycleParticipants,
      vaultParticipationRatePct: pct(
        totals.vaultParticipants,
        totals.playerSamples,
      ),
      cycleCompletionRatePct: pct(
        totals.completedCycleParticipants,
        totals.vaultParticipants,
      ),
      averageFirstVaultSeconds: average(
        totals.firstVaultSecondsTotal,
        totals.firstVaultSamples,
      ),
      averageFirstOutcomeSeconds: average(
        totals.firstOutcomeSecondsTotal,
        totals.firstOutcomeSamples,
      ),
      phases,
      evidence: "certified-match-result",
      durability,
    };
  }

  private receipt(
    record: LoopEvidenceRecord,
    durability: CertifiedLoopEvidenceReceipt["durability"],
  ): CertifiedLoopEvidenceReceipt {
    return {
      gameId: record.gameId,
      playerSamples: record.playerSamples,
      vaultParticipants: record.vaultParticipants,
      outcomeParticipants: record.outcomeParticipants,
      completedCycleParticipants: record.completedCycleParticipants,
      evidence: "certified-match-result",
      durability,
    };
  }

  private assertFallbackAvailable(): void {
    if (this.databaseConfigured()) {
      throw new Error("loop evidence persistence unavailable");
    }
  }
}

export const certifiedLoopEvidenceStore = new CertifiedLoopEvidenceStore();
