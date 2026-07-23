import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameView } from "../../core/game/GameView";
import {
  fetchVaultFrontContracts,
  type VaultFrontContractsSnapshot,
} from "../Api";
import type { Layer } from "../graphics/layers/Layer";

interface ContractProgress {
  key: string;
  label: string;
  value: number;
  target: number;
}

const CONTRACT_TARGETS: Record<string, { label: string; target: number }> = {
  interceptionTiming: { label: "Interception Timing", target: 12 },
  objectiveDenial: { label: "Objective Denial", target: 20 },
  comebackExecution: { label: "Comeback Execution", target: 6 },
  surgeExecution: { label: "Surge Execution", target: 8 },
};

@customElement("contract-hud-widget")
export class ContractHudWidget extends LitElement implements Layer {
  public game: GameView;

  @state() private contracts: ContractProgress[] = [];
  @state() private visible = false;

  private readonly FETCH_INTERVAL_TICKS = 300; // refresh every 30s
  private tickCount = 0;

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadContracts();
  }

  private async loadContracts() {
    const snapshot = await fetchVaultFrontContracts();
    if (!snapshot) return;
    this.applyContractState(snapshot);
  }

  private applyContractState(data: VaultFrontContractsSnapshot): void {
    const progress: ContractProgress[] = [];
    for (const [key, meta] of Object.entries(CONTRACT_TARGETS)) {
      const value = Number(data[key] ?? 0);
      progress.push({ key, label: meta.label, value, target: meta.target });
    }
    // Sort by closest to completion (highest ratio), take top 3
    progress.sort((a, b) => b.value / b.target - a.value / a.target);
    this.contracts = progress.slice(0, 3);
    this.visible = this.contracts.length > 0;
  }

  tick(): void {
    this.tickCount++;

    if (this.tickCount >= this.FETCH_INTERVAL_TICKS) {
      this.tickCount = 0;
      void this.loadContracts();
    }
  }

  render() {
    if (!this.visible || this.contracts.length === 0) return html``;
    return html`
      <style>
        .contract-hud {
          position: fixed;
          top: 12px;
          right: 220px;
          z-index: 800;
          display: flex;
          flex-direction: column;
          gap: 4px;
          pointer-events: none;
        }
        .contract-row {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.55);
          border-radius: 6px;
          padding: 3px 8px;
          backdrop-filter: blur(4px);
          min-width: 160px;
        }
        .contract-label {
          font-size: 0.65rem;
          color: #d1d5db;
          white-space: nowrap;
          flex: 1;
        }
        .contract-bar-bg {
          width: 60px;
          height: 5px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
          overflow: hidden;
        }
        .contract-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #fbbf24, #f59e0b);
          border-radius: 3px;
          transition: width 0.3s ease;
        }
        .contract-count {
          font-size: 0.6rem;
          color: #fbbf24;
          font-weight: 700;
          min-width: 24px;
          text-align: right;
        }
        @media (max-width: 640px) {
          .contract-hud {
            display: none;
          }
        }
      </style>
      <div class="contract-hud">
        ${this.contracts.map((c) => {
          const pct = Math.min(100, (c.value / c.target) * 100);
          return html`
            <div class="contract-row">
              <span class="contract-label">${c.label}</span>
              <div class="contract-bar-bg">
                <div class="contract-bar-fill" style="width:${pct}%"></div>
              </div>
              <span class="contract-count">${c.value}/${c.target}</span>
            </div>
          `;
        })}
      </div>
    `;
  }
}
