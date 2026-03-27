/**
 * VaultFrontTutorial — first-run contextual overlay for new players.
 *
 * Architecture:
 * - Shows once per browser (localStorage key "vf-tutorial-seen")
 * - 5-step carousel explaining VaultFront's core mechanics
 * - Non-blocking: player can dismiss at any time
 * - No forced path — just contextual highlights with skip option
 *
 * Usage: Register in Main.ts and add <vault-front-tutorial> to the layout.
 * It auto-opens on first load if the tutorial has not been seen.
 */

import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

const TUTORIAL_SEEN_KEY = "vf-tutorial-seen";
const TUTORIAL_VERSION = "1";

interface TutorialStep {
  icon: string;
  title: string;
  body: string;
}

const STEPS: TutorialStep[] = [
  {
    icon: "🏦",
    title: "Vault Sites",
    body: "Vault sites spawn on the map. Hold a vault tile for ~9 seconds to capture it. Once captured, a convoy launches automatically toward your structures.",
  },
  {
    icon: "🚛",
    title: "Convoys Deliver Loot",
    body: "Your convoy carries gold and troops to your nearest city, port, or factory. Riskier routes pay more — but an intercepted convoy loses everything.",
  },
  {
    icon: "🛡️",
    title: "Escort & Jam Breaker",
    body: "Use Escort to give your convoy a shield against one interception. Use Jam Breaker (costs 115k gold) to disable enemy defense beacons near your path.",
  },
  {
    icon: "⚡",
    title: "Comeback Surge",
    body: "If you're behind for 6 minutes straight, Surge activates for 2 minutes — boosting your next convoy rewards and interception gold. Don't give up!",
  },
  {
    icon: "🔗",
    title: "Execution Chain",
    body: "The hidden combo: Capture a vault → Deliver the convoy → Trigger a Jam Breaker that denies an enemy pulse. Complete all three within 2.5 minutes for +20% rewards.",
  },
];

@customElement("vault-front-tutorial")
export class VaultFrontTutorial extends LitElement {
  @state() private open = false;
  @state() private step = 0;

  static styles = css`
    :host {
      display: contents;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      font-family: "Overpass", sans-serif;
    }

    .card {
      background: rgba(15, 23, 42, 0.97);
      border: 1px solid rgba(96, 165, 250, 0.4);
      border-radius: 12px;
      padding: 32px 28px 24px;
      width: min(440px, calc(100vw - 32px));
      color: #f1f5f9;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.6);
    }

    .progress {
      display: flex;
      gap: 6px;
      margin-bottom: 24px;
    }

    .progress-dot {
      flex: 1;
      height: 3px;
      border-radius: 2px;
      background: rgba(71, 85, 105, 0.5);
      transition: background 0.2s;
    }

    .progress-dot.active {
      background: rgba(96, 165, 250, 0.9);
    }

    .progress-dot.done {
      background: rgba(52, 211, 153, 0.7);
    }

    .icon {
      font-size: 2.8rem;
      margin-bottom: 12px;
      display: block;
    }

    .title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 10px;
    }

    .body {
      font-size: 0.9rem;
      line-height: 1.6;
      color: #94a3b8;
    }

    .actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 28px;
    }

    .skip {
      background: none;
      border: none;
      color: rgba(100, 116, 139, 0.8);
      font-size: 0.8rem;
      cursor: pointer;
      padding: 4px 0;
    }

    .skip:hover {
      color: #94a3b8;
    }

    .next {
      background: rgba(37, 99, 235, 0.85);
      border: 1px solid rgba(96, 165, 250, 0.5);
      border-radius: 8px;
      color: #e0f2fe;
      font-size: 0.9rem;
      font-weight: 600;
      padding: 10px 22px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .next:hover {
      background: rgba(37, 99, 235, 1);
    }

    .next.finish {
      background: rgba(5, 150, 105, 0.85);
      border-color: rgba(52, 211, 153, 0.5);
    }

    .next.finish:hover {
      background: rgba(5, 150, 105, 1);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    const seen = localStorage.getItem(TUTORIAL_SEEN_KEY);
    if (seen !== TUTORIAL_VERSION) {
      // Slight delay so the game UI can render first
      setTimeout(() => {
        this.open = true;
      }, 800);
    }
  }

  private dismiss() {
    localStorage.setItem(TUTORIAL_SEEN_KEY, TUTORIAL_VERSION);
    this.open = false;
  }

  private advance() {
    if (this.step < STEPS.length - 1) {
      this.step++;
    } else {
      this.dismiss();
    }
  }

  render() {
    if (!this.open) return html``;

    const current = STEPS[this.step];
    const isLast = this.step === STEPS.length - 1;

    return html`
      <div class="overlay" @click=${(e: Event) => e.stopPropagation()}>
        <div class="card">
          <div class="progress">
            ${STEPS.map(
              (_, i) => html`
                <div
                  class="progress-dot ${i < this.step
                    ? "done"
                    : i === this.step
                      ? "active"
                      : ""}"
                ></div>
              `,
            )}
          </div>

          <span class="icon">${current.icon}</span>
          <div class="title">${current.title}</div>
          <div class="body">${current.body}</div>

          <div class="actions">
            <button class="skip" @click=${this.dismiss}>
              ${isLast ? "" : "Skip tutorial"}
            </button>
            <button
              class="next ${isLast ? "finish" : ""}"
              @click=${this.advance}
            >
              ${isLast ? "Let's play" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
