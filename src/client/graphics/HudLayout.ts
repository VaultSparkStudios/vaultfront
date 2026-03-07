export type HudPreset = "compact" | "competitive" | "mobile";
export type DockVariant = "top" | "stack";
export type VaultNoticeSortMode = "eta" | "risk";

export interface HudLayoutState {
  controlPanelCompact?: boolean;
  leftDockExpanded?: boolean;
  uiScale?: number;
  preset?: HudPreset;
  editMode?: boolean;
  dockVariant?: DockVariant;
  vaultNoticeSortMode?: VaultNoticeSortMode;
  controlPanelOffsetX?: number;
  controlPanelOffsetY?: number;
  leftDockOffsetX?: number;
  leftDockOffsetY?: number;
  rightDockOffsetX?: number;
  rightDockOffsetY?: number;
}

export const HUD_LAYOUT_KEY = "vaultfront.hud.layout.v1";
export const HUD_LAYOUT_EVENT = "vaultfront:hud-layout-updated";

export const clampHudScale = (value: number): number =>
  Math.max(0.8, Math.min(1.2, Number.isFinite(value) ? value : 1));

export function readHudLayout(): HudLayoutState {
  try {
    const raw = localStorage.getItem(HUD_LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HudLayoutState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeHudLayout(patch: Partial<HudLayoutState>): HudLayoutState {
  const next: HudLayoutState = {
    ...readHudLayout(),
    ...patch,
  };
  localStorage.setItem(HUD_LAYOUT_KEY, JSON.stringify(next));
  return next;
}

export function dispatchHudLayoutUpdate(layout: HudLayoutState): void {
  window.dispatchEvent(
    new CustomEvent<HudLayoutState>(HUD_LAYOUT_EVENT, { detail: layout }),
  );
}

export function applyGlobalHudScale(scale: number): number {
  const clamped = clampHudScale(scale);
  document.documentElement.style.setProperty(
    "--vaultfront-ui-scale",
    String(clamped),
  );
  return clamped;
}

