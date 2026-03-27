/**
 * ClanModal — clan creation, management, and leaderboard viewer.
 *
 * Tabs:
 *   - My Clan: shows current clan details + members, or create/join flow
 *   - Leaderboard: top 50 clans ranked by avg Elo
 *
 * Usage:
 *   <clan-modal></clan-modal>
 *   document.querySelector('clan-modal').open(persistentId)
 */

import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getApiBase } from "./Api";

interface Clan {
  id: string;
  name: string;
  tag: string;
  founderId: string;
  description: string;
  createdAt: number;
}

interface ClanMember {
  clanId: string;
  persistentId: string;
  role: string;
  joinedAt: number;
}

interface ClanWithMembers extends Clan {
  members: ClanMember[];
  avgElo: number;
}

interface ClanLeaderboardEntry {
  rank: number;
  clanId: string;
  name: string;
  tag: string;
  memberCount: number;
  avgElo: number;
}

type Tab = "my_clan" | "leaderboard";

@customElement("clan-modal")
export class ClanModal extends LitElement {
  @state() private isOpen = false;
  @state() private tab: Tab = "my_clan";
  @state() private persistentId = "";
  @state() private myClan: ClanWithMembers | null = null;
  @state() private leaderboard: ClanLeaderboardEntry[] = [];
  @state() private loading = false;
  @state() private error = "";

  // Create form
  @state() private createName = "";
  @state() private createTag = "";
  @state() private createDesc = "";
  @state() private joinId = "";

  createRenderRoot() {
    return this;
  }

  async open(persistentId: string): Promise<void> {
    this.persistentId = persistentId;
    this.isOpen = true;
    this.error = "";
    await this.loadMyClan();
    if (this.tab === "leaderboard") await this.loadLeaderboard();
  }

  close(): void {
    this.isOpen = false;
  }

  private async loadMyClan(): Promise<void> {
    if (!this.persistentId) return;
    this.loading = true;
    try {
      const res = await fetch(
        `${getApiBase()}/api/clans/player/${encodeURIComponent(this.persistentId)}`,
      );
      if (res.ok) this.myClan = (await res.json()) as ClanWithMembers;
      else this.myClan = null;
    } catch {
      this.myClan = null;
    }
    this.loading = false;
  }

  private async loadLeaderboard(): Promise<void> {
    this.loading = true;
    try {
      const res = await fetch(`${getApiBase()}/api/clans/leaderboard`);
      if (res.ok)
        this.leaderboard = (await res.json()) as ClanLeaderboardEntry[];
    } catch {
      this.leaderboard = [];
    }
    this.loading = false;
  }

