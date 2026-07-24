import { z } from "zod";
import type {
  CertifiedSeasonPassState,
  SeasonPassClaimReceipt,
} from "./SeasonMilestoneStore";

type Handler = (...args: any[]) => unknown;

export interface SeasonPassRouteApp {
  get(path: string, ...handlers: Handler[]): unknown;
  post(path: string, ...handlers: Handler[]): unknown;
}

export interface SeasonPassRouterDependencies {
  authenticate(req: any, res: any): Promise<{ persistentId: string } | null>;
  rateLimit: Handler;
  currentSeasonId(): string;
  getState(
    persistentId: string,
    seasonId: string,
  ): Promise<CertifiedSeasonPassState>;
  claim(
    persistentId: string,
    seasonId: string,
    milestoneId: string,
  ): Promise<SeasonPassClaimReceipt>;
  reportError(error: unknown): void;
}

const PersistentIdSchema = z.string().min(1).max(64);
const ClaimSchema = z.object({
  persistentId: PersistentIdSchema.optional(),
  milestoneId: z.string().regex(/^m(?:10|[1-9])$/),
});

function actorOwns(
  actor: { persistentId: string },
  requested: string | undefined,
  res: any,
): boolean {
  if (!requested || actor.persistentId === requested) return true;
  res.status(403).json({ error: "Actor does not own season progress" });
  return false;
}

export function registerSeasonPassRoutes(
  app: SeasonPassRouteApp,
  dependencies: SeasonPassRouterDependencies,
) {
  app.get(
    "/api/vaultfront/season-progress/:persistentId",
    dependencies.rateLimit,
    async (req, res) => {
      const actor = await dependencies.authenticate(req, res);
      if (!actor) return;
      const parsed = PersistentIdSchema.safeParse(req.params.persistentId);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid persistentId" });
      }
      if (!actorOwns(actor, parsed.data, res)) return;
      try {
        return res.json(
          await dependencies.getState(
            actor.persistentId,
            dependencies.currentSeasonId(),
          ),
        );
      } catch (error) {
        dependencies.reportError(error);
        return res.status(503).json({ error: "Season progress unavailable" });
      }
    },
  );

  app.post(
    "/api/vaultfront/season-progress/claim",
    dependencies.rateLimit,
    async (req, res) => {
      const actor = await dependencies.authenticate(req, res);
      if (!actor) return;
      const parsed = ClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid claim" });
      }
      if (!actorOwns(actor, parsed.data.persistentId, res)) return;
      try {
        const receipt = await dependencies.claim(
          actor.persistentId,
          dependencies.currentSeasonId(),
          parsed.data.milestoneId,
        );
        return res.status(receipt.reason === "locked" ? 409 : 200).json({
          ok: true,
          ...receipt,
        });
      } catch (error) {
        dependencies.reportError(error);
        return res.status(503).json({ error: "Season claim unavailable" });
      }
    },
  );
}
