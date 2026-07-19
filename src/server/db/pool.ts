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
  if (!database.configured || database.state !== "failed") return true;
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

async function initializeDatabase(): Promise<DatabasePosture> {
  if (!process.env.DATABASE_URL) return getDatabasePosture();
  const candidate = new Pool({ connectionString: process.env.DATABASE_URL });

  candidate.on("error", (err) => {
    posture = {
      ...posture,
      state: "failed",
      observedAt: new Date().toISOString(),
      failureCode: err.name || "pool-error",
      fallbackAllowed: false,
    };
    pool = null;
    log.error("Postgres pool error", { err: String(err) });
    void candidate.end().catch(() => undefined);
  });

  try {
    await candidate.query("SELECT 1");
    pool = candidate;
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
    pool = null;
    posture = {
      ...posture,
      state: "failed",
      observedAt: new Date().toISOString(),
      failureCode: err instanceof Error ? err.name : "connection-error",
      fallbackAllowed: false,
    };
    log.error("Postgres pool connect failed; persistent features fail closed", {
      err: String(err),
    });
    await candidate.end().catch(() => undefined);
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