  private async createClan(): Promise<void> {
    this.error = "";
    if (!this.createName.trim() || !this.createTag.trim()) {
      this.error = "Name and tag are required.";
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/api/clans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: this.createName.trim(),
          tag: this.createTag.trim(),
          founderId: this.persistentId,
          description: this.createDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error =
          (data as { error: string }).error ?? "Failed to create clan.";
        return;
      }
      await this.loadMyClan();
    } catch {
      this.error = "Network error.";
    }
  }

  private async joinClan(): Promise<void> {
    this.error = "";
    if (!this.joinId.trim()) {
      this.error = "Enter a clan ID to join.";
      return;
    }
    try {
      const res = await fetch(
        `${getApiBase()}/api/clans/${encodeURIComponent(this.joinId.trim())}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persistentId: this.persistentId }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        this.error =
          (data as { error: string }).error ?? "Failed to join clan.";
        return;
      }
      await this.loadMyClan();
    } catch {
      this.error = "Network error.";
    }
  }

  private async leaveClan(): Promise<void> {
    if (!confirm("Leave your clan?")) return;
    try {
      const res = await fetch(`${getApiBase()}/api/clans/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persistentId: this.persistentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error =
          (data as { error: string }).error ?? "Failed to leave clan.";
        return;
      }
      this.myClan = null;
    } catch {
      this.error = "Network error.";
    }
  }

  render() {
    if (!this.isOpen) return nothing;

    return html`
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div
          class="bg-gray-900 text-white rounded-lg shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-5 py-4 border-b border-gray-700"
          >
            <h2 class="text-lg font-bold">Clans</h2>
            <button
              @click=${() => this.close()}
              class="text-gray-400 hover:text-white bg-transparent border-0 cursor-pointer text-xl leading-none"
            >
              ✕
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-gray-700">
            ${(["my_clan", "leaderboard"] as Tab[]).map(
              (t) => html`
                <button
                  @click=${async () => {
                    this.tab = t;
                    if (t === "leaderboard") await this.loadLeaderboard();
                  }}
                  class="flex-1 py-2 text-sm font-medium cursor-pointer border-0 ${this
                    .tab === t
                    ? "bg-yellow-500/20 text-yellow-400 border-b-2 border-yellow-400"
                    : "bg-transparent text-gray-400 hover:text-white"}"
                >
                  ${t === "my_clan" ? "My Clan" : "Leaderboard"}
                </button>
              `,
            )}
          </div>

          <!-- Content -->
          <div class="p-5 max-h-96 overflow-y-auto">
            ${this.error
              ? html`<p class="text-red-400 text-sm mb-3">${this.error}</p>`
              : nothing}
            ${this.loading
              ? html`<p class="text-gray-400 text-center py-8">Loading…</p>`
              : this.tab === "my_clan"
                ? this.renderMyClan()
                : this.renderLeaderboard()}
          </div>
        </div>
      </div>
    `;
  }

  private renderMyClan() {
    if (this.myClan) {
      return html`
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <span class="text-2xl font-bold text-yellow-400"
              >[${this.myClan.tag}]</span
            >
            <span class="text-xl font-semibold">${this.myClan.name}</span>
          </div>
          ${this.myClan.description
            ? html`<p class="text-gray-400 text-sm">
                ${this.myClan.description}
              </p>`
            : nothing}
          <p class="text-xs text-gray-500">
            ${this.myClan.members.length}
            member${this.myClan.members.length !== 1 ? "s" : ""}
          </p>
          <div class="space-y-1">
            ${this.myClan.members.map(
              (m) => html`
                <div
                  class="flex items-center justify-between text-sm py-1 border-b border-gray-800"
                >
                  <span class="font-mono text-gray-300"
                    >${m.persistentId.slice(0, 12)}…</span
                  >
                  <span class="text-xs text-gray-500 capitalize"
                    >${m.role}</span
                  >
                </div>
              `,
            )}
          </div>
          <p class="text-xs text-gray-500">
            Clan ID: <code class="text-gray-400">${this.myClan.id}</code>
          </p>
          <button
            @click=${() => this.leaveClan()}
            class="mt-2 px-3 py-1.5 text-sm bg-red-600/60 hover:bg-red-600/80 text-white rounded cursor-pointer border-0"
          >
            Leave Clan
          </button>
        </div>
      `;
    }

    return html`
      <div class="space-y-6">
        <!-- Create -->
        <div>
          <h3 class="font-semibold text-sm text-gray-300 mb-2">
            Create a Clan
          </h3>
          <div class="space-y-2">
            <input
              type="text"
              placeholder="Clan name (2–32 chars)"
              maxlength="32"
              .value=${this.createName}
              @input=${(e: InputEvent) => {
                this.createName = (e.target as HTMLInputElement).value;
              }}
              class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <input
              type="text"
              placeholder="Tag (2–6 uppercase letters)"
              maxlength="6"
              .value=${this.createTag}
              @input=${(e: InputEvent) => {
                this.createTag = (
                  e.target as HTMLInputElement
                ).value.toUpperCase();
              }}
              class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              maxlength="256"
              .value=${this.createDesc}
              @input=${(e: InputEvent) => {
                this.createDesc = (e.target as HTMLInputElement).value;
              }}
              class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <button
              @click=${() => this.createClan()}
              class="w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm rounded cursor-pointer border-0"
            >
              Create Clan
            </button>
          </div>
        </div>

        <!-- Join -->
        <div>
          <h3 class="font-semibold text-sm text-gray-300 mb-2">Join a Clan</h3>
          <div class="flex gap-2">
            <input
              type="text"
              placeholder="Clan ID"
              .value=${this.joinId}
              @input=${(e: InputEvent) => {
                this.joinId = (e.target as HTMLInputElement).value;
              }}
              class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <button
              @click=${() => this.joinClan()}
              class="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded cursor-pointer border-0"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderLeaderboard() {
    if (!this.leaderboard.length) {
      return html`<p class="text-gray-400 text-center py-8">No clans yet.</p>`;
    }
    return html`
      <table class="w-full text-sm">
        <thead>
          <tr class="text-gray-400 text-left border-b border-gray-700">
            <th class="pb-2 font-medium">#</th>
            <th class="pb-2 font-medium">Clan</th>
            <th class="pb-2 font-medium text-right">Members</th>
            <th class="pb-2 font-medium text-right">Avg Elo</th>
          </tr>
        </thead>
        <tbody>
          ${this.leaderboard.map(
            (e) => html`
              <tr class="border-b border-gray-800 hover:bg-gray-800/40">
                <td class="py-2 text-gray-500">${e.rank}</td>
                <td class="py-2">
                  <span class="text-yellow-400 font-mono">[${e.tag}]</span>
                  <span class="ml-1">${e.name}</span>
                </td>
                <td class="py-2 text-right text-gray-400">${e.memberCount}</td>
                <td class="py-2 text-right font-mono">${e.avgElo}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }
}
