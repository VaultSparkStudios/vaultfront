import { z } from "zod";
import {
  ClanLeaderboardResponse,
  ClanLeaderboardResponseSchema,
  PlayerProfile,
  PlayerProfileSchema,
  RankedLeaderboardResponse,
  RankedLeaderboardResponseSchema,
  UserMeResponse,
  UserMeResponseSchema,
} from "../core/ApiSchemas";
import { appUrl } from "../core/RuntimeUrls";
import { AnalyticsRecord, AnalyticsRecordSchema } from "../core/Schemas";
import { getAuthHeader, getPlayToken, logOut, userAuth } from "./Auth";

export async function fetchPlayerById(
  playerId: string,
): Promise<PlayerProfile | false> {
  try {
    const userAuthResult = await userAuth();
    if (!userAuthResult) return false;
    const { jwt } = userAuthResult;

    const url = `${getApiBase()}/player/${encodeURIComponent(playerId)}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (res.status !== 200) {
      console.warn(
        "fetchPlayerById: unexpected status",
        res.status,
        res.statusText,
      );
      return false;
    }

    const json = await res.json();
    const parsed = PlayerProfileSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("fetchPlayerById: Zod validation failed", parsed.error);
      return false;
    }

    return parsed.data;
  } catch (err) {
    console.warn("fetchPlayerById: request failed", err);
    return false;
  }
}

let __userMe: Promise<UserMeResponse | false> | null = null;
export async function getUserMe(): Promise<UserMeResponse | false> {
  if (__userMe !== null) {
    return __userMe;
  }
  __userMe = (async () => {
    try {
      const userAuthResult = await userAuth();
      if (!userAuthResult) return false;
      const { jwt } = userAuthResult;

      // Get the user object
      const response = await fetch(getApiBase() + "/users/@me", {
        headers: {
          authorization: `Bearer ${jwt}`,
        },
      });
      if (response.status === 401) {
        await logOut();
        return false;
      }
      if (response.status !== 200) return false;
      const body = await response.json();
      const result = UserMeResponseSchema.safeParse(body);
      if (!result.success) {
        const error = z.prettifyError(result.error);
        console.error("Invalid response", error);
        return false;
      }
      return result.data;
    } catch (e) {
      return false;
    }
  })();
  return __userMe;
}

export async function createCheckoutSession(
  priceId: string,
  colorPaletteName: string | null,
): Promise<string | false> {
  try {
    const response = await fetch(
      `${getApiBase()}/stripe/create-checkout-session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: await getAuthHeader(),
        },
        body: JSON.stringify({
          priceId: priceId,
          hostname: appUrl(""),
          colorPaletteName: colorPaletteName,
        }),
      },
    );
    if (!response.ok) {
      console.error(
        "createCheckoutSession: request failed",
        response.status,
        response.statusText,
      );
      return false;
    }
    const json = await response.json();
    return json.url;
  } catch (e) {
    console.error("createCheckoutSession: request failed", e);
    return false;
  }
}

export function getApiBase() {
  const apiDomain = process?.env?.API_DOMAIN;
  if (apiDomain) {
    return /^https?:\/\//.test(apiDomain) ? apiDomain : `https://${apiDomain}`;
  }

  const domainname = getAudience();
  if (domainname === "localhost") {
    return localStorage.getItem("apiHost") ?? "http://localhost:8787";
  }

  return `https://api.${domainname}`;
}

export function getAudience() {
  const { hostname } = new URL(window.location.href);
  const domainname = hostname.split(".").slice(-2).join(".");
  return domainname;
}

// Check if the user's account is linked to a Discord or email account.
export function hasLinkedAccount(
  userMeResponse: UserMeResponse | false,
): boolean {
  return (
    userMeResponse !== false &&
    (userMeResponse.user?.discord !== undefined ||
      userMeResponse.user?.email !== undefined)
  );
}

