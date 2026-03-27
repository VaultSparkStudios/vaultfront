/**
 * MapEditor — browser-based visual wrapper around the Go map-generator CLI.
 *
 * Architecture:
 * - Canvas-based editor built with Pixi.js (reuses the existing renderer setup)
 * - Supports:
 *     • Point-and-click vault site placement (up to 5 per map)
 *     • Lane/border drawing
 *     • Territory seed point placement
 *     • Config panel (map size, player count, vault density)
 * - On "Export": generates a JSON config file consumable by the Go generator
 * - On "Preview": POSTs to /api/map-editor/preview (new server endpoint)
 *   which invokes the map-generator binary and streams back the PNG preview
 *
 * Status: SCAFFOLDED — implement canvas interaction and server preview endpoint.
 * The Go binary (map-generator/) is already CLI-capable and JSON-driven.
 *
 * Wiring:
 *   1. Add /api/map-editor/preview to Worker.ts (POST: JSON → binary exec → PNG)
 *   2. Register <map-editor> custom element in Main.ts
 *   3. Add a "Map Editor" link to DesktopNavBar (admin-only or dev-only)
 */

import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

export interface VaultSitePlacement {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  label: string;
}

export interface MapEditorConfig {
  name: string;
  width: number;
  height: number;
  playerCount: number;
  vaultSites: VaultSitePlacement[];
  vaultDensity: "sparse" | "standard" | "dense";
  laneFogEnabled: boolean;
}

const DEFAULT_CONFIG: MapEditorConfig = {
  name: "custom-map",
  width: 2048,
  height: 1024,
  playerCount: 8,
  vaultSites: [],
  vaultDensity: "standard",
  laneFogEnabled: false,
};

@customElement("map-editor")
export class MapEditor extends LitElement {
  @state() private config: MapEditorConfig = { ...DEFAULT_CONFIG };
  @state() private previewUrl: string | null = null;
  @state() private isPreviewing = false;
  @state() private activeMode: "vault" | "lane" | "territory" = "vault";

  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div class="flex h-full bg-gray-950 text-white">
        <!-- Sidebar -->
        <aside class="w-72 shrink-0 border-r border-white/10 p-4 flex flex-col gap-4 overflow-y-auto">
          <h2 class="text-lg font-bold text-amber-400">Map Editor</h2>

          <!-- Mode selector -->
          <div class="flex flex-col gap-1">
            <label class="text-xs text-gray-400 uppercase tracking-wider">Edit Mode</label>
            <div class="flex gap-2">
              ${(["vault", "lane", "territory"] as const).map(
                (mode) => html`
                  <button
                    class="flex-1 py-1.5 text-xs rounded border ${this.activeMode === mode ? "border-amber-400/60 bg-amber-500/20 text-amber-200" : "border-white/10 text-gray-400 hover:bg-white/5"}"
                    @click=${() => { this.activeMode = mode; this.requestUpdate(); }}
                  >${mode}</button>
                `,
              )}
            </div>
          </div>

          <!-- Config fields -->
          <div class="flex flex-col gap-3">
            <label class="text-xs text-gray-400 uppercase tracking-wider">Map Config</label>

            <div class="flex flex-col gap-1">
              <span class="text-xs text-gray-500">Name</span>
              <input
                class="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white"
                .value=${this.config.name}
                @input=${(e: Event) => {
                  this.config = { ...this.config, name: (e.target as HTMLInputElement).value };
                }}
              />
            </div>

            <div class="flex flex-col gap-1">
              <span class="text-xs text-gray-500">Players: ${this.config.playerCount}</span>
              <input
                type="range" min="2" max="32"
                .value=${String(this.config.playerCount)}
                @input=${(e: Event) => {
                  this.config = { ...this.config, playerCount: Number((e.target as HTMLInputElement).value) };
                }}
              />
            </div>

            <div class="flex flex-col gap-1">
              <span class="text-xs text-gray-500">Vault Density</span>
              <select
                class="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white"
                .value=${this.config.vaultDensity}
                @change=${(e: Event) => {
                  this.config = { ...this.config, vaultDensity: (e.target as HTMLSelectElement).value as MapEditorConfig["vaultDensity"] };
                }}
              >
                <option value="sparse">Sparse (2 vaults)</option>
                <option value="standard" selected>Standard (3-4 vaults)</option>
                <option value="dense">Dense (5 vaults)</option>
              </select>
            </div>
          </div>

          <!-- Vault sites list -->
          <div class="flex flex-col gap-1">
            <label class="text-xs text-gray-400 uppercase tracking-wider">
              Vault Sites (${this.config.vaultSites.length}/5)
            </label>
            ${this.config.vaultSites.map(
              (site, i) => html`
                <div class="flex items-center gap-2 text-xs text-gray-300">
                  <span class="text-amber-400">⬡</span>
                  <span>${site.label} (${site.x.toFixed(2)}, ${site.y.toFixed(2)})</span>
                  <button
                    class="ml-auto text-red-400 hover:text-red-300"
                    @click=${() => {
                      this.config = {
                        ...this.config,
                        vaultSites: this.config.vaultSites.filter((_, idx) => idx !== i),
                      };
                    }}
                  >✕</button>
                </div>
              `,
            )}
            ${this.config.vaultSites.length === 0
              ? html`<p class="text-xs text-gray-600">Click the canvas to place vault sites.</p>`
              : null}
          </div>

          <!-- Actions -->
          <div class="mt-auto flex flex-col gap-2">
            <button
              class="py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-bold transition-colors ${this.isPreviewing ? "opacity-50 pointer-events-none" : ""}"
              @click=${this.requestPreview}
            >
              ${this.isPreviewing ? "Generating…" : "Preview Map"}
            </button>
            <button
              class="py-2 rounded border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors"
              @click=${this.exportConfig}
            >
              Export JSON
            </button>
          </div>
        </aside>

        <!-- Canvas area -->
        <div
          class="flex-1 relative bg-gray-900 flex items-center justify-center cursor-crosshair"
          @click=${this.handleCanvasClick}
        >
          ${this.previewUrl
            ? html`<img src=${this.previewUrl} class="max-w-full max-h-full object-contain" alt="Map preview" />`
            : html`<div class="text-gray-600 text-sm">Click to place vault sites, then click Preview</div>`}
          ${this.config.vaultSites.map(
            (site) => html`
              <div
                class="absolute w-5 h-5 rounded-full bg-amber-400/80 border-2 border-amber-300 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style="left: ${site.x * 100}%; top: ${site.y * 100}%"
                title=${site.label}
              ></div>
            `,
          )}
        </div>
      </div>
    `;
  }

  private handleCanvasClick(e: MouseEvent): void {
    if (this.activeMode !== "vault") return;
    if (this.config.vaultSites.length >= 5) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    this.config = {
      ...this.config,
      vaultSites: [
        ...this.config.vaultSites,
        { x, y, label: `Vault ${this.config.vaultSites.length + 1}` },
      ],
    };
  }

  private async requestPreview(): Promise<void> {
    this.isPreviewing = true;
    this.requestUpdate();
    try {
      const res = await fetch("/api/map-editor/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.config),
      });
      if (res.ok) {
        const blob = await res.blob();
        this.previewUrl = URL.createObjectURL(blob);
      }
    } catch (err) {
      console.error("[MapEditor] Preview failed", err);
    } finally {
      this.isPreviewing = false;
      this.requestUpdate();
    }
  }

  private exportConfig(): void {
    const json = JSON.stringify(this.config, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.config.name}.map-config.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
