-- VaultFront player stats and match history schema
-- Postgres. Apply via: psql $DATABASE_URL -f schema.sql

-- ── Player Stats ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_stats (
  persistent_id       VARCHAR(64)  PRIMARY KEY,
  display_name        VARCHAR(64)  NOT NULL DEFAULT '',
  elo_rating          INT          NOT NULL DEFAULT 1200,
  matches_played      INT          NOT NULL DEFAULT 0,
  wins                INT          NOT NULL DEFAULT 0,
  losses              INT          NOT NULL DEFAULT 0,
  vault_captures      INT          NOT NULL DEFAULT 0,
  convoy_deliveries   INT          NOT NULL DEFAULT 0,
  execution_chains    INT          NOT NULL DEFAULT 0,
  surge_activations   INT          NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_stats_elo
  ON player_stats (elo_rating DESC);

-- ── Match History ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_history (
  id                  SERIAL       PRIMARY KEY,
  persistent_id       VARCHAR(64)  NOT NULL REFERENCES player_stats(persistent_id),
  game_id             VARCHAR(64)  NOT NULL,
  won                 BOOLEAN      NOT NULL,
  duration_seconds    INT          NOT NULL DEFAULT 0,
  vault_captures      INT          NOT NULL DEFAULT 0,
  convoy_deliveries   INT          NOT NULL DEFAULT 0,
  execution_chains    INT          NOT NULL DEFAULT 0,
  elo_before          INT          NOT NULL DEFAULT 1200,
  elo_after           INT          NOT NULL DEFAULT 1200,
  elo_delta           INT          NOT NULL DEFAULT 0,
  map_name            VARCHAR(128) NOT NULL DEFAULT '',
  player_count        INT          NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_history_pid_date
  ON match_history (persistent_id, created_at DESC);

-- ── Leaderboard Cache ─────────────────────────────────────────────────────────
-- Materialized snapshot refreshed after each match via application code.
-- TODO: replace with a Postgres materialized view and schedule a refresh
--       trigger once DATABASE_URL is confirmed available in production.
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  persistent_id   VARCHAR(64)  PRIMARY KEY,
  display_name    VARCHAR(64)  NOT NULL DEFAULT '',
  elo_rating      INT          NOT NULL DEFAULT 1200,
  rank            INT          NOT NULL DEFAULT 0,
  matches_played  INT          NOT NULL DEFAULT 0,
  wins            INT          NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Refresh helper: call after recording each match to keep leaderboard in sync.
-- Example invocation from application:
--   TRUNCATE leaderboard_cache;
--   INSERT INTO leaderboard_cache (persistent_id, display_name, elo_rating, rank, matches_played, wins, updated_at)
--   SELECT persistent_id, display_name, elo_rating,
--          ROW_NUMBER() OVER (ORDER BY elo_rating DESC) AS rank,
--          matches_played, wins, NOW()
--   FROM player_stats
--   ORDER BY elo_rating DESC
--   LIMIT 1000;