export async function fetchGameById(
  gameId: string,
): Promise<AnalyticsRecord | false> {
  try {
    const url = `${getApiBase()}/game/${encodeURIComponent(gameId)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status !== 200) {
      console.warn(
        "fetchGameById: unexpected status",
        res.status,
        res.statusText,
      );
      return false;
    }

    const json = await res.json();
    const parsed = AnalyticsRecordSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("fetchGameById: Zod validation failed", parsed.error);
      return false;
    }

    return parsed.data;
  } catch (err) {
    console.warn("fetchGameById: request failed", err);
    return false;
  }
}

export async function fetchClanLeaderboard(): Promise<
  ClanLeaderboardResponse | false
> {
  try {
    const res = await fetch(`${getApiBase()}/public/clans/leaderboard`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(
        "fetchClanLeaderboard: unexpected status",
        res.status,
        res.statusText,
      );
      return false;
    }

    const json = await res.json();
    const parsed = ClanLeaderboardResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(
        "fetchClanLeaderboard: Zod validation failed",
        parsed.error.toString(),
      );
      return false;
    }

    return parsed.data;
  } catch (err) {
    console.warn("fetchClanLeaderboard: request failed", err);
    return false;
  }
}

export async function fetchPlayerLeaderboard(
  page: number,
): Promise<RankedLeaderboardResponse | "reached_limit" | false> {
  try {
    const url = new URL(`${getApiBase()}/leaderboard/ranked`);
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(
        "fetchPlayerLeaderboard: unexpected status",
        res.status,
        res.statusText,
      );
      return false;
    }

    const json = await res.json();
    const parsed = RankedLeaderboardResponseSchema.safeParse(json);
    if (!parsed.success) {
      // Handle "Page must be between X and Y" error as end of list
      if (json?.message?.includes?.("Page must be between")) {
        return "reached_limit";
      }
      console.warn(
        "fetchPlayerLeaderboard: Zod validation failed",
        parsed.error.toString(),
      );
      return false;
    }

    return parsed.data;
  } catch (err) {
    console.error("fetchPlayerLeaderboard: request failed", err);
    return false;
  }
}

const VaultFrontSeasonContractStateSchema = z.object({
  seasonId: z.string(),
  interceptionTiming: z.number(),
  objectiveDenial: z.number(),
  comebackExecution: z.number(),
  rivalryRevenge: z.number(),
});

export type VaultFrontSeasonContractState = z.infer<
  typeof VaultFrontSeasonContractStateSchema
>;

const VaultFrontDockAssignmentSchema = z.object({
  experimentId: z.literal("dock_layout_v1"),
  variant: z.enum(["top", "stack"]),
  assignedAt: z.number(),
});

const VaultFrontDockSummarySchema = z.object({
  experimentId: z.literal("dock_layout_v1"),
  generatedAt: z.number(),
  assignedTotal: z.number(),
  variants: z.object({
    top: z.object({
      assignedUsers: z.number(),
      events: z.record(z.string(), z.number()),
    }),
    stack: z.object({
      assignedUsers: z.number(),
      events: z.record(z.string(), z.number()),
    }),
  }),
  guardrail: z
    .object({
      objective: z.object({
        topEvents: z.number(),
        stackEvents: z.number(),
        topPerAssigned: z.number(),
        stackPerAssigned: z.number(),
        deltaPctTopVsStack: z.number(),
      }),
      trend5m: z.object({
        top: z.object({
          current: z.number(),
          previous: z.number(),
          delta: z.number(),
        }),
        stack: z.object({
          current: z.number(),
          previous: z.number(),
          delta: z.number(),
        }),
      }),
      guardrail: z.object({
        minAssigned: z.number(),
        minObjectiveEvents: z.number(),
        enoughSample: z.boolean(),
        decision: z.enum([
          "hold",
          "prefer_top",
          "prefer_stack",
          "disable_top",
          "disable_stack",
        ]),
        reason: z.string(),
      }),
    })
    .optional(),
});

const VaultFrontRecapAssignmentSchema = z.object({
  experimentId: z.literal("recap_cta_v1"),
  variant: z.enum(["goal_focus", "requeue_focus"]),
  assignedAt: z.number(),
});

const VaultFrontRecapSummarySchema = z.object({
  experimentId: z.literal("recap_cta_v1"),
  generatedAt: z.number(),
  assignedTotal: z.number(),
  variants: z.object({
    goal_focus: z.object({
      assignedUsers: z.number(),
      events: z.record(z.string(), z.number()),
    }),
    requeue_focus: z.object({
      assignedUsers: z.number(),
      events: z.record(z.string(), z.number()),
    }),
  }),
  cta: z.object({
    goalFocusRate: z.number(),
    requeueFocusRate: z.number(),
  }),
});

const VaultFrontRuntimeAssignmentSchema = z.object({
  experimentId: z.literal("vault_runtime_v1"),
  rewardVariant: z.enum(["control", "high_risk_high_reward"]),
  hudVariant: z.enum(["default", "mobile_priority"]),
  assignedAt: z.number(),
});

const VaultFrontOutcomeTelemetryInputSchema = z.object({
  won: z.boolean(),
  behindAtMinute8: z.boolean(),
  matchLengthSeconds: z.number().int().min(0),
  recapCtaVariant: z.enum(["goal_focus", "requeue_focus"]).optional(),
  recapCtaClicked: z.boolean().optional(),
  requeueClicked: z.boolean().optional(),
  hud: z.object({
    vaultNoticeJumps: z.number().int().min(0),
    objectiveRailClicks: z.number().int().min(0),
    timelineJumps: z.number().int().min(0),
  }),
});

const VaultFrontOutcomeSummarySchema = z.object({
  generatedAt: z.number(),
  totals: z.object({
    matches: z.number(),
    winRate: z.number(),
    recapCtaRate: z.number(),
    requeueRate: z.number(),
    hudPerMatch: z.object({
      vaultNoticeJumps: z.number(),
      objectiveRailClicks: z.number(),
      timelineJumps: z.number(),
    }),
  }),
  buckets: z.array(
    z.object({
      key: z.string(),
      matches: z.number(),
      winRate: z.number(),
      hudPerMatch: z.object({
        vaultNoticeJumps: z.number(),
        objectiveRailClicks: z.number(),
        timelineJumps: z.number(),
      }),
      recapCtaRate: z.number(),
      requeueRate: z.number(),
      recapVariant: z.object({
        goal_focus: z.number(),
        requeue_focus: z.number(),
      }),
    }),
  ),
});

const VaultFrontFunnelTelemetryInputSchema = z.object({
  won: z.boolean(),
  matchLengthSeconds: z.number().int().min(0),
  phases: z.object({
    early: z.record(z.string(), z.number().int().min(0)),
    mid: z.record(z.string(), z.number().int().min(0)),
    late: z.record(z.string(), z.number().int().min(0)),
  }),
});

const VaultFrontFunnelSummarySchema = z.object({
  generatedAt: z.number(),
  summaries: z.array(
    z.object({
      key: z.string(),
      matches: z.number(),
      winRate: z.number(),
      phases: z.object({
        early: z.record(z.string(), z.number()),
        mid: z.record(z.string(), z.number()),
        late: z.record(z.string(), z.number()),
      }),
    }),
  ),
});

export type VaultFrontDockAssignment = z.infer<
  typeof VaultFrontDockAssignmentSchema
>;
export type VaultFrontDockSummary = z.infer<typeof VaultFrontDockSummarySchema>;
export type VaultFrontRecapAssignment = z.infer<
  typeof VaultFrontRecapAssignmentSchema
>;
export type VaultFrontRecapSummary = z.infer<
  typeof VaultFrontRecapSummarySchema
>;
export type VaultFrontRuntimeAssignment = z.infer<
  typeof VaultFrontRuntimeAssignmentSchema
>;
export type VaultFrontOutcomeTelemetryInput = z.infer<
  typeof VaultFrontOutcomeTelemetryInputSchema
>;
export type VaultFrontOutcomeSummary = z.infer<
  typeof VaultFrontOutcomeSummarySchema
>;
export type VaultFrontFunnelTelemetryInput = z.infer<
  typeof VaultFrontFunnelTelemetryInputSchema
>;
export type VaultFrontFunnelSummary = z.infer<
  typeof VaultFrontFunnelSummarySchema
>;

export async function updateVaultFrontSeasonContracts(delta: {
  interceptionTimingDelta: number;
  objectiveDenialDelta: number;
  comebackExecutionDelta: number;
  rivalryRevengeDelta: number;
}): Promise<VaultFrontSeasonContractState | false> {
  try {
    const authHeader = await getAuthHeader();
    const fallbackToken = authHeader ? null : await getPlayToken();
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/contracts/update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || `Bearer ${fallbackToken}`,
        },
        body: JSON.stringify(delta),
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontSeasonContractStateSchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

export interface DailyChallenge {
  challengeId: string;
  description: string;
  progress: number;
  target: number;
  rewardGold: number;
  completed: boolean;
}

export async function fetchDailyChallenge(): Promise<DailyChallenge | null> {
  try {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${getApiBase()}/api/vaultfront/daily-challenge`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as DailyChallenge;
  } catch {
    return null;
  }
}

