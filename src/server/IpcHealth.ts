export interface IpcHealthSnapshot {
  scope: "process-local-worker";
  connected: boolean;
  healthy: boolean;
  lastMasterMessageAt: number;
  ageMs: number;
  maxAgeMs: number;
}

export function buildIpcHealthSnapshot(
  lastMasterMessageAt: number,
  connected: boolean,
  now = Date.now(),
  maxAgeMs = 2_000,
): IpcHealthSnapshot {
  const ageMs = Math.max(0, now - lastMasterMessageAt);
  return {
    scope: "process-local-worker",
    connected,
    healthy: connected && ageMs <= maxAgeMs,
    lastMasterMessageAt,
    ageMs,
    maxAgeMs,
  };
}
