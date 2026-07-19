export type GameCreationAdmission =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

export function gameAllocationDecision(
  idExists: boolean,
  activeGames: number,
  maxGamesPerWorker: number,
): "allow" | "collision" | "capacity" {
  if (idExists) return "collision";
  if (activeGames >= maxGamesPerWorker) return "capacity";
  return "allow";
}

interface WindowState {
  startedAt: number;
  count: number;
}

/** Bounded process-local quota used only after identity has been verified. */
export class GameCreationAdmissionGuard {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly maxTrackedActors = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  consume(actorKey: string): GameCreationAdmission {
    const now = this.now();
    this.expire(now);
    const current = this.windows.get(actorKey);
    if (!current) {
      if (this.windows.size >= this.maxTrackedActors) {
        return { allowed: false, retryAfterMs: this.windowMs };
      }
      this.windows.set(actorKey, { startedAt: now, count: 1 });
      return { allowed: true, remaining: this.maxPerWindow - 1 };
    }
    if (current.count >= this.maxPerWindow) {
      return {
        allowed: false,
        retryAfterMs: Math.max(1, current.startedAt + this.windowMs - now),
      };
    }
    current.count++;
    return { allowed: true, remaining: this.maxPerWindow - current.count };
  }

  private expire(now: number): void {
    for (const [key, state] of this.windows) {
      if (now - state.startedAt >= this.windowMs) this.windows.delete(key);
    }
  }
}