export interface VaultFrontContractsSnapshot {
  eloRating: number;
  eloLabel: string;
  matchesPlayed: number;
  isDecaying: boolean;
  eloHistory: number[];
}

export async function fetchVaultFrontContracts(): Promise<
  VaultFrontContractsSnapshot | false
> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) return false;
    const response = await fetch(`${getApiBase()}/api/vaultfront/contracts`, {
      headers: { Authorization: authHeader },
    });
    if (!response.ok) return false;
    const json = await response.json();
    if (typeof json.eloRating !== "number" || typeof json.eloLabel !== "string")
      return false;
    return {
      eloRating: json.eloRating as number,
      eloLabel: json.eloLabel as string,
      matchesPlayed: (json.matchesPlayed as number) ?? 0,
      isDecaying: (json.isDecaying as boolean) ?? false,
      eloHistory: Array.isArray(json.eloHistory)
        ? (json.eloHistory as number[])
        : [],
    };
  } catch {
    return false;
  }
}

async function vaultFrontIdentityHeaders(): Promise<Record<string, string>> {
  const authHeader = await getAuthHeader();
  if (authHeader) {
    return {
      Authorization: authHeader,
    };
  }
  return {
    "x-vaultfront-client-id": await getPlayToken(),
  };
}

export async function fetchVaultFrontDockAssignment(): Promise<
  VaultFrontDockAssignment | false
> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/dock/assignment`,
      {
        headers: {
          ...(await vaultFrontIdentityHeaders()),
        },
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontDockAssignmentSchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

export async function recordVaultFrontDockEvent(input: {
  event: string;
  variant?: "top" | "stack";
  value?: number;
}): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/dock/event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await vaultFrontIdentityHeaders()),
        },
        body: JSON.stringify(input),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchVaultFrontDockSummary(
  adminToken: string,
): Promise<VaultFrontDockSummary | false> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/dock/summary`,
      {
        headers: {
          "x-admin-key": adminToken,
        },
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontDockSummarySchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

export async function fetchVaultFrontRecapAssignment(): Promise<
  VaultFrontRecapAssignment | false
> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/recap/assignment`,
      {
        headers: {
          ...(await vaultFrontIdentityHeaders()),
        },
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontRecapAssignmentSchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

export async function recordVaultFrontRecapEvent(input: {
  event: string;
  variant?: "goal_focus" | "requeue_focus";
  value?: number;
}): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/recap/event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await vaultFrontIdentityHeaders()),
        },
        body: JSON.stringify(input),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export interface BattleNarrativeInput {
  matchId: string;
  events: Array<{
    type: string;
    player?: string;
    tick?: number;
    detail?: string;
  }>;
  winnerId?: string;
  durationSeconds: number;
}

export async function fetchBattleNarrative(
  input: BattleNarrativeInput,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/battle-narrative`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await vaultFrontIdentityHeaders()),
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { ok: boolean; narrative?: string };
    return data.narrative ?? null;
  } catch {
    return null;
  }
}

// ── Mutator Vote ─────────────────────────────────────────────────────────────

export interface MutatorVoteCandidate {
  key: string;
  name: string;
}

export interface MutatorVoteStatus {
  open: boolean;
  candidates: MutatorVoteCandidate[];
  closesAt: number | null;
}

