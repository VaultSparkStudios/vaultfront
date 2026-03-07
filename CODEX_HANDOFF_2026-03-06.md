# Codex Handoff - 2026-03-06

This file is the resume point for a fresh Codex session.

## Current focus

The recent work centered on `VaultFront` gameplay/UI, plus a cosmetic-only Phase 1 visual overhaul for the main page and HUD.

The workspace is dirty. Do not revert unrelated user changes.

## Recently completed

### VaultFront / convoy gameplay and UI

- Added `reroute_safest` end-to-end through schema, transport, command execution, and HUD.
- Expanded VaultFront status payloads with projected reward math, reward multipliers, distance/risk, convoy reward details, reroute previews, and beacon cooldown visibility.
- Implemented adaptive convoy reward math in `src/core/execution/VaultFrontExecution.ts`.
- Added Vault status projections and richer convoy/beacon fields to `src/core/game/GameUpdates.ts`.
- Added Jam Breaker cooldown visibility and escort window visibility to HUD.
- Added one-tap HUD actions:
  - `Shield Nearest`
  - `Reroute Safest`
  - `Jam Breaker`
  - `Jam on Next Pulse`
- Added advanced command expander, quick role presets, reward explain panel, reroute preview panel, adaptive nudges, coachmarks, and compact/mobile-priority behavior.
- Moved the Vault HUD to the floating top-right area under the pause strip.
- Reduced vault notices to a single nearby notice and filtered it by territory proximity.
- Removed the explicit `1-2-3-4-5` key legend from the panel while keeping keyboard shortcut logic in code.
- Added combat auto-collapse / pin behavior for the floating Vault HUD.
- Added timeline filter chips and objective rail improvements in `GameRightSidebar`.
- Added moment-based recap entries in `WinModal`.

### Extra VaultFront features implemented

- Weekly mutators:
  - `lane_fog`
  - `accelerated_cooldowns`
  - `double_passive`
- Clean execution streak chain with next-convoy bonus.
- Squad micro-objective shared rewards.
- Runtime A/B plumbing and telemetry hooks.

### Main page / HUD visual overhaul

- Added a Phase 1 visual refresh for the landing/play page:
  - hero treatment
  - glass surfaces
  - stronger card styling
  - new CSS variables / visual tokens
- Added cosmetic terrain shading depth and coastline emphasis in `TerrainLayer`.
- Refreshed HUD dock styling to better match the new visual direction.

## Most recent fixes

### GitHub repo launch preparation

Prepared the repo for a `VaultSparkStudios/VaultFront` GitHub launch:

- rewrote `README.md` around VaultFront branding and fork attribution
- updated `CREDITS.md` to explicitly credit OpenFrontIO and preserve the license trail
- updated `package.json` metadata:
  - package name: `vaultfront`
  - repository/homepage/bugs URLs now target `VaultSparkStudios/VaultFront`
- updated GitHub links in:
  - `src/client/components/Footer.ts`
  - `src/client/GameStartingModal.ts`
  - `src/client/NewsMarkdown.ts`
- added `Screenshot *.png` to `.gitignore` so local review screenshots do not get committed by accident

Launch result:

- GitHub repo created: `https://github.com/VaultSparkStudios/VaultFront`
- visibility: `public`
- new remote added: `vaultfront`
- `main` now tracks `vaultfront/main`

Notes:

- `origin` still points to `https://github.com/openfrontio/OpenFrontIO.git`
- do not remove or overwrite `origin` unless explicitly requested
- `.github/workflows/deploy.yml` still contains upstream infrastructure/domain assumptions and is not yet reworked for standalone VaultFront hosting
- GitHub accepted the push but warned that `generated/WorldMapData.json` is `57.98 MB`, above GitHub's recommended `50 MB` threshold; consider Git LFS or asset-size reduction in a follow-up cleanup

### Git author identity correction

Fixed an author identity leak where recent commits were being created as `DarkWolfCrypto`.

- global Git identity now uses:
  - `VaultSpark Studios`
  - `87046611+VaultSparkStudios@users.noreply.github.com`
- local repo Git identity now uses the same values
- the public `VaultSparkStudios/VaultFront` snapshot commit was rewritten so GitHub no longer shows `DarkWolfCrypto` as the current author
- the last 3 local Codex commits in this working repo were rewritten to `VaultSpark Studios`

Future safeguard:

- `git config --global user.useConfigOnly true` is enabled so Git will not silently fall back to an unintended identity

### Footer and solo game start issue

Root cause was main layout shrink/overflow pressure after the play page visual refresh.

Applied fixes:

- `src/client/components/MainLayout.ts`
  - added `min-h-0` to the main flex containers so center content can shrink and scroll correctly
- `src/client/components/PlayPage.ts`
  - removed clipping pressure from the page shell
- `src/client/styles.css`
  - added short-screen fallback so hero subhead/chips collapse on shorter viewports

### Vault / convoy "idle" issue and visibility improvements

Applied fixes:

- `src/client/graphics/layers/ControlPanel.ts`
  - convoy display now prefers:
    1. your convoy
    2. allied convoy
    3. next projected vault-window reward
  - added optional VaultFront HUD debug instrumentation behind `vaultfront.debug=1` in local/session storage, `?vaultDebug=1` in the URL, or `globalThis.__OPENFRONT_VAULT_DEBUG__ = true`
  - status-consume and convoy-selection handoff points now log concise debug summaries when that flag is enabled
  - added a live in-HUD Vault QA checklist for capture, passive-income ticks, delivery, and intercept verification during manual matches
  - added explicit Jam Breaker cost line and hover transparency
  - reroute preview panel only renders for the player's own convoy
  - increased floating Vault HUD top offset to reduce overlap risk with the pause strip
