export interface GameLoopHealthSnapshot {
  scope: "process-local-worker";
  healthy: boolean;
  lastTickCompletedAt: number;
  ageMs: number;
  maxAgeMs: number;
}

export function buildGameLoopHealthSnapshot(
  lastTickCompletedAt: number,
  now = Date.now(),
  maxAgeMs = 3_500,
): GameLoopHealthSnapshot {
  const ageMs = Math.max(0, now - lastTickCompletedAt);
  return {
    scope: "process-local-worker",
    healthy: ageMs <= maxAgeMs,
    lastTickCompletedAt,
    ageMs,
    maxAgeMs,
  };
}