/** Returns the current vote window (candidates + close time), or null if no vote is open. */
export async function fetchMutatorVoteStatus(): Promise<MutatorVoteStatus | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/season/current`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.vote?.open) return null;
    return data.vote as MutatorVoteStatus;
  } catch {
    return null;
  }
}

/** Submits a vote for the given candidate key. Returns true on success. */
export async function castMutatorVote(
  candidateKey: string,
  voterId?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/mutator-vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateKey, voterId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchVaultFrontRecapSummary(
  adminToken: string,
): Promise<VaultFrontRecapSummary | false> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/recap/summary`,
      {
        headers: {
          "x-admin-key": adminToken,
        },
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontRecapSummarySchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

export async function fetchVaultFrontRuntimeAssignment(): Promise<
  VaultFrontRuntimeAssignment | false
> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/runtime/assignment`,
      {
        headers: {
          ...(await vaultFrontIdentityHeaders()),
        },
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontRuntimeAssignmentSchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

export async function recordVaultFrontRuntimeEvent(input: {
  event: string;
  rewardVariant?: "control" | "high_risk_high_reward";
  hudVariant?: "default" | "mobile_priority";
  value?: number;
}): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/ab/runtime/event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await vaultFrontIdentityHeaders()),
        },
        body: JSON.stringify(input),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function recordVaultFrontOutcomeTelemetry(
  input: VaultFrontOutcomeTelemetryInput,
): Promise<boolean> {
  const parsed = VaultFrontOutcomeTelemetryInputSchema.safeParse(input);
  if (!parsed.success) {
    return false;
  }
  try {
    const response = await fetch(`${getApiBase()}/api/vaultfront/outcome`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await vaultFrontIdentityHeaders()),
      },
      body: JSON.stringify(parsed.data),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchVaultFrontOutcomeSummary(
  adminToken: string,
): Promise<VaultFrontOutcomeSummary | false> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/outcome/summary`,
      {
        headers: {
          "x-admin-key": adminToken,
        },
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontOutcomeSummarySchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

export async function recordVaultFrontFunnelTelemetry(
  input: VaultFrontFunnelTelemetryInput,
): Promise<boolean> {
  const parsed = VaultFrontFunnelTelemetryInputSchema.safeParse(input);
  if (!parsed.success) {
    return false;
  }
  try {
    const response = await fetch(`${getApiBase()}/api/vaultfront/funnel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await vaultFrontIdentityHeaders()),
      },
      body: JSON.stringify(parsed.data),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchVaultFrontFunnelSummary(
  adminToken: string,
): Promise<VaultFrontFunnelSummary | false> {
  try {
    const response = await fetch(
      `${getApiBase()}/api/vaultfront/funnel/summary`,
      {
        headers: {
          "x-admin-key": adminToken,
        },
      },
    );
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    const parsed = VaultFrontFunnelSummarySchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    return parsed.data;
  } catch {
    return false;
  }
}

// ── Match invite deep links ───────────────────────────────────────────────

export interface InviteLinkResponse {
  gameId: string;
  mapName: string;
  playerCount: number;
  phase: string;
  shareUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
}

export async function requestInviteLink(
  gameId: string,
): Promise<InviteLinkResponse | false> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/invite/${encodeURIComponent(gameId)}`,
    );
    if (!res.ok) return false;
    return (await res.json()) as InviteLinkResponse;
  } catch {
    return false;
  }
}

export async function shareMatchInvite(gameId: string): Promise<void> {
  const info = await requestInviteLink(gameId);
  if (!info) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: info.ogTitle,
        text: info.ogDescription,
        url: info.shareUrl,
      });
      return;
    } catch {
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(info.shareUrl);
  } catch {
    // clipboard blocked — nothing to do
  }
}

// ── Rematch queue ─────────────────────────────────────────────────────────

export interface RematchStatus {
  gameId: string;
  code: string;
  playerIds: string[];
  expiresAt: number;
  joinUrl: string;
}

export async function createRematch(
  gameId: string,
  playerId: string,
): Promise<RematchStatus | false> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/rematch/${encodeURIComponent(gameId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      },
    );
    if (!res.ok) return false;
    return (await res.json()) as RematchStatus;
  } catch {
    return false;
  }
}

export async function getRematchStatus(
  gameId: string,
): Promise<RematchStatus | false> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/rematch/status/${encodeURIComponent(gameId)}`,
    );
    if (!res.ok) return false;
    return (await res.json()) as RematchStatus;
  } catch {
    return false;
  }
}

// ── Replay highlights ─────────────────────────────────────────────────────

export interface ReplayHighlight {
  gameId: string;
  highlightId: string;
  topMoment: string;
  autoHighlightTick?: number;
  clipStartTurn: number;
  clipEndTurn: number;
  shareUrl: string;
  ogTitle: string;
}

export async function requestReplayHighlight(
  gameId: string,
): Promise<ReplayHighlight | false> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/replay/${encodeURIComponent(gameId)}/highlight`,
    );
    if (!res.ok) return false;
    return (await res.json()) as ReplayHighlight;
  } catch {
    return false;
  }
}