- `src/core/execution/VaultFrontExecution.ts`
  - added convoy creation + status publication debug instrumentation behind `globalThis.__OPENFRONT_VAULT_DEBUG__ = true`
  - passive gold message includes exact gold amount
  - convoy intercept / delivery messages and activity labels include exact gold/troop outcomes
  - Jam Breaker insufficient-gold error now shows exact required gold and shortfall
  - passive income activity is no longer suppressed by early low-signal filtering
- `src/client/graphics/layers/GameRightSidebar.ts`
  - reintroduced clickable nearby vault card into the top objective rail
  - timeline now includes `vault_passive_income`
  - added objective rail CTAs (`Capture`, `Defend`, `Intercept`)
  - added a compact prioritized Vault event feed for passive income and convoy outcomes
  - froze feed behavior into explicit rules:
    - priority order: self > ally > global > global passive
    - repeated passive income merges within a short window
    - feed hard-caps to 4 entries
    - feed entries expire after a short TTL instead of lingering indefinitely
  - added helper anchor methods for feed/objective rail positioning so layout regressions are testable
- `src/client/graphics/layers/VaultFrontLayer.ts`
  - convoy lane rendering upgraded with animated gradient lane, better convoy truck detail, and escort ring
  - added destination glow, delivery burst lines, and intercept debris/flash accents

## Key files touched recently

- `src/core/execution/VaultFrontExecution.ts`
- `src/core/game/GameUpdates.ts`
- `src/core/Schemas.ts`
- `src/core/configuration/Config.ts`
- `src/core/configuration/DefaultConfig.ts`
- `src/server/GameManager.ts`
- `src/server/GameServer.ts`
- `src/client/Transport.ts`
- `src/client/graphics/layers/ControlPanel.ts`
- `src/client/graphics/layers/GameRightSidebar.ts`
- `src/client/graphics/layers/GameLeftSidebar.ts`
- `src/client/graphics/layers/VaultFrontLayer.ts`
- `src/client/graphics/layers/TerrainLayer.ts`
- `src/client/graphics/layers/WinModal.ts`
- `src/client/components/PlayPage.ts`
- `src/client/components/MainLayout.ts`
- `src/client/GameModeSelector.ts`
- `src/client/styles.css`

## Validation already run

Passing at last check:

- `.\node_modules\.bin\tsc.cmd --noEmit`
- `.\node_modules\.bin\eslint.cmd src/client/graphics/layers/ControlPanel.ts src/client/graphics/layers/GameRightSidebar.ts src/core/execution/VaultFrontExecution.ts tests/client/graphics/layers/ControlPanelVaultHud.test.ts tests/client/graphics/layers/GameRightSidebarVaultFeed.test.ts tests/core/execution/VaultFrontExecution.test.ts`
- `.\node_modules\.bin\vitest.cmd run tests/core/execution/VaultFrontExecution.test.ts tests/client/graphics/layers/ControlPanelVaultHud.test.ts tests/client/graphics/layers/GameRightSidebarVaultFeed.test.ts`

Additional targeted coverage added:

- passive-income activity is not suppressed during the early low-signal window
- newly launched convoy is included in the published VaultFront status update
- personal convoy is rendered ahead of ally fallback in the floating Vault HUD
- ally-convoy fallback does not expose the player's reroute preview
- `?vaultDebug=1` enables persistent VaultFront debug mode
- Vault QA checklist renders when debug mode is active
- passive-income feed entries merge and render as a single readable item
- floating Vault HUD and right-side feed anchors do not conflict on desktop

Note:

- In this environment, `vitest` often needs escalation because `vite/esbuild` spawn can fail inside the sandbox with `EPERM`.

## Known constraints / cautions

- The git worktree is heavily dirty. Assume many unrelated user changes exist.
- Do not revert files outside the current task.
- Prefer `apply_patch` for manual code edits.
- The current source of truth is the repo state, not the prior chat.

## Good next tasks

1. Manually verify in-game that:
   - personal convoy status appears when capturing a vault
   - passive income events are readable and not too noisy
   - top-right floating Vault HUD does not overlap pause strip at target resolutions
   - new right-side Vault feed does not collide with the floating Vault HUD
2. If manual QA still finds state mismatches, enable `vaultfront.debug=1` and inspect:
   - `VaultFrontExecution` logs for `start_convoy` and `publish_status`
   - `ControlPanel` logs for `status_update` and `selection`
   - the floating Vault HUD QA checklist while reproducing capture -> passive -> delivery/intercept flow
3. Tighten convoy launch/delivery/intercept readability with stronger in-world effects if needed.
4. Recommended next major gameplay slice:
   - deeper VaultFront polish before submarines or broader UI cleanup
5. If requested, implement submarine slice:
   - dual-state movement: surfaced vs submerged
   - sonar ping + torpedo attack + stealth/silent run
   - counterplay with warships via detection / depth-charge style mechanics
   - animation direction: wake on surface, bubble/ripple trail underwater, torpedo corkscrew trail, sonar pulse ring

## Pending limitation

- A real manual in-game pass has not been performed from this terminal-only environment. Current confidence comes from code inspection plus passing typecheck, lint, and targeted tests.

## Suggested prompt for the next session

"Resume from `CODEX_HANDOFF_2026-03-06.md`. Read that file first, inspect the referenced VaultFront/HUD files, and continue from repo state without reverting unrelated changes."
