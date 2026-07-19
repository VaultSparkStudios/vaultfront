import { createHash } from "node:crypto";
import type { ExperimentIntegritySnapshot } from "./ExperimentIntegrity";
import type { NarratorBus } from "./NarratorBus";
import type { RemoteAiPosture } from "./RemoteAiPolicy";
import type { StateScopeLedgerSnapshot } from "./StateScopeLedger";
import type { StreamingBus } from "./StreamingBus";

export interface RuntimeIntegrityPassportInput {
  workerId: number;
  observedAt: string;
  health: {
    httpResponding: boolean;
    ipc: {
      connected: boolean;
      healthy: boolean;
      ageMs: number;
      maxAgeMs: number;
    };
    gameLoop: { healthy: boolean; ageMs: number; maxAgeMs: number };
  };
  experimentIntegrity: ExperimentIntegritySnapshot;
  remoteAi: RemoteAiPosture;
  websocketPolicy: {
    lobbyMaxPayloadBytes: number;
    spectatorMaxPayloadBytes: number;
    lobbyMaxBufferedBytes: number;
    spectatorMaxBufferedBytes: number;
    maxSpectatorsPerGame: number;
    maxSpectatorsPerWorker: number;
  };
  ssePolicy: {
    streaming: ReturnType<StreamingBus["integritySnapshot"]>;
    narrator: ReturnType<NarratorBus["integritySnapshot"]>;
  };
  stateScopeLedger: StateScopeLedgerSnapshot;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function evidenceDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function buildRuntimeIntegrityPassport(
  input: RuntimeIntegrityPassportInput,
) {
  const failures: string[] = [];
  const warnings: string[] = [];
  if (!input.health.httpResponding) failures.push("http-not-responding");
  if (!input.health.ipc.healthy) failures.push("ipc-watermark-stale");
  if (!input.health.gameLoop.healthy)
    failures.push("game-loop-watermark-stale");
  if (
    input.websocketPolicy.lobbyMaxPayloadBytes > 64 * 1024 ||
    input.websocketPolicy.spectatorMaxPayloadBytes > 64 * 1024
  ) {
    failures.push("websocket-payload-budget-exceeded");
  }
  if (
    input.websocketPolicy.lobbyMaxBufferedBytes > 256 * 1024 ||
    input.websocketPolicy.spectatorMaxBufferedBytes > 256 * 1024
  ) {
    failures.push("websocket-buffer-budget-exceeded");
  }
  if (input.stateScopeLedger.summary.configuredDatabaseFailure) {
    failures.push("configured-database-failed");
  } else if (
    input.stateScopeLedger.summary.releasePersistenceStatus === "warn"
  ) {
    warnings.push("release-critical-state-is-process-local");
  }
  const sseTransports = [input.ssePolicy.streaming, input.ssePolicy.narrator];
  if (
    sseTransports.some(
      (transport) => transport.policy.maxQueuedBytesPerClient > 256 * 1024,
    )
  ) {
    failures.push("sse-buffer-budget-exceeded");
  }
  if (
    sseTransports.some(
      (transport) => transport.counters.slowConsumerEvictions > 0,
    )
  ) {
    warnings.push("sse-slow-consumers-evicted");
  }
  const decisions =
    input.experimentIntegrity.accepted + input.experimentIntegrity.rejected;
  const rejectionRate =
    decisions === 0 ? 0 : input.experimentIntegrity.rejected / decisions;
  if (rejectionRate > 0.1) warnings.push("experiment-rejection-rate-elevated");

  const evidence = {
    schemaVersion: "1.0" as const,
    project: "vaultfront" as const,
    scope: "process-local-worker" as const,
    workerId: input.workerId,
    observedAt: input.observedAt,
    health: input.health,
    experimentIntegrity: {
      ...input.experimentIntegrity,
      rejectionRate,
    },
    remoteAi: input.remoteAi,
    websocketPolicy: input.websocketPolicy,
    ssePolicy: input.ssePolicy,
    stateScopeLedger: input.stateScopeLedger,
    mutationBoundary: {
      version: "verified-actor-v1" as const,
      authority: "bearer-token-subject" as const,
    },
    status:
      failures.length > 0
        ? ("fail" as const)
        : warnings.length > 0
          ? ("warn" as const)
          : ("pass" as const),
    failures,
    warnings,
  };
  return { ...evidence, evidenceDigest: evidenceDigest(evidence) };
}