/**
 * Creates a user-defined clip for a replay at a specific tick range.
 * Returns the share URL, or null on failure.
 */
export async function createCustomClip(
  gameId: string,
  startTick: number,
  endTick: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/replay/${encodeURIComponent(gameId)}/clip`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTick, endTick }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { shareUrl?: string };
    return data.shareUrl ?? null;
  } catch {
    return null;
  }
}

export async function shareReplayHighlight(gameId: string): Promise<void> {
  const highlight = await requestReplayHighlight(gameId);
  if (!highlight) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: highlight.ogTitle,
        url: highlight.shareUrl,
      });
      return;
    } catch {
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(highlight.shareUrl);
  } catch {
    // clipboard blocked
  }
}

// ── Dynasty Story Engine ────────────────────────────────────────────────────

export async function fetchDynastyStory(
  clanId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/vaultfront/dynasty-story/${encodeURIComponent(clanId)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { story?: string };
    return data.story ?? null;
  } catch {
    return null;
  }
}

export async function generateDynastyStoryChapter(input: {
  clanId: string;
  clanName: string;
  recentOutcomes: string[];
  topMoments: string[];
}): Promise<{ chapter: string; story: string } | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/vaultfront/dynasty-story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok: boolean;
      chapter?: string;
      story?: string;
    };
    if (!data.ok) return null;
    return { chapter: data.chapter ?? "", story: data.story ?? "" };
  } catch {
    return null;
  }
}

// ── Bot Persona Backstories ─────────────────────────────────────────────────

export async function fetchBotPersona(
  personality: string,
  seed: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/vaultfront/bot-persona?personality=${encodeURIComponent(personality)}&seed=${encodeURIComponent(seed)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { persona?: string };
    return data.persona ?? null;
  } catch {
    return null;
  }
}

// ── IGNIS Founder Signal ────────────────────────────────────────────────────

export async function recordIgnisSignal(input: {
  itemSlug: string;
  signal: "accept" | "reject" | "pivot";
  sessionId?: string;
}): Promise<void> {
  try {
    await fetch(`${getApiBase()}/api/ignis/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // fire-and-forget
  }
}

// ── Match Oracle (pre-match ELO prediction) ─────────────────────────────────

export async function fetchMatchOracle(playerIds: string[]): Promise<{
  predictions: Array<{
    playerId: string;
    deltaIfWin: number;
    deltaIfLoss: number;
    threat?: string;
  }>;
} | null> {
  try {
    const params = new URLSearchParams();
    playerIds.forEach((id) => params.append("players", id));
    const res = await fetch(
      `${getApiBase()}/api/vaultfront/match-oracle?${params.toString()}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      predictions: Array<{
        playerId: string;
        deltaIfWin: number;
        deltaIfLoss: number;
        threat?: string;
      }>;
    };
  } catch {
    return null;
  }
}

export async function fetchMatchProphecy(
  mapName: string,
  playerCount: number,
  mutator: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/vaultfront/match-prophecy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapName, playerCount, mutator }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; prophecy?: string };
    return data.prophecy ?? null;
  } catch {
    return null;
  }
}

// ── Micro-Coach Hint ────────────────────────────────────────────────────────

export function pushNarratorEvent(
  gameId: string,
  activity: string,
  label?: string,
): void {
  fetch(
    `${getApiBase()}/api/vaultfront/narrator/${encodeURIComponent(gameId)}/event`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity, label }),
    },
  ).catch(() => undefined);
}

export function subscribeNarrator(
  gameId: string,
  onCommentary: (text: string) => void,
): () => void {
  const url = `${getApiBase()}/api/vaultfront/narrator/${encodeURIComponent(gameId)}`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string) as {
        type: string;
        text?: string;
      };
      if (data.type === "commentary" && data.text) onCommentary(data.text);
    } catch {
      // ignore
    }
  };
  return () => es.close();
}

export async function fetchMicroHint(params: {
  gold: number;
  sites: number;
  trigger?: string;
}): Promise<string | null> {
  try {
    const url = new URL(`${getApiBase()}/api/vaultfront/micro-hint`);
    url.searchParams.set("gold", String(params.gold));
    url.searchParams.set("sites", String(params.sites));
    if (params.trigger) url.searchParams.set("trigger", params.trigger);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as { hint?: string };
    return data.hint ?? null;
  } catch {
    return null;
  }
}
