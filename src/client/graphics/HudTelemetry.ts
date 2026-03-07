import { recordVaultFrontDockEvent } from "../Api";

type HudTelemetryValue = string | number | boolean;
const SERVER_FORWARD_ACTIONS = new Set([
  "hud_vault_notice_jump",
  "hud_objective_rail_click",
  "hud_timeline_jump",
]);
const lastServerForwardAt = new Map<string, number>();

export function logHudTelemetry(
  action: string,
  fields?: Record<string, HudTelemetryValue>,
): void {
  if (!action) return;

  const normalized = action.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const counterKey = `vaultfront.kpi.hud.${normalized}`;
  const prev = Number(localStorage.getItem(counterKey) ?? "0");
  localStorage.setItem(counterKey, String(prev + 1));

  const streamKey = "vaultfront.hud.telemetry.stream";
  let stream: Array<{
    at: number;
    action: string;
    fields?: Record<string, HudTelemetryValue>;
  }> = [];
  const raw = sessionStorage.getItem(streamKey);
  if (raw) {
    try {
      stream = JSON.parse(raw) as typeof stream;
    } catch {
      stream = [];
    }
  }
  stream.push({
    at: Date.now(),
    action: normalized,
    fields,
  });
  sessionStorage.setItem(streamKey, JSON.stringify(stream.slice(-120)));

  if (SERVER_FORWARD_ACTIONS.has(normalized)) {
    const now = Date.now();
    const lastAt = lastServerForwardAt.get(normalized) ?? 0;
    if (now - lastAt >= 200) {
      lastServerForwardAt.set(normalized, now);
      void recordVaultFrontDockEvent({
        event: normalized,
        value: 1,
      });
    }
  }
}
