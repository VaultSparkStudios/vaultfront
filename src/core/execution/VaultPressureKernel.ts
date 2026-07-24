export interface VaultPressureConfig {
  threshold: number;
  breachWindowDurationTicks: number;
}

export interface VaultPressureKernelState {
  pressure: number;
  breachWindowUntilTick: number;
  victorySecured: boolean;
}

export type VaultPressureEvent =
  | { type: "pressure-advanced"; pressure: number }
  | { type: "breach-window-opened"; untilTick: number }
  | { type: "breach-window-expired"; pressure: number }
  | { type: "vault-breach-victory" };

export interface VaultPressureTransition {
  state: VaultPressureKernelState;
  events: VaultPressureEvent[];
}

export { DEFAULT_VAULT_PRESSURE_CONFIG };

export function initialVaultPressureState(): VaultPressureKernelState {
  return { pressure: 0, breachWindowUntilTick: 0, victorySecured: false };
}

function normalize(
  state: VaultPressureKernelState,
  config: VaultPressureConfig,
): VaultPressureKernelState {
  return {
    pressure: Math.max(0, Math.min(config.threshold, state.pressure)),
    breachWindowUntilTick: Math.max(0, state.breachWindowUntilTick),
    victorySecured: state.victorySecured,
  };
}

/** Advance the climax by one certified convoy delivery. */
export function deliverToVaultPressure(
  previous: VaultPressureKernelState,
  tick: number,
  config: VaultPressureConfig = DEFAULT_VAULT_PRESSURE_CONFIG,
): VaultPressureTransition {
  const state = normalize(previous, config);
  if (state.victorySecured) return { state, events: [] };
  if (state.breachWindowUntilTick > tick) {
    return {
      state: {
        pressure: config.threshold,
        breachWindowUntilTick: 0,
        victorySecured: true,
      },
      events: [{ type: "vault-breach-victory" }],
    };
  }

  const pressure = Math.min(config.threshold, state.pressure + 1);
  if (pressure < config.threshold) {
    return {
      state: { ...state, pressure },
      events: [{ type: "pressure-advanced", pressure }],
    };
  }
  const untilTick = tick + config.breachWindowDurationTicks;
  return {
    state: {
      pressure,
      breachWindowUntilTick: untilTick,
      victorySecured: false,
    },
    events: [{ type: "breach-window-opened", untilTick }],
  };
}

/** Expire only after the final active tick, preserving the existing boundary. */
export function expireVaultPressureWindow(
  previous: VaultPressureKernelState,
  tick: number,
  config: VaultPressureConfig = DEFAULT_VAULT_PRESSURE_CONFIG,
): VaultPressureTransition {
  const state = normalize(previous, config);
  if (
    state.victorySecured ||
    state.breachWindowUntilTick <= 0 ||
    tick <= state.breachWindowUntilTick
  ) {
    return { state, events: [] };
  }
  const pressure = Math.max(0, config.threshold - 1);
  return {
    state: { pressure, breachWindowUntilTick: 0, victorySecured: false },
    events: [{ type: "breach-window-expired", pressure }],
  };
}

export function projectVaultPressure(
  state: VaultPressureKernelState,
  tick: number,
  config: VaultPressureConfig = DEFAULT_VAULT_PRESSURE_CONFIG,
) {
  const normalized = normalize(state, config);
  return {
    pressure: normalized.pressure,
    threshold: config.threshold,
    breachWindowUntilTick: normalized.breachWindowUntilTick,
    deliveriesRequired:
      normalized.breachWindowUntilTick > tick && !normalized.victorySecured
        ? (1 as const)
        : (0 as const),
    victorySecured: normalized.victorySecured,
  };
}
import { DEFAULT_VAULT_PRESSURE_CONFIG } from "./VaultFrontBalance";
