import Anthropic from "@anthropic-ai/sdk";
import compression from "compression";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import http from "http";
import ipAnonymize from "ip-anonymize";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import { GameType } from "../core/game/Game";
import {
  ClientMessageSchema,
  GameID,
  PartialGameRecordSchema,
  PersistentIdSchema,
  ServerErrorMessage,
} from "../core/Schemas";
import { generateID, replacer } from "../core/Util";
import { CreateGameInputSchema } from "../core/WorkerSchemas";
import { archive, finalizeGameRecord } from "./Archive";
import { Client } from "./Client";
import { EloRating } from "./EloRating";
import { GameManager } from "./GameManager";
import { registerGamePreviewRoute } from "./GamePreviewRoute";
import { getUserMe, verifyClientToken } from "./jwt";
import { logger } from "./Logger";
import { playerStatsStore } from "./PlayerStatsStore";

import { GameEnv } from "../core/configuration/Config";
import { antiCheatMonitor } from "./AntiCheatMonitor";
import { clanStore } from "./ClanStore";
import { MapPlaylist } from "./MapPlaylist";
import { startPolling } from "./PollingLoop";
import { PrivilegeRefresher } from "./PrivilegeRefresher";
import { rematchStore } from "./RematchStore";
import { replayHighlightStore } from "./ReplayHighlightStore";
import { replayStore } from "./ReplayStore";
import { tournamentStore } from "./TournamentStore";
import { verifyTurnstileToken } from "./Turnstile";
import { tutorialOrchestrator } from "./TutorialOrchestrator";
import {
  vaultSeasonScheduler,
  type SeasonStatus,
} from "./VaultSeasonScheduler";
import { WorkerLobbyService } from "./WorkerLobbyService";
import { initWorkerMetrics } from "./WorkerMetrics";

const config = getServerConfigFromServer();

const workerId = parseInt(process.env.WORKER_ID ?? "0");
const log = logger.child({ comp: `w_${workerId}` });
const playlist = new MapPlaylist();

const VaultFrontSeasonContractDeltaSchema = z.object({
  interceptionTimingDelta: z.number().int().min(0).default(0),
  objectiveDenialDelta: z.number().int().min(0).default(0),
  comebackExecutionDelta: z.number().int().min(0).default(0),
  rivalryRevengeDelta: z.number().int().min(0).default(0),
});

const VaultFrontDockVariantSchema = z.enum(["top", "stack"]);
const VaultFrontRecapVariantSchema = z.enum(["goal_focus", "requeue_focus"]);
const VaultFrontRuntimeRewardVariantSchema = z.enum([
  "control",
  "high_risk_high_reward",
]);
const VaultFrontRuntimeHudVariantSchema = z.enum([
  "default",
  "mobile_priority",
]);

const VaultFrontDockEventSchema = z.object({
  event: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  variant: VaultFrontDockVariantSchema.optional(),
  value: z.number().int().min(1).max(10_000).default(1),
});

const VaultFrontRecapEventSchema = z.object({
  event: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  variant: VaultFrontRecapVariantSchema.optional(),
  value: z.number().int().min(1).max(10_000).default(1),
});

const VaultFrontOutcomeTelemetrySchema = z.object({
  won: z.boolean(),
  behindAtMinute8: z.boolean(),
  matchLengthSeconds: z.number().int().min(0).max(86_400).default(0),
  recapCtaVariant: VaultFrontRecapVariantSchema.optional(),
  recapCtaClicked: z.boolean().optional(),
  requeueClicked: z.boolean().optional(),
  hud: z
    .object({
      vaultNoticeJumps: z.number().int().min(0).max(10_000).default(0),
      objectiveRailClicks: z.number().int().min(0).max(10_000).default(0),
      timelineJumps: z.number().int().min(0).max(10_000).default(0),
    })
    .default({
      vaultNoticeJumps: 0,
      objectiveRailClicks: 0,
      timelineJumps: 0,
    }),
});

const VaultFrontRuntimeEventSchema = z.object({
  event: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  rewardVariant: VaultFrontRuntimeRewardVariantSchema.optional(),
  hudVariant: VaultFrontRuntimeHudVariantSchema.optional(),
  value: z.number().int().min(1).max(10_000).default(1),
});

const VaultFrontFunnelTelemetrySchema = z.object({
  won: z.boolean(),
  matchLengthSeconds: z.number().int().min(0).max(86_400).default(0),
  phases: z.object({
    early: z.record(z.string(), z.number().int().min(0).max(10_000)),
    mid: z.record(z.string(), z.number().int().min(0).max(10_000)),
    late: z.record(z.string(), z.number().int().min(0).max(10_000)),
  }),
});

interface VaultFrontSeasonContractState {
  seasonId: string;
  interceptionTiming: number;
  objectiveDenial: number;
  comebackExecution: number;
  rivalryRevenge: number;
}

interface VaultFrontDockAssignment {
  experimentId: "dock_layout_v1";
  variant: z.infer<typeof VaultFrontDockVariantSchema>;
  assignedAt: number;
}

interface VaultFrontDockVariantStats {
  assignedUsers: number;
  events: Record<string, number>;
  eventHistory: Array<{ at: number; event: string; value: number }>;
}

interface VaultFrontRecapAssignment {
  experimentId: "recap_cta_v1";
  variant: z.infer<typeof VaultFrontRecapVariantSchema>;
  assignedAt: number;
}

interface VaultFrontRecapVariantStats {
  assignedUsers: number;
  events: Record<string, number>;
  eventHistory: Array<{ at: number; event: string; value: number }>;
}

interface VaultFrontRuntimeAssignment {
  experimentId: "vault_runtime_v1";
  rewardVariant: z.infer<typeof VaultFrontRuntimeRewardVariantSchema>;
  hudVariant: z.infer<typeof VaultFrontRuntimeHudVariantSchema>;
  assignedAt: number;
}

interface VaultFrontRuntimeVariantStats {
  assignedUsers: number;
  events: Record<string, number>;
}

interface VaultFrontOutcomeBucketStats {
  matches: number;
  wins: number;
  hudTotals: {
    vaultNoticeJumps: number;
    objectiveRailClicks: number;
    timelineJumps: number;
  };
  recapCtaClicks: number;
  requeueClicks: number;
  recapVariant: Record<z.infer<typeof VaultFrontRecapVariantSchema>, number>;
}

interface VaultFrontFunnelSummary {
  matches: number;
  wins: number;
  phases: Record<"early" | "mid" | "late", Record<string, number>>;
}

const vaultFrontContractsStore = new Map<
  string,
  VaultFrontSeasonContractState
>();
const vaultFrontDockAssignments = new Map<string, VaultFrontDockAssignment>();
const vaultFrontDockVariantStats = new Map<
  z.infer<typeof VaultFrontDockVariantSchema>,
  VaultFrontDockVariantStats
>([
  ["top", { assignedUsers: 0, events: {}, eventHistory: [] }],
  ["stack", { assignedUsers: 0, events: {}, eventHistory: [] }],
]);
const vaultFrontRecapAssignments = new Map<string, VaultFrontRecapAssignment>();
const vaultFrontRecapVariantStats = new Map<
  z.infer<typeof VaultFrontRecapVariantSchema>,
  VaultFrontRecapVariantStats
>([
  ["goal_focus", { assignedUsers: 0, events: {}, eventHistory: [] }],
  ["requeue_focus", { assignedUsers: 0, events: {}, eventHistory: [] }],
]);
const vaultFrontOutcomeBuckets = new Map<
  string,
  VaultFrontOutcomeBucketStats
>();
const vaultFrontRuntimeAssignments = new Map<
  string,
  VaultFrontRuntimeAssignment
>();
const vaultFrontRuntimeRewardStats = new Map<
  z.infer<typeof VaultFrontRuntimeRewardVariantSchema>,
  VaultFrontRuntimeVariantStats
>([
  ["control", { assignedUsers: 0, events: {} }],
  ["high_risk_high_reward", { assignedUsers: 0, events: {} }],
]);
const vaultFrontRuntimeHudStats = new Map<
  z.infer<typeof VaultFrontRuntimeHudVariantSchema>,
  VaultFrontRuntimeVariantStats
>([
  ["default", { assignedUsers: 0, events: {} }],
  ["mobile_priority", { assignedUsers: 0, events: {} }],
]);
const vaultFrontFunnelSummaries = new Map<string, VaultFrontFunnelSummary>();

const DOCK_OBJECTIVE_EVENTS = new Set([
  "leaderboard_open_top",
  "leaderboard_open_stack",
  "team_leaderboard_open_top",
  "team_leaderboard_open_stack",
  "hud_objective_rail_click",
  "hud_vault_notice_jump",
  "hud_timeline_jump",
]);
const EVENT_HISTORY_LIMIT = 800;
const TREND_WINDOW_MS = 5 * 60 * 1000;
const GUARDRAIL_MIN_ASSIGNED = 60;
const GUARDRAIL_MIN_OBJECTIVE_EVENTS = 40;

