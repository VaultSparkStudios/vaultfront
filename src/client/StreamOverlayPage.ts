/**
 * StreamOverlayPage — minimal OBS browser-source overlay for VaultFront streams.
 *
 * Usage: open /stream-overlay?gameId=<id> in OBS as a browser source (1280×200).
 * Connects to GET /api/stream/:gameId/overlay SSE and renders live game state.
 *
 * Design: transparent background, readable against dark gameplay footage.
 */

import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getApiBase } from "./Api";

interface OverlayState {
  connected: boolean;
  commentary: string;
  activity: string;
  tick: number;
  playerCount: number;
  mapName: string;
  crowdInterceptPct: number | null;
  crowdTotal: number;
}

@customElement("stream-overlay-page")
export class StreamOverlayPage extends LitElement {
  @state() private overlay: OverlayState = {
    connected: false,
    commentary: "",
    activity: "",
    tick: 0,
    playerCount: 0,
    mapName: "",
    crowdInterceptPct: null,
    crowdTotal: 0,
  };

  @state() private gameId = "";
  @state() private commentaryFade = false;

  private es: EventSource | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const params = new URLSearchParams(window.location.search);
    const id = params.get("gameId") ?? "";
    this.gameId = id;
    if (id) this.connect(id);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.es?.close();
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
  }

  private connect(gameId: string): void {
    this.es?.close();
    const url = `${getApiBase()}/api/stream/${encodeURIComponent(gameId)}/overlay`;
    this.es = new EventSource(url);
    this.es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          commentary?: string;
          activity?: string;
          tick?: number;
          playerCount?: number;
          mapName?: string;
          interceptPct?: number;
          total?: number;
        };
        if (msg.type === "connected") {
          this.overlay = { ...this.overlay, connected: true };
        } else if (msg.type === "commentary" && msg.commentary) {
          this.showCommentary(msg.commentary);
        } else if (msg.type === "crowd_vote") {
          this.overlay = {
            ...this.overlay,
            crowdInterceptPct: msg.interceptPct ?? null,
            crowdTotal: msg.total ?? 0,
          };
        } else if (msg.type === "snapshot") {
          this.overlay = {
            ...this.overlay,
            connected: true,
            tick: msg.tick ?? this.overlay.tick,
            playerCount: msg.playerCount ?? this.overlay.playerCount,
            mapName: msg.mapName ?? this.overlay.mapName,
            activity: msg.activity ?? this.overlay.activity,
          };
          if (msg.commentary) this.showCommentary(msg.commentary);
        }
      } catch {
        // ignore
      }
      this.requestUpdate();
    };
    this.es.onerror = () => {
      this.overlay = { ...this.overlay, connected: false };
      this.requestUpdate();
    };
  }

  private showCommentary(text: string): void {
    this.overlay = { ...this.overlay, commentary: text };
    this.commentaryFade = false;
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      this.commentaryFade = true;
      this.requestUpdate();
    }, 8_000);
  }

  render() {
    const o = this.overlay;
    if (!this.gameId) {
      return html`<div
        style="color:#fff;font-family:sans-serif;padding:16px;font-size:14px"
      >
        No gameId — add ?gameId=&lt;id&gt; to the URL
      </div>`;
    }
    return html`
      <style>
        .vf-overlay {
          font-family: "Inter", "Segoe UI", sans-serif;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 10px 18px;
          background: linear-gradient(
            90deg,
            rgba(10, 10, 30, 0.82) 0%,
            rgba(10, 10, 30, 0.55) 70%,
            transparent 100%
          );
          border-bottom: 2px solid rgba(251, 191, 36, 0.45);
          height: 64px;
          box-sizing: border-box;
        }
        .vf-logo {
          font-size: 15px;
          font-weight: 700;
          color: #fbbf24;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .vf-divider {
          width: 1px;
          height: 32px;
          background: rgba(255, 255, 255, 0.18);
        }
        .vf-meta {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .vf-commentary {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          transition: opacity 1.2s ease;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vf-commentary.fade {
          opacity: 0;
        }
        .vf-status {
          font-size: 11px;
          color: ${o.connected ? "#34d399" : "#f87171"};
          white-space: nowrap;
        }
        .vf-crowd {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 120px;
        }
        .vf-crowd-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.55);
        }
        .vf-crowd-bar {
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.12);
          overflow: hidden;
          display: flex;
        }
        .vf-crowd-intercept {
          background: #ef4444;
          transition: width 0.4s ease;
        }
        .vf-crowd-delivery {
          background: #22c55e;
          transition: width 0.4s ease;
        }
      </style>
      <div class="vf-overlay">
        <div class="vf-logo">⚡ VaultFront</div>
        <div class="vf-divider"></div>
        <div class="vf-meta">
          ${o.mapName ? html`<span>${o.mapName}</span>` : ""}
          ${
            o.playerCount
              ? html`<span>${o.playerCount} players</span>`
              : html`<span>—</span>`
          }
        </div>
        <div class="vf-divider"></div>
        <div class="vf-commentary ${this.commentaryFade ? "fade" : ""}">
          ${
            o.commentary ||
            (o.activity ? `🎯 ${o.activity}` : "Waiting for action…")
          }
        </div>
        ${
          o.crowdInterceptPct !== null
            ? html`
                <div class="vf-divider"></div>
                <div class="vf-crowd">
                  <div class="vf-crowd-label">
                    Crowd: ${o.crowdInterceptPct}% intercept (${o.crowdTotal})
                  </div>
                  <div class="vf-crowd-bar">
                    <div
                      class="vf-crowd-intercept"
                      style="width:${o.crowdInterceptPct}%"
                    ></div>
                    <div
                      class="vf-crowd-delivery"
                      style="width:${100 - o.crowdInterceptPct}%"
                    ></div>
                  </div>
                </div>
              `
            : ""
        }
        <div class="vf-status">${o.connected ? "● LIVE" : "○ Connecting"}</div>
      </div>
    `;
  }
}
