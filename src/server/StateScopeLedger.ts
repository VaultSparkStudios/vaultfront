import type { DatabasePosture } from "./db/pool";

export type StateDurability =
  "volatile" | "database-when-ready" | "filesystem-signed";

export interface StateScopeLedgerEntry {
  store: string;
  owner: string;
  declaredScope: "process" | "worker-filesystem" | "postgres";
  durability: StateDurability;
  replication: "none" | "postgres-managed";
  retention: string;
  recovery: string;
  probeOwner: string;
  releaseCritical: boolean;
}

const STATE_SCOPE_LEDGER: readonly StateScopeLedgerEntry[] = [
  {
    store: "player-stats-and-style-history",
    owner: "PlayerStatsStore",
    declaredScope: "postgres",
    durability: "database-when-ready",
    replication: "postgres-managed",
    retention: "database policy; process lifetime when database disabled",
    recovery: "database restore; none for process-local fallback",
    probeOwner: "database-readiness",
    releaseCritical: true,
  },
  {
    store: "achievements",
    owner: "AchievementStore",
    declaredScope: "postgres",
    durability: "database-when-ready",
    replication: "postgres-managed",
    retention: "database policy; process lifetime when database disabled",
    recovery: "database restore; none for process-local fallback",
    probeOwner: "database-readiness",
    releaseCritical: true,
  },
  {
    store: "clans",
    owner: "ClanStore",
    declaredScope: "postgres",
    durability: "database-when-ready",
    replication: "postgres-managed",
    retention: "database policy; process lifetime when database disabled",
    recovery: "database restore; none for process-local fallback",
    probeOwner: "database-readiness",
    releaseCritical: true,
  },
  {
    store: "tournaments",
    owner: "TournamentStore",
    declaredScope: "postgres",
    durability: "database-when-ready",
    replication: "postgres-managed",
    retention: "database policy; process lifetime when database disabled",
    recovery: "database restore; none for process-local fallback",
    probeOwner: "database-readiness",
    releaseCritical: true,
  },
  {
    store: "season-votes",
    owner: "VaultSeasonScheduler",
    declaredScope: "postgres",
    durability: "database-when-ready",
    replication: "postgres-managed",
    retention: "database policy; active vote in process memory",
    recovery: "database aggregation; active process vote is not recoverable",
    probeOwner: "database-readiness",
    releaseCritical: false,
  },
  {
    store: "replays-and-highlights",
    owner: "ReplayStore",
    declaredScope: "worker-filesystem",
    durability: "filesystem-signed",
    replication: "none",
    retention: "worker filesystem policy",
    recovery: "signed file reload on the same worker volume",
    probeOwner: "replay-integrity-posture",
    releaseCritical: true,
  },
  {
    store: "playtest-pulse",
    owner: "VaultFrontPlaytestPulse",
    declaredScope: "process",
    durability: "volatile",
    replication: "none",
    retention: "process lifetime",
    recovery: "none",
    probeOwner: "playtest-pulse-readiness",
    releaseCritical: true,
  },
  {
    store: "experiment-integrity-counters",
    owner: "ExperimentIntegrityGate",
    declaredScope: "process",
    durability: "volatile",
    replication: "none",
    retention: "process lifetime",
    recovery: "none",
    probeOwner: "runtime-integrity-passport",
    releaseCritical: false,
  },
  {
    store: "narrator-and-stream-subscribers",
    owner: "BoundedSseTransport",
    declaredScope: "process",
    durability: "volatile",
    replication: "none",
    retention: "connection lifetime",
    recovery: "client reconnect",
    probeOwner: "runtime-integrity-passport",
    releaseCritical: false,
  },
] as const;

export function buildStateScopeLedger(database: DatabasePosture) {
  const entries = STATE_SCOPE_LEDGER.map((entry) => ({
    ...entry,
    effectiveScope:
      entry.durability === "database-when-ready"
        ? database.state === "ready"
          ? ("postgres" as const)
          : ("process" as const)
        : entry.declaredScope,
  }));
  const volatileReleaseCritical = entries.filter(
    (entry) => entry.releaseCritical && entry.effectiveScope === "process",
  );
  return {
    schemaVersion: "1.0" as const,
    observedAt: database.observedAt,
    database,
    summary: {
      stores: entries.length,
      volatileStores: entries.filter(
        (entry) => entry.effectiveScope === "process",
      ).length,
      volatileReleaseCriticalStores: volatileReleaseCritical.map(
        (entry) => entry.store,
      ),
      configuredDatabaseFailure:
        database.configured && database.state === "failed",
      releasePersistenceStatus:
        database.configured && database.state === "failed"
          ? ("block" as const)
          : volatileReleaseCritical.length > 0
            ? ("warn" as const)
            : ("pass" as const),
    },
    entries,
  };
}

export type StateScopeLedgerSnapshot = ReturnType<typeof buildStateScopeLedger>;