function seasonIdUTC(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

async function resolveVaultFrontIdentity(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring("Bearer ".length);
    const verified = await verifyClientToken(token, config);
    if (verified.type === "success") {
      return `auth:${verified.persistentId}`;
    }
  }

  const rawHeader = req.headers["x-vaultfront-client-id"];
  const clientId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (
    typeof clientId === "string" &&
    PersistentIdSchema.safeParse(clientId).success
  ) {
    return `anon:${clientId}`;
  }

  return null;
}

function ensureDockAssignment(identity: string): VaultFrontDockAssignment {
  const existing = vaultFrontDockAssignments.get(identity);
  if (existing) return existing;

  const variant = stableHash(identity) % 2 === 0 ? "top" : "stack";
  const assignment: VaultFrontDockAssignment = {
    experimentId: "dock_layout_v1",
    variant,
    assignedAt: Date.now(),
  };
  vaultFrontDockAssignments.set(identity, assignment);
  const stats = vaultFrontDockVariantStats.get(variant);
  if (stats) {
    stats.assignedUsers += 1;
  }
  return assignment;
}

function recordDockEvent(
  identity: string,
  event: string,
  value: number,
  variantHint?: z.infer<typeof VaultFrontDockVariantSchema>,
): { variant: z.infer<typeof VaultFrontDockVariantSchema> } {
  const assignment = ensureDockAssignment(identity);
  const variant = variantHint ?? assignment.variant;
  const stats = vaultFrontDockVariantStats.get(variant);
  if (stats) {
    stats.events[event] = (stats.events[event] ?? 0) + value;
    stats.eventHistory.push({ at: Date.now(), event, value });
    if (stats.eventHistory.length > EVENT_HISTORY_LIMIT) {
      stats.eventHistory = stats.eventHistory.slice(-EVENT_HISTORY_LIMIT);
    }
  }
  return { variant };
}

function ensureRecapAssignment(identity: string): VaultFrontRecapAssignment {
  const existing = vaultFrontRecapAssignments.get(identity);
  if (existing) return existing;

  const variant =
    stableHash(`${identity}:recap`) % 2 === 0 ? "goal_focus" : "requeue_focus";
  const assignment: VaultFrontRecapAssignment = {
    experimentId: "recap_cta_v1",
    variant,
    assignedAt: Date.now(),
  };
  vaultFrontRecapAssignments.set(identity, assignment);
  const stats = vaultFrontRecapVariantStats.get(variant);
  if (stats) {
    stats.assignedUsers += 1;
  }
  return assignment;
}

function recordRecapEvent(
  identity: string,
  event: string,
  value: number,
  variantHint?: z.infer<typeof VaultFrontRecapVariantSchema>,
): { variant: z.infer<typeof VaultFrontRecapVariantSchema> } {
  const assignment = ensureRecapAssignment(identity);
  const variant = variantHint ?? assignment.variant;
  const stats = vaultFrontRecapVariantStats.get(variant);
  if (stats) {
    stats.events[event] = (stats.events[event] ?? 0) + value;
    stats.eventHistory.push({ at: Date.now(), event, value });
    if (stats.eventHistory.length > EVENT_HISTORY_LIMIT) {
      stats.eventHistory = stats.eventHistory.slice(-EVENT_HISTORY_LIMIT);
    }
  }
  return { variant };
}

function ensureRuntimeAssignment(
  identity: string,
): VaultFrontRuntimeAssignment {
  const existing = vaultFrontRuntimeAssignments.get(identity);
  if (existing) return existing;

  const rewardVariant =
    stableHash(`${identity}:vault_runtime:reward`) % 2 === 0
      ? "control"
      : "high_risk_high_reward";
  const hudVariant =
    stableHash(`${identity}:vault_runtime:hud`) % 2 === 0
      ? "default"
      : "mobile_priority";

  const assignment: VaultFrontRuntimeAssignment = {
    experimentId: "vault_runtime_v1",
    rewardVariant,
    hudVariant,
    assignedAt: Date.now(),
  };
  vaultFrontRuntimeAssignments.set(identity, assignment);
  vaultFrontRuntimeRewardStats.get(rewardVariant)!.assignedUsers += 1;
  vaultFrontRuntimeHudStats.get(hudVariant)!.assignedUsers += 1;
  return assignment;
}

function recordRuntimeEvent(
  identity: string,
  event: string,
  value: number,
  rewardVariantHint?: z.infer<typeof VaultFrontRuntimeRewardVariantSchema>,
  hudVariantHint?: z.infer<typeof VaultFrontRuntimeHudVariantSchema>,
): {
  rewardVariant: z.infer<typeof VaultFrontRuntimeRewardVariantSchema>;
  hudVariant: z.infer<typeof VaultFrontRuntimeHudVariantSchema>;
} {
  const assignment = ensureRuntimeAssignment(identity);
  const rewardVariant = rewardVariantHint ?? assignment.rewardVariant;
  const hudVariant = hudVariantHint ?? assignment.hudVariant;
  const rewardStats = vaultFrontRuntimeRewardStats.get(rewardVariant);
  const hudStats = vaultFrontRuntimeHudStats.get(hudVariant);
  if (rewardStats) {
    rewardStats.events[event] = (rewardStats.events[event] ?? 0) + value;
  }
  if (hudStats) {
    hudStats.events[event] = (hudStats.events[event] ?? 0) + value;
  }
  return { rewardVariant, hudVariant };
}

function emptyFunnelSummary(): VaultFrontFunnelSummary {
  return {
    matches: 0,
    wins: 0,
    phases: {
      early: {},
      mid: {},
      late: {},
    },
  };
}

