/**
 * Postgres connection pool singleton.
 *
 * Exported as `null` when DATABASE_URL is not set so all callers can guard:
 *   if (!pool) { ... fall back to in-memory ... }
 *
 * Local dev: start the pool with `docker compose up -d` then set:
 *   DATABASE_URL=postgres://vaultfront:vaultfront@localhost:5432/vaultfront
 */

import { Pool } from "pg";
import { logger } from "../Logger";

const log = logger.child({ comp: "db/pool" });

export let pool: Pool | null = null;

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
let retryDelayMs = INITIAL_RETRY_MS;
let retryTimer: NodeJS.Timeout | null = null;
let currentCandidate: Pool | null = null;

export type DatabaseState = "disabled" | "connecting" | "ready" | "failed";

export interface DatabasePosture {
  configured: boolean;
  state: DatabaseState;
  observedAt: string;
  connectedAt: string | null;
  failureCode: string | null;
  fallbackAllowed: boolean;
  scope: "process-local-worker";
}

let posture: DatabasePosture = {
  configured: Boolean(process.env.DATABASE_URL),
  state: process.env.DATABASE_URL ? "connecting" : "disabled",
  observedAt: new Date().toISOString(),
  connectedAt: null,
  failureCode: null,
  fallbackAllowed: !process.env.DATABASE_URL,
  scope: "process-local-worker",
};

export function getDatabasePosture(): DatabasePosture {
  return { ...posture, observedAt: new Date().toISOString() };
}

export function databaseAllowsRequest(
  database: DatabasePosture,
  method: string,
): boolean {
  if (!database.configured || database.state === "ready") return true;
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function scheduleReconnect(): void {
  if (retryTimer || !posture.configured) return;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void initializeDatabase();
  }, delay);
  retryTimer.unref?.();
}

function markFailed(candidate: Pool, error: unknown): void {
  if (currentCandidate !== candidate) return;
  currentCandidate = null;
  if (pool === candidate) pool = null;
  posture = {
    ...posture,
    state: "failed",
    observedAt: new Date().toISOString(),
    failureCode: error instanceof Error ? error.name : "connection-error",
    fallbackAllowed: false,
  };
  log.error("Postgres unavailable; persistent features fail closed", {
    err: String(error),
  });
  void candidate.end().catch(() => undefined);
  scheduleReconnect();
}

async function initializeDatabase(): Promise<DatabasePosture> {
  if (!process.env.DATABASE_URL) return getDatabasePosture();
  if (currentCandidate || pool) return getDatabasePosture();
  const candidate = new Pool({ connectionString: process.env.DATABASE_URL });
  currentCandidate = candidate;
  posture = {
    ...posture,
    state: "connecting",
    observedAt: new Date().toISOString(),
    fallbackAllowed: false,
  };

  candidate.on("error", (err) => markFailed(candidate, err));

  try {
    await candidate.query("SELECT 1");
    if (currentCandidate !== candidate) return getDatabasePosture();
    pool = candidate;
    retryDelayMs = INITIAL_RETRY_MS;
    const connectedAt = new Date().toISOString();
    posture = {
      ...posture,
      state: "ready",
      observedAt: connectedAt,
      connectedAt,
      failureCode: null,
      fallbackAllowed: false,
    };
    log.info("Postgres pool connected", { url: redactUrl() });
  } catch (err) {
    markFailed(candidate, err);
  }
  return getDatabasePosture();
}

/** Await this during worker bootstrap before advertising readiness. */
export const databaseReady = initializeDatabase();

function redactUrl(): string {
  try {
    const u = new URL(process.env.DATABASE_URL!);
    u.password = "***";
    return u.toString();
  } catch {
    return "(invalid url)";
  }
}
