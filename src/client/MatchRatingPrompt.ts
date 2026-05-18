import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { postMatchRating } from "./Api";

@customElement("match-rating-prompt")
export class MatchRatingPrompt extends LitElement {
  @state() private visible = false;
  @state() private matchRating = 0;
  @state() private mapRating = 0;
  @state() private submitted = false;

  private gameId = "";
  private persistentId = "";
  private mapName = "";

  static styles = css`
    :host {
      display: block;
      font-family: "Overpass", sans-serif;
    }
    .backdrop {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(71, 85, 105, 0.5);
      border-radius: 12px;
      padding: 16px 20px;
      width: 260px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      animation: slide-in 0.3s ease-out;
    }
    @keyframes slide-in {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    .hidden {
      display: none;
    }
    .title {
      font-size: 0.82rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 12px;
    }
    .label {
      font-size: 0.78rem;
      color: #cbd5e1;
      margin-bottom: 5px;
    }
    .stars {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
    }
    .star {
      font-size: 1.3rem;
      cursor: pointer;
      transition: transform 0.1s;
      user-select: none;
    }
    .star:hover {
      transform: scale(1.2);
    }
    .submit {
      width: 100%;
      padding: 7px 0;
      background: rgba(96, 165, 250, 0.2);
      border: 1px solid rgba(96, 165, 250, 0.4);
      border-radius: 6px;
      color: #93c5fd;
      font-size: 0.82rem;
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
    }
    .submit:hover {
      background: rgba(96, 165, 250, 0.35);
    }
    .submit:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .thanks {
      text-align: center;
      color: #6ee7b7;
      font-size: 0.85rem;
      padding: 6px 0;
    }
    .dismiss {
      position: absolute;
      top: 8px;
      right: 10px;
      background: none;
      border: none;
      color: #475569;
      font-size: 1rem;
      cursor: pointer;
      line-height: 1;
      font-family: inherit;
    }
    .dismiss:hover {
      color: #94a3b8;
    }
  `;

  showForMatch(gameId: string, persistentId: string, mapName = ""): void {
    this.gameId = gameId;
    this.persistentId = persistentId;
    this.mapName = mapName;
    this.matchRating = 0;
    this.mapRating = 0;
    this.submitted = false;
    this.visible = true;
  }

  private renderStars(current: number, onSet: (n: number) => void) {
    return html`
      <div class="stars">
        ${[1, 2, 3, 4, 5].map(
          (n) => html`
            <span class="star" @click=${() => onSet(n)}
              >${current >= n ? "★" : "☆"}</span
            >
          `,
        )}
      </div>
    `;
  }

  private async _submit() {
    if (this.matchRating === 0 && this.mapRating === 0) return;
    await postMatchRating({
      gameId: this.gameId,
      persistentId: this.persistentId,
      matchRating: this.matchRating || 3,
      mapRating: this.mapRating || 3,
      mapName: this.mapName,
    });
    this.submitted = true;
    setTimeout(() => {
      this.visible = false;
    }, 1800);
  }

  render() {
    if (!this.visible) return html``;
    return html`
      <div class="backdrop">
        <button
          class="dismiss"
          @click=${() => {
            this.visible = false;
          }}
        >
          ✕
        </button>
        ${this.submitted
          ? html`<div class="thanks">Thanks for the feedback! 🙏</div>`
          : html`
              <div class="title">How was that match?</div>
              <div class="label">Match quality</div>
              ${this.renderStars(this.matchRating, (n) => {
                this.matchRating = n;
              })}
              <div class="label">Map rating</div>
              ${this.renderStars(this.mapRating, (n) => {
                this.mapRating = n;
              })}
              <button
                class="submit"
                @click=${this._submit}
                ?disabled=${this.matchRating === 0 && this.mapRating === 0}
              >
                Submit Rating
              </button>
            `}
      </div>
    `;
  }
}

if (!customElements.get("match-rating-prompt")) {
  customElements.define("match-rating-prompt", MatchRatingPrompt);
}
