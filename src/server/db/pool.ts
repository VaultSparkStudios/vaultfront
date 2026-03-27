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

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  pool.on("error", (err) => {
    log.error("Postgres pool error", { err: String(err) });
  });

  pool
    .query("SELECT 1")
    .then(() => log.info("Postgres pool connected", { url: redactUrl() }))
    .catch((err) =>
      log.warn("Postgres pool connect failed — falling back to in-memory", {
        err: String(err),
      }),
    );
}

function redactUrl(): string {
  try {
    const u = new URL(process.env.DATABASE_URL!);
    u.password = "***";
    return u.toString();
  } catch {
    return "(invalid url)";
  }
}
