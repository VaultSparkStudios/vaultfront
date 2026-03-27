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

-- ── Player Achievements ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_achievements (
  persistent_id   VARCHAR(64)  NOT NULL,
  achievement_id  VARCHAR(64)  NOT NULL,
  unlocked_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (persistent_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_player_achievements_pid
  ON player_achievements (persistent_id);

-- ── Season Votes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS season_votes (
  week_number   INT          NOT NULL,
  voter_id      VARCHAR(128) NOT NULL,
  candidate_key VARCHAR(64)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_number, voter_id)
);

-- ── Clans ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clans (
  id            VARCHAR(32)  PRIMARY KEY,
  name          VARCHAR(32)  NOT NULL UNIQUE,
  tag           VARCHAR(6)   NOT NULL UNIQUE,
  founder_id    VARCHAR(64)  NOT NULL,
  description   VARCHAR(256) NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clan_members (
  clan_id       VARCHAR(32)  NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  persistent_id VARCHAR(64)  NOT NULL,
  role          VARCHAR(16)  NOT NULL DEFAULT 'member', -- 'founder' | 'officer' | 'member'
  joined_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clan_id, persistent_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_members_pid
  ON clan_members (persistent_id);

-- ── Tournaments ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id            VARCHAR(32)  PRIMARY KEY,
  name          VARCHAR(64)  NOT NULL,
  map_name      VARCHAR(128) NOT NULL DEFAULT '',
  max_players   INT          NOT NULL DEFAULT 8,
  status        VARCHAR(16)  NOT NULL DEFAULT 'registration', -- 'registration' | 'active' | 'complete'
  created_by    VARCHAR(64)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tournament_slots (
  tournament_id VARCHAR(32)  NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  persistent_id VARCHAR(64)  NOT NULL,
  seed          INT          NOT NULL DEFAULT 0,
  elo_at_entry  INT          NOT NULL DEFAULT 1200,
  registered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, persistent_id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id            SERIAL       PRIMARY KEY,
  tournament_id VARCHAR(32)  NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round         INT          NOT NULL,
  match_index   INT          NOT NULL, -- position in the round (0-indexed)
  player_a      VARCHAR(64),
  player_b      VARCHAR(64),
  winner_id     VARCHAR(64),
  game_id       VARCHAR(64),
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'complete'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tid
  ON tournament_matches (tournament_id, round);
