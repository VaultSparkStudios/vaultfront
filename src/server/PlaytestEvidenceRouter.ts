import { z } from "zod";
import {
  PlaytestEvidenceConflictError,
  type AuthenticatedPlaytestEvidence,
} from "./PlaytestEvidenceStore";
import type { VaultFrontPlaytestPulseSummary } from "./VaultFrontPlaytestPulse";

const eventSchema = z.object({
  surface: z.enum(["tutorial", "match", "tournament", "retention"]),
  event: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  value: z.literal(1).default(1),
  evidenceSessionId: z
    .string()
    .min(12)
    .max(128)
    .regex(/^[a-zA-Z0-9:_-]+$/),
  eventId: z
    .string()
    .min(12)
    .max(128)
    .regex(/^[a-zA-Z0-9:_-]+$/),
  source: z.literal("human"),
});

interface RequestLike {
  body: unknown;
  headers: { authorization?: string };
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): unknown;
}

interface RegistrarLike {
  get(
    path: string,
    handler: (req: RequestLike, res: ResponseLike) => Promise<unknown>,
  ): unknown;
  post(
    path: string,
    middleware: unknown,
    handler: (req: RequestLike, res: ResponseLike) => Promise<unknown>,
  ): unknown;
}

export interface PlaytestEvidenceRouteDependencies {
  rateLimit: unknown;
  resolveActor: (request: RequestLike) => Promise<{ actorKey: string } | null>;
  record: (
    event: Omit<AuthenticatedPlaytestEvidence, "at" | "actorKey"> & {
      actorKey: string;
    },
  ) => Promise<VaultFrontPlaytestPulseSummary>;
  summary: () => Promise<VaultFrontPlaytestPulseSummary>;
  reportError: (error: unknown) => void;
}

export function registerPlaytestEvidenceRoutes(
  app: RegistrarLike,
  dependencies: PlaytestEvidenceRouteDependencies,
): void {
  app.post(
    "/api/vaultfront/playtest-pulse",
    dependencies.rateLimit,
    async (request, response) => {
      const actor = await dependencies.resolveActor(request);
      if (!actor) {
        return response
          .status(401)
          .json({ error: "Authenticated play token required" });
      }
      const parsed = eventSchema.safeParse(request.body);
      if (!parsed.success) {
        return response
          .status(400)
          .json({ error: z.prettifyError(parsed.error) });
      }
      try {
        const summary = await dependencies.record({
          ...parsed.data,
          actorKey: actor.actorKey,
        });
        return response.json({ ok: true, summary });
      } catch (error) {
        if (error instanceof PlaytestEvidenceConflictError) {
          return response.status(409).json({ error: error.message });
        }
        if (error instanceof TypeError) {
          return response.status(400).json({ error: error.message });
        }
        dependencies.reportError(error);
        return response
          .status(503)
          .json({ error: "Playtest evidence unavailable" });
      }
    },
  );

  app.get(
    "/api/vaultfront/playtest-pulse/summary",
    async (_request, response) => {
      try {
        return response.json(await dependencies.summary());
      } catch (error) {
        dependencies.reportError(error);
        return response
          .status(503)
          .json({ error: "Playtest evidence unavailable" });
      }
    },
  );
}
