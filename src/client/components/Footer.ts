import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("page-footer")
export class Footer extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <footer
        class="[.in-game_&]:hidden bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center gap-2 px-4 py-4 text-white/70 w-full border-t border-white/10 shrink-0 mt-auto text-center"
      >
        <a
          href="https://vaultsparkstudios.com"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[11px] uppercase tracking-[0.16em] font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
        >
          A VaultSpark Studios production
        </a>
        <p class="text-xs">
          © 2026 VaultSpark Studios LLC. All rights reserved.
        </p>
        <nav
          aria-label="Project information"
          class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs"
        >
          <a href="/about/" class="hover:text-white transition-colors">About</a>
          <a href="/docs/" class="hover:text-white transition-colors"
            >How to play</a
          >
          <a href="/contact/" class="hover:text-white transition-colors"
            >Contact</a
          >
          <a
            href="/privacy/"
            data-i18n="main.privacy_policy"
            class="hover:text-white transition-colors"
            >Privacy</a
          >
          <a
            href="/terms/"
            data-i18n="main.terms_of_service"
            class="hover:text-white transition-colors"
            >Terms</a
          >
          <a href="/ip/" class="hover:text-white transition-colors"
            >Rights & attribution</a
          >
          <a
            href="https://openfront.wiki/Main_Page"
            data-i18n="main.wiki"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-white transition-colors"
            >Wiki</a
          >
          <a
            href="https://github.com/VaultSparkStudios/VaultFront"
            data-i18n-aria-label="news.github_link"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-white transition-colors"
            >Source</a
          >
        </nav>
        <p class="max-w-3xl text-[11px] leading-relaxed text-white/55">
          Based on OpenFrontIO. Source licensing and upstream credits remain
          available in LICENSE, LICENSING.md, and CREDITS.md.
        </p>
      </footer>
    `;
  }
}