function mergePhaseCounts(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function recordFunnelTelemetry(
  telemetry: z.infer<typeof VaultFrontFunnelTelemetrySchema>,
): void {
  const overall = vaultFrontFunnelSummaries.get("all") ?? emptyFunnelSummary();
  const length = matchLengthBucket(telemetry.matchLengthSeconds);
  const bucketKey = `length:${length}`;
  const bucket =
    vaultFrontFunnelSummaries.get(bucketKey) ?? emptyFunnelSummary();
  for (const target of [overall, bucket]) {
    target.matches += 1;
    if (telemetry.won) target.wins += 1;
    mergePhaseCounts(target.phases.early, telemetry.phases.early);
    mergePhaseCounts(target.phases.mid, telemetry.phases.mid);
    mergePhaseCounts(target.phases.late, telemetry.phases.late);
  }
  vaultFrontFunnelSummaries.set("all", overall);
  vaultFrontFunnelSummaries.set(bucketKey, bucket);
}

function makeOutcomeBucket(): VaultFrontOutcomeBucketStats {
  return {
    matches: 0,
    wins: 0,
    hudTotals: {
      vaultNoticeJumps: 0,
      objectiveRailClicks: 0,
      timelineJumps: 0,
    },
    recapCtaClicks: 0,
    requeueClicks: 0,
    recapVariant: {
      goal_focus: 0,
      requeue_focus: 0,
    },
  };
}

function ensureOutcomeBucket(key: string): VaultFrontOutcomeBucketStats {
  const existing = vaultFrontOutcomeBuckets.get(key);
  if (existing) return existing;
  const created = makeOutcomeBucket();
  vaultFrontOutcomeBuckets.set(key, created);
  return created;
}

function matchLengthBucket(
  matchLengthSeconds: number,
): "short" | "mid" | "long" {
  if (matchLengthSeconds < 600) return "short";
  if (matchLengthSeconds < 1200) return "mid";
  return "long";
}

function outcomeBucketKey(
  telemetry: z.infer<typeof VaultFrontOutcomeTelemetrySchema>,
): string {
  const behind = telemetry.behindAtMinute8 ? "behind8" : "not_behind8";
  const length = matchLengthBucket(telemetry.matchLengthSeconds);
  const recap = telemetry.recapCtaVariant ?? "none";
  return `${behind}:${length}:${recap}`;
}

function recordOutcomeTelemetry(
  telemetry: z.infer<typeof VaultFrontOutcomeTelemetrySchema>,
): string {
  const bucketKey = outcomeBucketKey(telemetry);
  const all = ensureOutcomeBucket("all");
  const bucket = ensureOutcomeBucket(bucketKey);
  const targets = [all, bucket];

  for (const target of targets) {
    target.matches += 1;
    if (telemetry.won) {
      target.wins += 1;
    }
    target.hudTotals.vaultNoticeJumps += telemetry.hud.vaultNoticeJumps;
    target.hudTotals.objectiveRailClicks += telemetry.hud.objectiveRailClicks;
    target.hudTotals.timelineJumps += telemetry.hud.timelineJumps;
    if (telemetry.recapCtaClicked) {
      target.recapCtaClicks += 1;
    }
    if (telemetry.requeueClicked) {
      target.requeueClicks += 1;
    }
    if (telemetry.recapCtaVariant) {
      target.recapVariant[telemetry.recapCtaVariant] += 1;
    }
  }
  return bucketKey;
}

function objectiveEventsInRange(
  history: Array<{ at: number; event: string; value: number }>,
  fromInclusive: number,
  toExclusive: number,
): number {
  return history.reduce((acc, item) => {
    if (item.at < fromInclusive || item.at >= toExclusive) return acc;
    if (!DOCK_OBJECTIVE_EVENTS.has(item.event)) return acc;
    return acc + item.value;
  }, 0);
}

function objectiveEventCount(stats: VaultFrontDockVariantStats): number {
  return Object.entries(stats.events).reduce((acc, [event, value]) => {
    if (!DOCK_OBJECTIVE_EVENTS.has(event)) return acc;
    return acc + value;
  }, 0);
}

function objectiveRate(
  stats: VaultFrontDockVariantStats,
  fallbackDenominator = 1,
): number {
  const denominator = Math.max(stats.assignedUsers, fallbackDenominator);
  return objectiveEventCount(stats) / denominator;
}

function buildDockGuardrailSummary(
  top: VaultFrontDockVariantStats,
  stack: VaultFrontDockVariantStats,
) {
  const now = Date.now();
  const thisWindowStart = now - TREND_WINDOW_MS;
  const prevWindowStart = thisWindowStart - TREND_WINDOW_MS;

  const topRate = objectiveRate(top);
  const stackRate = objectiveRate(stack);
  const rateDeltaPct =
    stackRate > 0
      ? ((topRate - stackRate) / stackRate) * 100
      : topRate > 0
        ? 100
        : 0;

  const topObjectiveEvents = objectiveEventCount(top);
  const stackObjectiveEvents = objectiveEventCount(stack);
  const topTrendNow = objectiveEventsInRange(
    top.eventHistory,
    thisWindowStart,
    now,
  );
  const stackTrendNow = objectiveEventsInRange(
    stack.eventHistory,
    thisWindowStart,
    now,
  );
  const topTrendPrev = objectiveEventsInRange(
    top.eventHistory,
    prevWindowStart,
    thisWindowStart,
  );
  const stackTrendPrev = objectiveEventsInRange(
    stack.eventHistory,
    prevWindowStart,
    thisWindowStart,
  );
  const topTrendDelta = topTrendNow - topTrendPrev;
  const stackTrendDelta = stackTrendNow - stackTrendPrev;

  const enoughSample =
    top.assignedUsers >= GUARDRAIL_MIN_ASSIGNED &&
    stack.assignedUsers >= GUARDRAIL_MIN_ASSIGNED &&
    topObjectiveEvents >= GUARDRAIL_MIN_OBJECTIVE_EVENTS &&
    stackObjectiveEvents >= GUARDRAIL_MIN_OBJECTIVE_EVENTS;
  const worseRateRatio =
    Math.max(topRate, stackRate) > 0
      ? Math.min(topRate, stackRate) / Math.max(topRate, stackRate)
      : 1;

  let decision:
    | "hold"
    | "prefer_top"
    | "prefer_stack"
    | "disable_top"
    | "disable_stack" = "hold";
  let reason = "Not enough sample to make a guardrail decision.";
  if (enoughSample) {
    if (worseRateRatio <= 0.7) {
      if (topRate > stackRate) {
        decision = "disable_stack";
        reason =
          "Top variant materially outperforms stack on objective interactions per assigned user.";
      } else {
        decision = "disable_top";
        reason =
          "Stack variant materially outperforms top on objective interactions per assigned user.";
      }
    } else {
      decision = topRate >= stackRate ? "prefer_top" : "prefer_stack";
      reason =
        "Both variants are healthy; keep ramp while preferring the current leader.";
    }
  }

  return {
    objective: {
      topEvents: topObjectiveEvents,
      stackEvents: stackObjectiveEvents,
      topPerAssigned: Number(topRate.toFixed(4)),
      stackPerAssigned: Number(stackRate.toFixed(4)),
      deltaPctTopVsStack: Number(rateDeltaPct.toFixed(2)),
    },
    trend5m: {
      top: {
        current: topTrendNow,
        previous: topTrendPrev,
        delta: topTrendDelta,
      },
      stack: {
        current: stackTrendNow,
        previous: stackTrendPrev,
        delta: stackTrendDelta,
      },
    },
    guardrail: {
      minAssigned: GUARDRAIL_MIN_ASSIGNED,
      minObjectiveEvents: GUARDRAIL_MIN_OBJECTIVE_EVENTS,
      enoughSample,
      decision,
      reason,
    },
  };
}

// Worker setup
export async function startWorker() {
  log.info(`Worker starting...`);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();

  // ── Security middleware ───────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) =>
    s.trim(),
  ) ?? [
    "https://play-vaultfront.vaultsparkstudios.com",
    "https://vaultsparkstudios.com",
    ...(config.env() === GameEnv.Dev
      ? ["http://localhost:5173", "http://localhost:3000"]
      : []),
  ];
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP enforced by nginx
      crossOriginEmbedderPolicy: false, // Pixi.js canvas resources
    }),
  );
  // ─────────────────────────────────────────────────────────────────────────

  app.use(express.json({ limit: "5mb" }));
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const gm = new GameManager(config, log);

  // Initialize lobby service (handles WebSocket upgrade routing)
  const lobbyService = new WorkerLobbyService(server, wss, gm, log);

  setTimeout(
    () => {
      startMatchmakingPolling(gm);
    },
    1000 + Math.random() * 2000,
  );

  if (config.otelEnabled()) {
    initWorkerMetrics(gm);
  }

  vaultSeasonScheduler.start();
  antiCheatMonitor.start();

  const privilegeRefresher = new PrivilegeRefresher(
    config.jwtIssuer() + "/cosmetics.json",
    config.jwtIssuer() + "/profane_words_game_server",
    config.apiKey(),
    log,
  );
  privilegeRefresher.start();

  // Middleware to handle /wX path prefix
  app.use((req, res, next) => {
    // Extract the original path without the worker prefix
    const originalPath = req.url;
    const match = originalPath.match(/^\/w(\d+)(.*)$/);

    if (match) {
      const pathWorkerId = parseInt(match[1]);
      const actualPath = match[2] || "/";

      // Verify this request is for the correct worker
      if (pathWorkerId !== workerId) {
        return res.status(404).json({
          error: "Worker mismatch",
          message: `This is worker ${workerId}, but you requested worker ${pathWorkerId}`,
        });
      }

      // Update the URL to remove the worker prefix
      req.url = actualPath;
    }

    next();
  });

  app.set("trust proxy", 3);
  app.use(compression());
  app.use(express.json());

  // Configure MIME types for webp files
  express.static.mime.define({ "image/webp": ["webp"] });

  app.use(express.static(path.join(__dirname, "../../out")));
  app.use(
    "/maps",
    express.static(path.join(__dirname, "../../static/maps"), {
      maxAge: "1y",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".webp")) {
          res.setHeader("Content-Type", "image/webp");
        }
      },
    }),
  );
  app.use(
    rateLimit({
      windowMs: 1000, // 1 second
      max: 20, // 20 requests per IP per second
    }),
  );

  app.post("/api/create_game/:id", async (req, res) => {
    const id = req.params.id;

    // Extract persistentID from Authorization header token
    // Never accept persistentID directly from client
    let creatorPersistentID: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring("Bearer ".length);
      const result = await verifyClientToken(token, config);
      if (result.type === "success") {
        creatorPersistentID = result.persistentId;
      } else {
        log.warn(`Invalid creator token: ${result.message}`);
        return res.status(401).json({ error: "Invalid creator token" });
      }
    } else if (
      !req.headers[config.adminHeader()] // Public games use admin token instead
    ) {
      return res
        .status(400)
        .json({ error: "Authorization header required to create a game" });
    }

    if (!id) {
      log.warn(`cannot create game, id not found`);
      return res.status(400).json({ error: "Game ID is required" });
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const clientIP = req.ip || req.socket.remoteAddress || "unknown";
    const result = CreateGameInputSchema.safeParse(req.body);
    if (!result.success) {
      const error = z.prettifyError(result.error);
      return res.status(400).json({ error });
    }

    const gc = result.data;
    if (
      gc?.gameType === GameType.Public &&
      req.headers[config.adminHeader()] !== config.adminToken()
    ) {
      log.warn(
        `cannot create public game ${id}, ip ${ipAnonymize(clientIP)} incorrect admin token`,
      );
      return res.status(401).send("Unauthorized");
    }

    // Double-check this worker should host this game
    const expectedWorkerId = config.workerIndex(id);
    if (expectedWorkerId !== workerId) {
      log.warn(
        `This game ${id} should be on worker ${expectedWorkerId}, but this is worker ${workerId}`,
      );
      return res.status(400).json({ error: "Worker, game id mismatch" });
    }

    // Pass creatorPersistentID to createGame
    const game = gm.createGame(id, gc, creatorPersistentID);

    log.info(
      `Worker ${workerId}: IP ${ipAnonymize(clientIP)} creating ${game.isPublic() ? GameType.Public : GameType.Private}${gc?.gameMode ? ` ${gc.gameMode}` : ""} game with id ${id}${creatorPersistentID ? `, creator: ${creatorPersistentID.substring(0, 8)}...` : ""}`,
    );
    res.json(game.gameInfo());
  });

  // Add other endpoints from your original server
  app.post("/api/start_game/:id", async (req, res) => {
    log.info(`starting private lobby with id ${req.params.id}`);
    const game = gm.game(req.params.id);
    if (!game) {
      return;
    }
    if (game.isPublic()) {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const clientIP = req.ip || req.socket.remoteAddress || "unknown";
      log.info(
        `cannot start public game ${game.id}, game is public, ip: ${ipAnonymize(clientIP)}`,
      );
      return;
    }
    game.start();
    res.status(200).json({ success: true });
  });

  app.get("/api/game/:id/exists", async (req, res) => {
    const lobbyId = req.params.id;
    res.json({
      exists: gm.game(lobbyId) !== null,
    });
  });

  app.get("/api/game/:id", async (req, res) => {
    const game = gm.game(req.params.id);
    if (game === null) {
      log.info(`lobby ${req.params.id} not found`);
      return res.status(404).json({ error: "Game not found" });
    }
    res.json(game.gameInfo());
  });

  app.get("/api/vaultfront/contracts", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }
    const token = authHeader.substring("Bearer ".length);
    const result = await verifyClientToken(token, config);
    if (result.type === "error") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const seasonId = seasonIdUTC();
    const key = `${result.persistentId}:${seasonId}`;
    const existing = vaultFrontContractsStore.get(key) ?? {
      seasonId,
      interceptionTiming: 0,
      objectiveDenial: 0,
      comebackExecution: 0,
      rivalryRevenge: 0,
    };
    vaultFrontContractsStore.set(key, existing);
    return res.json(existing);
  });

  app.post("/api/vaultfront/contracts/update", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }
    const token = authHeader.substring("Bearer ".length);
    const auth = await verifyClientToken(token, config);
    if (auth.type === "error") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parse = VaultFrontSeasonContractDeltaSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.prettifyError(parse.error) });
    }
    const delta = parse.data;
    const seasonId = seasonIdUTC();
    const key = `${auth.persistentId}:${seasonId}`;
    const current = vaultFrontContractsStore.get(key) ?? {
      seasonId,
      interceptionTiming: 0,
      objectiveDenial: 0,
      comebackExecution: 0,
      rivalryRevenge: 0,
    };
    const next: VaultFrontSeasonContractState = {
      seasonId,
      interceptionTiming:
        current.interceptionTiming + delta.interceptionTimingDelta,
      objectiveDenial: current.objectiveDenial + delta.objectiveDenialDelta,
      comebackExecution:
        current.comebackExecution + delta.comebackExecutionDelta,
      rivalryRevenge: current.rivalryRevenge + delta.rivalryRevengeDelta,
    };
    vaultFrontContractsStore.set(key, next);
    return res.json(next);
  });

  app.get("/api/vaultfront/ab/dock/assignment", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const assignment = ensureDockAssignment(identity);
    return res.json(assignment);
  });

  app.post("/api/vaultfront/ab/dock/event", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const parsed = VaultFrontDockEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: z.prettifyError(parsed.error) });
    }
    const { event, value, variant } = parsed.data;
    const recorded = recordDockEvent(identity, event, value, variant);
    return res.json({
      ok: true,
      experimentId: "dock_layout_v1",
      variant: recorded.variant,
    });
  });

  app.get("/api/vaultfront/ab/dock/summary", async (req, res) => {
    if (req.headers[config.adminHeader()] !== config.adminToken()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const top = vaultFrontDockVariantStats.get("top") ?? {
      assignedUsers: 0,
      events: {},
      eventHistory: [],
    };
    const stack = vaultFrontDockVariantStats.get("stack") ?? {
      assignedUsers: 0,
      events: {},
      eventHistory: [],
    };
    const guardrail = buildDockGuardrailSummary(top, stack);
    return res.json({
      experimentId: "dock_layout_v1",
      generatedAt: Date.now(),
      variants: {
        top,
        stack,
      },
      assignedTotal: top.assignedUsers + stack.assignedUsers,
      guardrail,
    });
  });

  app.get("/api/vaultfront/ab/recap/assignment", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const assignment = ensureRecapAssignment(identity);
    return res.json(assignment);
  });

  app.post("/api/vaultfront/ab/recap/event", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const parsed = VaultFrontRecapEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: z.prettifyError(parsed.error) });
    }
    const { event, value, variant } = parsed.data;
    const recorded = recordRecapEvent(identity, event, value, variant);
    return res.json({
      ok: true,
      experimentId: "recap_cta_v1",
      variant: recorded.variant,
    });
  });

  app.get("/api/vaultfront/ab/recap/summary", async (req, res) => {
    if (req.headers[config.adminHeader()] !== config.adminToken()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const goal = vaultFrontRecapVariantStats.get("goal_focus") ?? {
      assignedUsers: 0,
      events: {},
      eventHistory: [],
    };
    const requeue = vaultFrontRecapVariantStats.get("requeue_focus") ?? {
      assignedUsers: 0,
      events: {},
      eventHistory: [],
    };
    const goalClicks =
      (goal.events.recap_goal_click ?? 0) + (goal.events.recap_goal_saved ?? 0);
    const requeueClicks = requeue.events.recap_requeue_click ?? 0;
    const goalCtaRate =
      goal.assignedUsers > 0 ? goalClicks / goal.assignedUsers : 0;
    const requeueCtaRate =
      requeue.assignedUsers > 0 ? requeueClicks / requeue.assignedUsers : 0;
    return res.json({
      experimentId: "recap_cta_v1",
      generatedAt: Date.now(),
      assignedTotal: goal.assignedUsers + requeue.assignedUsers,
      variants: {
        goal_focus: goal,
        requeue_focus: requeue,
      },
      cta: {
        goalFocusRate: Number(goalCtaRate.toFixed(4)),
        requeueFocusRate: Number(requeueCtaRate.toFixed(4)),
      },
    });
  });

  app.get("/api/vaultfront/ab/runtime/assignment", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const assignment = ensureRuntimeAssignment(identity);
    return res.json(assignment);
  });

  app.post("/api/vaultfront/ab/runtime/event", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const parsed = VaultFrontRuntimeEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: z.prettifyError(parsed.error) });
    }
    const { event, value, rewardVariant, hudVariant } = parsed.data;
    const recorded = recordRuntimeEvent(
      identity,
      event,
      value,
      rewardVariant,
      hudVariant,
    );
    return res.json({
      ok: true,
      experimentId: "vault_runtime_v1",
      rewardVariant: recorded.rewardVariant,
      hudVariant: recorded.hudVariant,
    });
  });

  app.get("/api/vaultfront/ab/runtime/summary", async (req, res) => {
    if (req.headers[config.adminHeader()] !== config.adminToken()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.json({
      experimentId: "vault_runtime_v1",
      generatedAt: Date.now(),
      rewardVariants: Object.fromEntries(
        vaultFrontRuntimeRewardStats.entries(),
      ),
      hudVariants: Object.fromEntries(vaultFrontRuntimeHudStats.entries()),
    });
  });

  app.post("/api/vaultfront/outcome", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const parsed = VaultFrontOutcomeTelemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: z.prettifyError(parsed.error) });
    }
    const bucketKey = recordOutcomeTelemetry(parsed.data);
    return res.json({
      ok: true,
      bucketKey,
    });
  });

  app.get("/api/vaultfront/outcome/summary", async (req, res) => {
    if (req.headers[config.adminHeader()] !== config.adminToken()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const all = vaultFrontOutcomeBuckets.get("all") ?? makeOutcomeBucket();
    const buckets = Array.from(vaultFrontOutcomeBuckets.entries())
      .filter(([key]) => key !== "all")
      .map(([key, value]) => ({
        key,
        matches: value.matches,
        winRate:
          value.matches > 0
            ? Number((value.wins / value.matches).toFixed(4))
            : 0,
        hudPerMatch: {
          vaultNoticeJumps:
            value.matches > 0
              ? Number(
                  (value.hudTotals.vaultNoticeJumps / value.matches).toFixed(3),
                )
              : 0,
          objectiveRailClicks:
            value.matches > 0
              ? Number(
                  (value.hudTotals.objectiveRailClicks / value.matches).toFixed(
                    3,
                  ),
                )
              : 0,
          timelineJumps:
            value.matches > 0
              ? Number(
                  (value.hudTotals.timelineJumps / value.matches).toFixed(3),
                )
              : 0,
        },
        recapCtaRate:
          value.matches > 0
            ? Number((value.recapCtaClicks / value.matches).toFixed(4))
            : 0,
        requeueRate:
          value.matches > 0
            ? Number((value.requeueClicks / value.matches).toFixed(4))
            : 0,
        recapVariant: value.recapVariant,
      }));

    return res.json({
      generatedAt: Date.now(),
      totals: {
        matches: all.matches,
        winRate:
          all.matches > 0 ? Number((all.wins / all.matches).toFixed(4)) : 0,
        recapCtaRate:
          all.matches > 0
            ? Number((all.recapCtaClicks / all.matches).toFixed(4))
            : 0,
        requeueRate:
          all.matches > 0
            ? Number((all.requeueClicks / all.matches).toFixed(4))
            : 0,
        hudPerMatch: {
          vaultNoticeJumps:
            all.matches > 0
              ? Number(
                  (all.hudTotals.vaultNoticeJumps / all.matches).toFixed(3),
                )
              : 0,
          objectiveRailClicks:
            all.matches > 0
              ? Number(
                  (all.hudTotals.objectiveRailClicks / all.matches).toFixed(3),
                )
              : 0,
          timelineJumps:
            all.matches > 0
              ? Number((all.hudTotals.timelineJumps / all.matches).toFixed(3))
              : 0,
        },
      },
      buckets,
    });
  });

  app.post("/api/vaultfront/funnel", async (req, res) => {
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const parsed = VaultFrontFunnelTelemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: z.prettifyError(parsed.error) });
    }
    recordFunnelTelemetry(parsed.data);
    return res.json({ ok: true });
  });

  app.get("/api/vaultfront/funnel/summary", async (req, res) => {
    if (req.headers[config.adminHeader()] !== config.adminToken()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const summary = Array.from(vaultFrontFunnelSummaries.entries()).map(
      ([key, value]) => ({
        key,
        matches: value.matches,
        winRate:
          value.matches > 0
            ? Number((value.wins / value.matches).toFixed(4))
            : 0,
        phases: value.phases,
      }),
    );
    return res.json({
      generatedAt: Date.now(),
      summaries: summary,
    });
  });

  // ── Anti-Cheat Admin ─────────────────────────────────────────────────────
  app.get("/api/admin/anti-cheat/flagged", async (req, res) => {
    if (req.headers[config.adminHeader()] !== config.adminToken()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const limit = Math.min(200, Number(req.query["limit"] ?? 50) || 50);
    const rows = await playerStatsStore.getFlaggedMatches(limit);
    return res.json({ generatedAt: Date.now(), count: rows.length, rows });
  });

  // ── Season / Mutator API ──────────────────────────────────────────────────
  const seasonRateLimit = rateLimit({
    windowMs: 60_000, // 1 minute
    max: 60, // 60 requests per IP per minute
  });

  app.get("/api/season/current", seasonRateLimit, (_req, res) => {
    const status: SeasonStatus = vaultSeasonScheduler.getStatus();
    return res.json(status);
  });

  const MutatorVoteSchema = z.object({
    candidateKey: z.string().max(64),
    voterId: z.string().max(128).optional(),
  });

  const mutatorVoteRateLimit = rateLimit({
    windowMs: 60_000,
    max: 5, // 5 votes per IP per minute — prevents ballot-stuffing
  });

  app.post(
    "/api/mutator-vote",
    mutatorVoteRateLimit,
    (req: Request, res: Response) => {
      const parsed = MutatorVoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid vote payload" });
      }
      const { candidateKey, voterId } = parsed.data;
      vaultSeasonScheduler.recordVote(candidateKey, voterId);
      return res.json({ ok: true });
    },
  );
  // ─────────────────────────────────────────────────────────────────────────

  // ── Battle Narrative API ─────────────────────────────────────────────────
  const narrativeRateLimit = rateLimit({
    windowMs: 60_000,
    max: 10, // generous — one per match per player
  });

  const BattleNarrativeInputSchema = z.object({
    matchId: z.string().max(64),
    events: z
      .array(
        z.object({
          type: z.string(),
          player: z.string().optional(),
          tick: z.number().optional(),
          detail: z.string().optional(),
        }),
      )
      .max(20),
    winnerId: z.string().optional(),
    durationSeconds: z.number().int().min(0).max(7200),
  });

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });

  app.post(
    "/api/vaultfront/battle-narrative",
    narrativeRateLimit,
    async (req, res) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "Narrative service unavailable" });
      }
      const identity = await resolveVaultFrontIdentity(req);
      if (!identity) {
        return res.status(401).json({ error: "Missing identity" });
      }
      const parsed = BattleNarrativeInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: z.prettifyError(parsed.error) });
      }
      const { events, winnerId, durationSeconds } = parsed.data;
      const eventSummary = events
        .map(
          (e) =>
            `[${e.type}]${e.player ? ` ${e.player}` : ""}${e.detail ? `: ${e.detail}` : ""}`,
        )
        .join("\n");
      const minutes = Math.floor(durationSeconds / 60);
      const prompt = `You are a battle chronicler for VaultFront, a browser real-time strategy game where players contest vault sites, route convoys, and trigger comeback surges.\n\nMatch duration: ${minutes} minutes\n${winnerId ? `Winner: ${winnerId}\n` : ""}Key events:\n${eventSummary}\n\nWrite a 3-paragraph battle chronicle in an epic, cinematic tone. First paragraph: the opening moves and territory struggles. Second paragraph: the pivotal vault and convoy moments. Third paragraph: the endgame and outcome. Keep each paragraph to 2-3 sentences. Use dramatic but accurate language.`;

      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        });
        const narrative =
          message.content[0].type === "text" ? message.content[0].text : "";
        return res.json({ ok: true, narrative });
      } catch (err) {
        logger.error("battle-narrative generation failed", err);
        return res.status(500).json({ error: "Narrative generation failed" });
      }
    },
  );

  // ── Vault Prophecy ────────────────────────────────────────────────────────
  const prophecyRateLimit = rateLimit({ windowMs: 10_000, max: 5 });
  const PROPHECY_SYSTEM_PROMPT =
    "You are an ancient oracle who speaks in cryptic, poetic verse about battles. Generate exactly 2 sentences — dramatic, vague, and atmospheric. Never mention specific game mechanics or rule names. Be ominous.";

  app.post(
    "/api/vaultfront/match-prophecy",
    prophecyRateLimit,
    async (req, res) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "Prophecy service unavailable" });
      }
      const {
        mapName = "the battlefield",
        playerCount = 4,
        mutator = "none",
      } = req.body ?? {};
      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 80,
          system: [
            {
              type: "text",
              text: PROPHECY_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Map: ${mapName}. Players: ${playerCount}. Active condition: ${mutator}.`,
            },
          ],
        });
        const prophecy =
          message.content[0].type === "text" ? message.content[0].text : "";
        return res.json({ ok: true, prophecy });
      } catch (err) {
        logger.error("match-prophecy generation failed", err);
        return res.status(500).json({ error: "Prophecy generation failed" });
      }
    },
  );

  // ── Live Event Commentary ─────────────────────────────────────────────────
  const commentaryRateLimit = rateLimit({ windowMs: 10_000, max: 5 });
  const COMMENTARY_SYSTEM_PROMPT =
    'You are a sports commentator for a real-time strategy game called VaultFront. Generate exactly 10 one-line commentary strings keyed by event type. Return ONLY valid JSON: {"vault_captured": "...", "convoy_intercepted": "...", "convoy_delivered": "...", "last_stand": "...", "heist_executed": "...", "bounty_collected": "...", "comeback_surge": "...", "warchest_hunt": "...", "map_event": "...", "general": "..."}. Be dramatic and concise — max 10 words per line.';

  app.post(
    "/api/vaultfront/match-commentary",
    commentaryRateLimit,
    async (req, res) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        return res
          .status(503)
          .json({ error: "Commentary service unavailable" });
      }
      const {
        playerCount = 4,
        mutator = "none",
        mapName = "unknown",
      } = req.body ?? {};
      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: [
            {
              type: "text",
              text: COMMENTARY_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `${playerCount} players, map: ${mapName}, mutator: ${mutator}. Generate commentary.`,
            },
          ],
        });
        const raw =
          message.content[0].type === "text" ? message.content[0].text : "{}";
        let commentary: Record<string, string> = {};
        try {
          commentary = JSON.parse(raw);
        } catch {
          commentary = { general: "The battle rages on!" };
        }
        return res.json({ ok: true, commentary });
      } catch (err) {
        logger.error("match-commentary generation failed", err);
        return res.status(500).json({ error: "Commentary generation failed" });
      }
    },
  );

  // ── NPC Lore Generation ────────────────────────────────────────────────────
  const BOT_LORE_SYSTEM_PROMPT =
    'You generate faction lore for AI opponents in a real-time strategy game. Return ONLY valid JSON with fields: {"factionName": string, "emblem": string (single emoji), "defeatQuote": string (max 12 words, dramatic), "victoryQuote": string (max 12 words, triumphant)}.';

  const botLoreCache = new Map<
    string,
    {
      factionName: string;
      emblem: string;
      defeatQuote: string;
      victoryQuote: string;
    }
  >();

  const BOT_PERSONALITIES = [
    "aggressive",
    "economic",
    "diplomatic",
    "ghost",
  ] as const;

  async function initBotLore(): Promise<void> {
    if (!process.env.ANTHROPIC_API_KEY) return;
    for (const personality of BOT_PERSONALITIES) {
      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 120,
          system: [
            {
              type: "text",
              text: BOT_LORE_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Generate lore for a ${personality} AI faction.`,
            },
          ],
        });
        const raw =
          message.content[0].type === "text" ? message.content[0].text : "{}";
        try {
          const lore = JSON.parse(raw);
          botLoreCache.set(personality, lore);
        } catch {
          botLoreCache.set(personality, {
            factionName: `The ${personality.charAt(0).toUpperCase() + personality.slice(1)} Order`,
            emblem: "⚔️",
            defeatQuote: "We shall not be forgotten.",
            victoryQuote: "The vaults are ours.",
          });
        }
      } catch (err) {
        logger.error(`bot-lore generation failed for ${personality}`, err);
      }
    }
  }

  initBotLore().catch((err) => logger.error("bot-lore init failed", err));

  app.get("/api/vaultfront/bot-lore/:personality", (req, res) => {
    const personality = req.params.personality;
    const lore = botLoreCache.get(personality);
    if (!lore) {
      return res.status(404).json({ error: "Lore not yet generated" });
    }
    return res.json({ ok: true, lore });
  });

  // ── Mission Brief System ───────────────────────────────────────────────────
  const missionRateLimit = rateLimit({ windowMs: 10_000, max: 5 });
  const MISSION_SYSTEM_PROMPT =
    'You generate unique match objectives for a real-time strategy game called VaultFront. Return ONLY valid JSON: {"objectiveText": string (max 20 words, specific and achievable), "conditionType": "VAULTS_CAPTURED" | "CONVOYS_DELIVERED" | "TICKS_HELD_LEAD", "conditionValue": number, "bonusElo": number (10-40)}. Make objectives specific and achievable in a typical match.';

  app.post(
    "/api/vaultfront/match-mission",
    missionRateLimit,
    async (req, res) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "Mission service unavailable" });
      }
      const {
        mapName = "unknown",
        playerCount = 4,
        mutator = "none",
        vaultSiteCount = 5,
      } = req.body ?? {};
      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150,
          system: [
            {
              type: "text",
              text: MISSION_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Map: ${mapName}. Players: ${playerCount}. Mutator: ${mutator}. Vault sites: ${vaultSiteCount}. Generate a mission.`,
            },
          ],
        });
        const raw =
          message.content[0].type === "text" ? message.content[0].text : "{}";
        let mission: {
          objectiveText: string;
          conditionType: string;
          conditionValue: number;
          bonusElo: number;
        } = {
          objectiveText: "Capture 2 vault sites before tick 500.",
          conditionType: "VAULTS_CAPTURED",
          conditionValue: 2,
          bonusElo: 20,
        };
        try {
          mission = JSON.parse(raw);
        } catch {
          // use default
        }
        return res.json({ ok: true, mission });
      } catch (err) {
        logger.error("match-mission generation failed", err);
        return res.status(500).json({ error: "Mission generation failed" });
      }
    },
  );

  // ── AI Coach Overlay ───────────────────────────────────────────────────────
  const coachRateLimit = rateLimit({ windowMs: 60_000, max: 3 });
  const COACH_SYSTEM_PROMPT =
    "You are a tactical coach for VaultFront, a browser real-time strategy game. Analyze the player's top decisions from a match and provide a 3-paragraph tactical debrief. Paragraph 1: what worked well. Paragraph 2: the costliest mistake. Paragraph 3: one concrete improvement for next match. Be specific, encouraging, and concise (2-3 sentences per paragraph). Reference actual events from the log.";

  app.post("/api/vaultfront/match-coach", coachRateLimit, async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "Coach service unavailable" });
    }
    const identity = await resolveVaultFrontIdentity(req);
    if (!identity) {
      return res.status(401).json({ error: "Missing identity" });
    }
    const { events = [] } = req.body ?? {};
    const eventSummary = (
      events as Array<{ type: string; tick: number; detail?: string }>
    )
      .slice(0, 10)
      .map(
        (e) => `[tick ${e.tick}] ${e.type}${e.detail ? `: ${e.detail}` : ""}`,
      )
      .join("\n");

    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.flushHeaders();

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: COACH_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `My top 10 match events:\n${eventSummary || "No events recorded."}\n\nPlease provide my tactical debrief.`,
          },
        ],
      });

      stream.on("text", (text) => {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      });
      stream.on("finalMessage", () => {
        res.write("data: [DONE]\n\n");
        res.end();
      });
      stream.on("error", (err) => {
        logger.error("match-coach stream error", err);
        res.end();
      });
    } catch (err) {
      logger.error("match-coach failed", err);
      return res.status(500).json({ error: "Coach generation failed" });
    }
  });

  // ── Player Stats / Leaderboard API ───────────────────────────────────────
  const statsRateLimit = rateLimit({
    windowMs: 60_000, // 1 minute
    max: 30, // 30 requests per IP per minute
  });

  app.get(
    "/api/player/history/:persistentId",
    statsRateLimit,
    async (req, res) => {
      const parsed = PersistentIdSchema.safeParse(req.params.persistentId);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid persistentId" });
      }
      try {
        const history = await playerStatsStore.getHistory(parsed.data, 20);
        return res.json(history);
      } catch (err) {
        log.error("Error fetching player history", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.get("/api/leaderboard", statsRateLimit, async (_req, res) => {
    try {
      const entries = await playerStatsStore.getLeaderboard(50);
      return res.json(entries);
    } catch (err) {
      log.error("Error fetching leaderboard", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get(
    "/api/player/stats/:persistentId",
    statsRateLimit,
    async (req, res) => {
      const parsed = PersistentIdSchema.safeParse(req.params.persistentId);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid persistentId" });
      }
      try {
        const stats = await playerStatsStore.getPlayerStats(parsed.data);
        if (!stats) {
          return res.status(404).json({ error: "Player not found" });
        }
        return res.json({
          ...stats,
          eloLabel: EloRating.ratingLabel(stats.eloRating),
        });
      } catch (err) {
        log.error("Error fetching player stats", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );
  // ─────────────────────────────────────────────────────────────────────────

  // ── Replay API ───────────────────────────────────────────────────────────
  app.get("/api/replays", async (_req, res) => {
    const list = await replayStore.listReplays(40);
    res.json(list);
  });

  app.get("/api/replay/:id", async (req, res) => {
    const gameId = req.params.id;
    if (!gameId) return res.status(400).json({ error: "Missing game ID" });
    const manifest = await replayStore.getReplay(gameId);
    if (!manifest) return res.status(404).json({ error: "Replay not found" });
    // Strip raw binary intents from the response (turns[] is sufficient for playback)
    const { intents: _intents, ...safe } = manifest;
    void _intents;
    return res.json(safe);
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Match invite deep links ───────────────────────────────────────────────
  app.get("/api/invite/:gameId", (req, res) => {
    const { gameId } = req.params;
    if (!gameId) return res.status(400).json({ error: "Missing gameId" });

    const game = gm.game(gameId as GameID);
    const playerCount = game?.numClients() ?? 0;
    const mapName = game?.gameConfig.gameMap ?? "Unknown Map";
    const phase = game?.phase() ?? "unknown";

    const playBase =
      process.env.PLAY_BASE_URL ??
      "https://play-vaultfront.vaultsparkstudios.com";
    const shareUrl = `${playBase}/join?gameId=${encodeURIComponent(gameId)}`;

    return res.json({
      gameId,
      mapName,
      playerCount,
      phase,
      shareUrl,
      ogTitle: `Join my VaultFront match — ${mapName}`,
      ogDescription: `${playerCount} player${playerCount !== 1 ? "s" : ""} in a live vault siege. Click to join!`,
      ogImageUrl: `${playBase}/resources/maps/${encodeURIComponent(mapName)}.webp`,
    });
  });
  // ─────────────────────────────────────────────────────────────────────────

  registerGamePreviewRoute({
    app,
    gm,
    config,
    workerId,
    log,
    baseDir: __dirname,
  });

  app.post("/api/archive_singleplayer_game", async (req, res) => {
    try {
      const record = req.body;

      const result = PartialGameRecordSchema.safeParse(record);
      if (!result.success) {
        const error = z.prettifyError(result.error);
        log.info(error);
        return res.status(400).json({ error });
      }
      const gameRecord = result.data;

      if (gameRecord.info.config.gameType !== GameType.Singleplayer) {
        log.warn(
          `cannot archive singleplayer with game type ${gameRecord.info.config.gameType}`,
          {
            gameID: gameRecord.info.gameID,
          },
        );
        return res.status(400).json({ error: "Invalid request" });
      }

      if (result.data.info.players.length !== 1) {
        log.warn(`cannot archive singleplayer game multiple players`, {
          gameID: gameRecord.info.gameID,
        });
        return res.status(400).json({ error: "Invalid request" });
      }

      log.info("archiving singleplayer game", {
        gameID: gameRecord.info.gameID,
      });

      archive(finalizeGameRecord(gameRecord));
      res.json({
        success: true,
      });
    } catch (error) {
      log.error("Error processing archive request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Clan / Squad API ─────────────────────────────────────────────────────
  const clanRateLimit = rateLimit({ windowMs: 60_000, max: 30 });

  app.post("/api/clans", clanRateLimit, async (req, res) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(32),
        tag: z.string().min(2).max(6),
        founderId: z.string().min(1).max(64),
        description: z.string().max(256).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: z.prettifyError(parsed.error) });
    const result = await clanStore.createClan(
      parsed.data.name,
      parsed.data.tag,
      parsed.data.founderId,
      parsed.data.description,
    );
    if ("error" in result) return res.status(409).json(result);
    return res.status(201).json(result);
  });

  app.get("/api/clans/leaderboard", clanRateLimit, (_req, res) =>
    res.json(clanStore.getClanLeaderboard(50)),
  );

  app.get("/api/clans/:clanId", clanRateLimit, (req, res) => {
    const clan = clanStore.getClan(req.params.clanId);
    if (!clan) return res.status(404).json({ error: "Clan not found" });
    return res.json(clan);
  });

  app.get("/api/clans/player/:persistentId", clanRateLimit, (req, res) => {
    const clan = clanStore.getClanByPlayer(req.params.persistentId);
    if (!clan) return res.status(404).json({ error: "Not in a clan" });
    return res.json(clan);
  });

  app.post("/api/clans/:clanId/join", clanRateLimit, async (req, res) => {
    const parsed = z
      .object({ persistentId: z.string().min(1).max(64) })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Missing persistentId" });
    const result = await clanStore.joinClan(
      req.params.clanId,
      parsed.data.persistentId,
    );
    if ("error" in result) return res.status(409).json(result);
    return res.json(result);
  });

  app.post("/api/clans/leave", clanRateLimit, async (req, res) => {
    const parsed = z
      .object({ persistentId: z.string().min(1).max(64) })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Missing persistentId" });
    const result = await clanStore.leaveClan(parsed.data.persistentId);
    if (result && "error" in result) return res.status(409).json(result);
    return res.json({ ok: true });
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Tutorial API ──────────────────────────────────────────────────────────
  app.get("/api/tutorial/state/:persistentId", (req, res) => {
    const state = tutorialOrchestrator.getState(req.params.persistentId);
    return res.json(state);
  });

  app.post("/api/tutorial/complete", (req, res) => {
    const parsed = z
      .object({
        persistentId: z.string().min(1).max(64),
        step: z.string().min(1).max(64),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Missing fields" });
    const state = tutorialOrchestrator.completeStep(
      parsed.data.persistentId,
      parsed.data.step,
    );
    return res.json(state);
  });

  app.post("/api/tutorial/reset", (req, res) => {
    const parsed = z
      .object({ persistentId: z.string().min(1).max(64) })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Missing persistentId" });
    tutorialOrchestrator.resetProgress(parsed.data.persistentId);
    return res.json({ ok: true });
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Tournament API ────────────────────────────────────────────────────────
  const tourneyRateLimit = rateLimit({ windowMs: 60_000, max: 20 });

  app.post("/api/tournaments", tourneyRateLimit, async (req, res) => {
    const parsed = z
      .object({
        name: z.string().min(3).max(64),
        mapName: z.string().max(128).optional(),
        maxPlayers: z.number().int().min(4).max(64).optional(),
        createdBy: z.string().min(1).max(64),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: z.prettifyError(parsed.error) });
    const t = await tournamentStore.create(parsed.data);
    return res.status(201).json(t);
  });

  app.get("/api/tournaments", tourneyRateLimit, async (_req, res) =>
    res.json(await tournamentStore.list()),
  );

  app.get("/api/tournaments/:id", tourneyRateLimit, async (req, res) => {
    const t = await tournamentStore.get(req.params.id);
    if (!t) return res.status(404).json({ error: "Tournament not found" });
    return res.json(t);
  });

  app.get(
    "/api/tournaments/:id/bracket",
    tourneyRateLimit,
    async (req, res) => {
      const bracket = await tournamentStore.getBracket(req.params.id);
      if (!bracket)
        return res.status(404).json({ error: "Tournament not found" });
      return res.json(bracket);
    },
  );

  app.post(
    "/api/tournaments/:id/register",
    tourneyRateLimit,
    async (req, res) => {
      const parsed = z
        .object({
          persistentId: z.string().min(1).max(64),
          eloRating: z.number().int().min(0).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Missing persistentId" });
      const result = await tournamentStore.register(
        req.params.id,
        parsed.data.persistentId,
        parsed.data.eloRating ?? 1200,
      );
      if ("error" in result) return res.status(409).json(result);
      return res.json(result);
    },
  );

  app.post("/api/tournaments/:id/seed", tourneyRateLimit, async (req, res) => {
    const result = await tournamentStore.seedBracket(req.params.id);
    if ("error" in result) return res.status(409).json(result);
    return res.json(result);
  });

  app.post(
    "/api/tournaments/matches/:matchId/report",
    tourneyRateLimit,
    async (req, res) => {
      const parsed = z
        .object({ winnerId: z.string().min(1).max(64) })
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Missing winnerId" });
      const result = await tournamentStore.reportResult(
        parseInt(req.params.matchId),
        parsed.data.winnerId,
      );
      if ("error" in result) return res.status(409).json(result);
      return res.json(result);
    },
  );
  // ─────────────────────────────────────────────────────────────────────────

  // ── Rematch queue ─────────────────────────────────────────────────────────
  const rematchRateLimit = rateLimit({
    windowMs: 60_000,
    max: 10,
  });

  app.post("/api/rematch/:gameId", rematchRateLimit, async (req, res) => {
    const { gameId } = req.params;
    if (!gameId) return res.status(400).json({ error: "Missing gameId" });
    const parsed = z
      .object({ playerId: z.string().min(1).max(128) })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Missing playerId" });
    const game = gm.game(gameId as GameID);
    const mapName = game?.gameConfig.gameMap ?? "";
    const entry = rematchStore.upsert(gameId, parsed.data.playerId, mapName);
    return res.json(entry);
  });

  app.get("/api/rematch/status/:gameId", rematchRateLimit, (req, res) => {
    const { gameId } = req.params;
    if (!gameId) return res.status(400).json({ error: "Missing gameId" });
    const entry = rematchStore.get(gameId);
    if (!entry) return res.status(404).json({ error: "No rematch found" });
    return res.json(entry);
  });

  app.get("/api/rematch/code/:code", rematchRateLimit, (req, res) => {
    const { code } = req.params;
    if (!code) return res.status(400).json({ error: "Missing code" });
    const entry = rematchStore.getByCode(code);
    if (!entry)
      return res.status(404).json({ error: "Rematch not found or expired" });
    return res.json(entry);
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Replay highlight clips ────────────────────────────────────────────────
  app.get("/api/replay/:gameId/highlight", async (req, res) => {
    const { gameId } = req.params;
    if (!gameId) return res.status(400).json({ error: "Missing gameId" });
    const manifest = await replayStore.getReplay(gameId);
    if (!manifest) return res.status(404).json({ error: "Replay not found" });
    const highlight = replayHighlightStore.getOrCreate(gameId, manifest);
    return res.json(highlight);
  });

  const CustomClipSchema = z.object({
    startTick: z.number().int().min(0),
    endTick: z.number().int().min(0),
  });

  const clipRateLimit = rateLimit({ windowMs: 60_000, max: 20 });

  app.post(
    "/api/replay/:gameId/clip",
    clipRateLimit,
    async (req: Request, res: Response) => {
      const { gameId } = req.params;
      if (!gameId) return res.status(400).json({ error: "Missing gameId" });

      const parsed = CustomClipSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid clip range" });
      }
      const { startTick, endTick } = parsed.data;
      if (endTick <= startTick) {
        return res.status(400).json({ error: "endTick must be > startTick" });
      }

      const manifest = await replayStore.getReplay(gameId);
      if (!manifest) return res.status(404).json({ error: "Replay not found" });

      const { nanoid } = await import("nanoid");
      const clipId = nanoid(10);
      const playBase =
        process.env.PLAY_BASE_URL ??
        "https://play-vaultfront.vaultsparkstudios.com";
      const shareUrl = `${playBase}/replay/${encodeURIComponent(gameId)}?clip=${clipId}&start=${startTick}&end=${endTick}`;

      return res.json({
        clipId,
        shareUrl,
        gameId,
        startTick,
        endTick,
        mapName: manifest.mapName ?? "Unknown Map",
      });
    },
  );
  // ─────────────────────────────────────────────────────────────────────────

  // WebSocket handling
  wss.on("connection", (ws: WebSocket, req) => {
    ws.on("message", async (message: string) => {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwarded)
        ? forwarded[0]
        : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          forwarded || req.socket.remoteAddress || "unknown";

      try {
        // Parse and handle client messages
        const parsed = ClientMessageSchema.safeParse(
          JSON.parse(message.toString()),
        );
        if (!parsed.success) {
          const error = z.prettifyError(parsed.error);
          log.warn("Error parsing client message", error);
          ws.send(
            JSON.stringify({
              type: "error",
              error: error.toString(),
            } satisfies ServerErrorMessage),
          );
          ws.close(1002, "ClientJoinMessageSchema");
          return;
        }
        const clientMsg = parsed.data;

        if (clientMsg.type === "ping") {
          // Ignore ping
          return;
        } else if (clientMsg.type !== "join" && clientMsg.type !== "rejoin") {
          log.warn(
            `Invalid message before join: ${JSON.stringify(clientMsg, replacer)}`,
          );
          return;
        }

        // Verify this worker should handle this game
        const expectedWorkerId = config.workerIndex(clientMsg.gameID);
        if (expectedWorkerId !== workerId) {
          log.warn(
            `Worker mismatch: Game ${clientMsg.gameID} should be on worker ${expectedWorkerId}, but this is worker ${workerId}`,
          );
          return;
        }

        // Verify token signature
        const result = await verifyClientToken(clientMsg.token, config);
        if (result.type === "error") {
          log.warn(`Invalid token: ${result.message}`, {
            gameID: clientMsg.gameID,
          });
          ws.close(1002, `Unauthorized: invalid token`);
          return;
        }
        const { persistentId, claims } = result;

        if (clientMsg.type === "rejoin") {
          log.info("rejoining game", {
            gameID: clientMsg.gameID,
            persistentID: persistentId,
          });
          const wasFound = gm.rejoinClient(
            ws,
            persistentId,
            clientMsg.gameID,
            clientMsg.lastTurn,
          );
          if (!wasFound) {
            log.warn(
              `game ${clientMsg.gameID} not found on worker ${workerId}`,
            );
            ws.close(1002, "Game not found");
          }
          return;
        }

        // Try to reconnect an existing client (e.g., page refresh)
        // If successful, skip all authorization (but pass updated username
        // so players can rename in the pre-game lobby)
        const censoredUsername = privilegeRefresher
          .get()
          .censorUsername(clientMsg.username);
        if (
          gm.rejoinClient(
            ws,
            persistentId,
            clientMsg.gameID,
            0,
            censoredUsername,
          )
        ) {
          return;
        }

        let roles: string[] | undefined;
        let flares: string[] | undefined;

        const allowedFlares = config.allowedFlares();
        if (claims === null) {
          if (allowedFlares !== undefined) {
            log.warn("Unauthorized: Anonymous user attempted to join game");
            ws.close(1002, "Unauthorized");
            return;
          }
        } else {
          // Verify token and get player permissions
          const result = await getUserMe(clientMsg.token, config);
          if (result.type === "error") {
            log.warn(`Unauthorized: ${result.message}`, {
              persistentID: persistentId,
              gameID: clientMsg.gameID,
            });
            ws.close(1002, "Unauthorized: user me fetch failed");
            return;
          }
          roles = result.response.player.roles;
          flares = result.response.player.flares;

          if (allowedFlares !== undefined) {
            const allowed =
              allowedFlares.length === 0 ||
              allowedFlares.some((f) => flares?.includes(f));
            if (!allowed) {
              log.warn(
                "Forbidden: player without an allowed flare attempted to join game",
              );
              ws.close(1002, "Forbidden");
              return;
            }
          }
        }

        const cosmeticResult = privilegeRefresher
          .get()
          .isAllowed(flares ?? [], clientMsg.cosmetics ?? {});

        if (cosmeticResult.type === "forbidden") {
          log.warn(`Forbidden: ${cosmeticResult.reason}`, {
            persistentID: persistentId,
            gameID: clientMsg.gameID,
          });
          ws.close(1002, cosmeticResult.reason);
          return;
        }

        if (config.env() !== GameEnv.Dev) {
          const turnstileResult = await verifyTurnstileToken(
            ip,
            clientMsg.turnstileToken,
            config.turnstileSecretKey(),
          );
          switch (turnstileResult.status) {
            case "approved":
              break;
            case "rejected":
              log.warn("Unauthorized: Turnstile token rejected", {
                persistentID: persistentId,
                gameID: clientMsg.gameID,
                reason: turnstileResult.reason,
              });
              ws.close(1002, "Unauthorized: Turnstile token rejected");
              return;
            case "error":
              // Fail open, allow the client to join.
              log.error("Turnstile token error", {
                persistentID: persistentId,
                gameID: clientMsg.gameID,
                reason: turnstileResult.reason,
              });
          }
        }

        // Create client and add to game
        const client = new Client(
          generateID(),
          persistentId,
          claims,
          roles,
          flares,
          ip,
          censoredUsername,
          clientMsg.username,
          ws,
          cosmeticResult.cosmetics,
        );

        const joinResult = gm.joinClient(client, clientMsg.gameID);

        if (joinResult === "not_found") {
          log.info(`game ${clientMsg.gameID} not found on worker ${workerId}`);
          ws.close(1002, "Game not found");
        } else if (joinResult === "kicked") {
          log.warn(`kicked client tried to join game ${clientMsg.gameID}`, {
            gameID: clientMsg.gameID,
            workerId,
          });
          ws.close(1002, "Cannot join game");
        } else if (joinResult === "rejected") {
          log.info(`client rejected from game ${clientMsg.gameID}`, {
            gameID: clientMsg.gameID,
            workerId,
          });
          ws.close(1002, "Lobby full");
        }

        // Handle other message types
      } catch (error) {
        ws.close(1011, "Internal server error");
        log.warn(
          `error handling websocket message for ${ipAnonymize(ip)}: ${error}`.substring(
            0,
            250,
          ),
        );
      }
    });

    ws.on("error", (error: Error) => {
      if ((error as any).code === "WS_ERR_UNEXPECTED_RSV_1") {
        ws.close(1002, "WS_ERR_UNEXPECTED_RSV_1");
      }
    });
    ws.on("close", () => {
      ws.removeAllListeners();
    });
  });

  // The load balancer will handle routing to this server based on path
  const PORT = config.workerPortByIndex(workerId);
  server.listen(PORT, () => {
    log.info(`running on http://localhost:${PORT}`);
    log.info(`Handling requests with path prefix /w${workerId}/`);
    // Signal to the master process that this worker is ready
    lobbyService.sendReady(workerId);
    log.info(`signaled ready state to master`);
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    log.error(`Error in ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: "An unexpected error occurred" });
  });

  // Process-level error handlers
  process.on("uncaughtException", (err) => {
    log.error(`uncaught exception:`, err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    log.error(`unhandled rejection at:`, promise, "reason:", reason);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log.info(
      `[worker ${workerId}] received ${signal} — starting graceful shutdown`,
    );

    // Stop the HTTP server from accepting new connections
    server.close(() => {
      log.info(`[worker ${workerId}] HTTP server closed`);
    });

    // Wait up to 30 s for active games to finish
    const DRAIN_TIMEOUT_MS = 30_000;
    const POLL_INTERVAL_MS = 1_000;
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const active = gm.activeGameCount();
      if (active === 0) break;
      log.info(`[worker ${workerId}] draining ${active} active game(s)…`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    log.info(`[worker ${workerId}] shutdown complete`);
    process.exit(0);
  }

  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
  // ─────────────────────────────────────────────────────────────────────────
}

async function startMatchmakingPolling(gm: GameManager) {
  startPolling(
    async () => {
      try {
        const url = `${config.jwtIssuer() + "/matchmaking/checkin"}`;
        const gameId = generateGameIdForWorker();
        if (gameId === null) {
          log.warn(`Failed to generate game ID for worker ${workerId}`);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey(),
          },
          body: JSON.stringify({
            id: workerId,
            gameId: gameId,
            ccu: gm.activeClients(),
            instanceId: process.env.INSTANCE_ID,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          log.warn(
            `Failed to poll lobby: ${response.status} ${response.statusText}`,
          );
          return;
        }

        const data = await response.json();
        log.info(`Lobby poll successful:`, data);

        if (data.assignment) {
          gm.createGame(
            gameId,
            playlist.get1v1Config(),
            undefined,
            Date.now() + 7000,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // Abort is expected if no game is scheduled on this worker.
          return;
        }
        log.error(`Error polling lobby:`, error);
      }
    },
    5000 + Math.random() * 1000,
  );
}

// TODO: This is a hack to generate a game ID for the worker.
// It should be replaced with a more robust solution.
function generateGameIdForWorker(): GameID | null {
  let attempts = 1000;
  while (attempts > 0) {
    const gameId = generateID();
    if (workerId === config.workerIndex(gameId)) {
      return gameId;
    }
    attempts--;
  }
  log.warn(`Failed to generate game ID for worker ${workerId}`);
  return null;
}
