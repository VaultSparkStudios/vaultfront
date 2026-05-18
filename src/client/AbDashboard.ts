/**
 * AbDashboard — admin-only A/B experiment results viewer.
 *
 * Mount at /ab-dashboard (admin-gated).
 * Fetches GET /api/admin/ab/results and renders per-experiment variant tables.
 */

import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getApiBase } from "./Api";

interface VariantData {
  users: number;
  events: Record<string, number>;
}

interface Experiment {
  id: string;
  description: string;
  variants?: Record<string, VariantData>;
  rewardVariants?: Record<string, VariantData>;
  hudVariants?: Record<string, VariantData>;
}

interface AbResults {
  generatedAt: number;
  experiments: Experiment[];
}

@customElement("ab-dashboard")
export class AbDashboard extends LitElement {
  @state() private results: AbResults | null = null;
  @state() private error = "";
  @state() private loading = true;
  @state() private adminToken = "";

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
    const params = new URLSearchParams(window.location.search);
    this.adminToken = params.get("token") ?? "";
    await this.load();
  }

  private async load() {
    this.loading = true;
    try {
      const res = await fetch(`${getApiBase()}/api/admin/ab/results`, {
        headers: { "x-admin-token": this.adminToken },
      });
      if (!res.ok) {
        this.error = `HTTP ${res.status} — check admin token`;
        return;
      }
      this.results = (await res.json()) as AbResults;
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
      this.requestUpdate();
    }
  }

  private renderVariantTable(variants: Record<string, VariantData>) {
    const allKeys = [
      ...new Set(
        Object.values(variants).flatMap((v) => Object.keys(v.events ?? {})),
      ),
    ].sort();

    return html`
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr class="bg-slate-700/60">
            <th class="text-left px-2 py-1 text-slate-300">Variant</th>
            <th class="text-right px-2 py-1 text-slate-300">Users</th>
            ${allKeys.map(
              (k) =>
                html`<th class="text-right px-2 py-1 text-slate-300">${k}</th>`,
            )}
          </tr>
        </thead>
        <tbody>
          ${Object.entries(variants).map(
            ([name, v]) => html`
              <tr class="border-t border-slate-600/40 hover:bg-slate-700/30">
                <td class="px-2 py-1 text-amber-200 font-mono">${name}</td>
                <td class="text-right px-2 py-1 tabular-nums">${v.users}</td>
                ${allKeys.map((k) => {
                  const count = v.events?.[k] ?? 0;
                  const rate = v.users > 0 ? (count / v.users).toFixed(3) : "—";
                  return html`<td
                    class="text-right px-2 py-1 tabular-nums text-slate-200"
                    title="${count} events / ${v.users} users"
                  >
                    ${rate}
                  </td>`;
                })}
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  private renderExperiment(exp: Experiment) {
    return html`
      <div
        class="mb-6 rounded-lg border border-slate-600/40 bg-slate-800/60 p-4"
      >
        <div class="flex items-center gap-3 mb-3">
          <span
            class="font-mono text-xs bg-slate-700/70 rounded px-2 py-0.5 text-amber-300"
            >${exp.id}</span
          >
          <span class="text-sm text-slate-300">${exp.description}</span>
        </div>
        ${exp.variants
          ? html`<div class="mb-2">
              <div class="text-xs text-slate-400 mb-1 uppercase tracking-wide">
                Variants (rate = events/users)
              </div>
              ${this.renderVariantTable(exp.variants)}
            </div>`
          : ""}
        ${exp.rewardVariants
          ? html`<div class="mb-2">
              <div class="text-xs text-slate-400 mb-1 uppercase tracking-wide">
                Reward Variants
              </div>
              ${this.renderVariantTable(exp.rewardVariants)}
            </div>`
          : ""}
        ${exp.hudVariants
          ? html`<div>
              <div class="text-xs text-slate-400 mb-1 uppercase tracking-wide">
                HUD Variants
              </div>
              ${this.renderVariantTable(exp.hudVariants)}
            </div>`
          : ""}
      </div>
    `;
  }

  render() {
    return html`
      <div
        class="min-h-screen bg-slate-900 text-white p-6 font-sans max-w-5xl mx-auto"
      >
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-amber-300 mb-1">
              A/B Experiment Dashboard
            </h1>
            <div class="text-xs text-slate-400">
              ${this.results
                ? `Loaded at ${new Date(this.results.generatedAt).toLocaleTimeString()}`
                : ""}
            </div>
          </div>
          <button
            @click=${() => void this.load()}
            class="px-3 py-1.5 rounded bg-slate-600/60 text-slate-200 text-sm hover:bg-slate-600/90"
          >
            Refresh
          </button>
        </div>
        ${this.loading
          ? html`<div class="text-slate-400 text-sm">Loading…</div>`
          : this.error
            ? html`<div
                class="rounded border border-red-500/40 bg-red-900/20 p-4 text-red-300 text-sm"
              >
                ${this.error}
              </div>`
            : this.results?.experiments.map((exp) =>
                this.renderExperiment(exp),
              )}
      </div>
    `;
  }
}
