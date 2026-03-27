/**
 * AchievementToast — slide-up toast notifications for achievement unlocks.
 *
 * Usage:
 *   Register via customElements (done at bottom of this file).
 *   Add <achievement-toast> once to the page layout (e.g. in Main.ts).
 *   Call `.show({ name, description, iconEmoji? })` from anywhere to enqueue
 *   a toast. Multiple calls queue up and display sequentially.
 *
 * Styling uses VaultFront brand CSS tokens where available, with hard-coded
 * fallbacks so the component works even if the token sheet is absent.
 */

import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AchievementToastData {
  name: string;
  description: string;
  iconEmoji?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@customElement("achievement-toast")
export class AchievementToast extends LitElement {
  @state() private current: AchievementToastData | null = null;
  @state() private visible = false;

  private queue: AchievementToastData[] = [];
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private animateInTimer: ReturnType<typeof setTimeout> | null = null;

  static styles = css`
    :host {
      /* Fixed anchor — sits in the bottom-right corner of the viewport */
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      font-family: "Overpass", sans-serif;
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 16px 18px;
      min-width: 280px;
      max-width: 340px;

      background: var(--panel, rgba(15, 23, 42, 0.97));
      border: 1px solid var(--gold, #ffc400);
      border-radius: 10px;
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 196, 0, 0.12);

      /* Animation state — hidden by default */
      opacity: 0;
      transform: translateY(20px);
      transition:
        opacity 0.3s ease,
        transform 0.3s ease;
    }

    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .icon {
      font-size: 1.6rem;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .label {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--gold, #ffc400);
      opacity: 0.85;
    }

    .name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--gold, #ffc400);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .description {
      font-size: 0.82rem;
      line-height: 1.4;
      color: var(--muted, #94a3b8);
    }
  `;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a toast. If no toast is currently displayed, it shows immediately;
   * otherwise it waits until the current one dismisses.
   */
  show(achievement: AchievementToastData): void {
    this.queue.push(achievement);
    if (this.current === null) {
      this._showNext();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _showNext(): void {
    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      this.visible = false;
      return;
    }

    this.current = next;
    this.visible = false; // reset before animating in

    // One microtask tick so Lit renders the element before we flip visible
    this.animateInTimer = setTimeout(() => {
      this.visible = true;

      // Auto-dismiss after 4 seconds (including the 0.3s fade-out)
      this.dismissTimer = setTimeout(() => {
        this._dismiss();
      }, 4000);
    }, 50);
  }

  private _dismiss(): void {
    this.visible = false;

    // Wait for the CSS transition to finish before moving to the next toast
    setTimeout(() => {
      this._showNext();
    }, 350);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.dismissTimer !== null) clearTimeout(this.dismissTimer);
    if (this.animateInTimer !== null) clearTimeout(this.animateInTimer);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  override render() {
    if (this.current === null) return html``;

    const icon = this.current.iconEmoji ?? "⚡";

    return html`
      <div class="toast ${this.visible ? "visible" : ""}">
        <div class="icon" aria-hidden="true">${icon}</div>
        <div class="body">
          <div class="label">Achievement Unlocked</div>
          <div class="name">${this.current.name}</div>
          <div class="description">${this.current.description}</div>
        </div>
      </div>
    `;
  }
}

// Ensure the custom element is registered when this module is imported
// (the @customElement decorator already calls define, but the explicit call
// below guards against tree-shaking stripping the decorator side-effect)
if (!customElements.get("achievement-toast")) {
  customElements.define("achievement-toast", AchievementToast);
}
