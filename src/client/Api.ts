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
