# VaultFront Source Map

This document lists every file in the repo that VaultFront owns or has
meaningfully modified from the upstream OpenFrontIO base. Use this as a
quick index for AI sessions and code reviews.

---

## VaultFront-owned files

New files with no upstream equivalent. These are the core VaultFront additions.

### Game logic — execution

| File                                                | Purpose                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `src/core/execution/VaultFrontExecution.ts`         | Core vault mechanic: capture, income, beacon, and convoy tick logic |
| `src/core/execution/VaultConvoyCommandExecution.ts` | Processes player convoy-command intents for vault routing           |
| `src/core/execution/VaultRolePingExecution.ts`      | Processes player role-ping intents for team coordination            |

### Client — HUD layer

| File                                            | Purpose                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `src/client/graphics/layers/VaultFrontLayer.ts` | Dedicated canvas layer: vault site markers, convoy overlays, beacon rings |

### Tests — owned

| File                                                             | Purpose                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `tests/core/execution/VaultFrontExecution.test.ts`               | Unit tests for VaultFrontExecution tick and state machine |
| `tests/core/execution/VaultFrontCommandWiring.test.ts`           | Wiring/registration tests for vault commands              |
| `tests/core/execution/VaultFrontExecutionProperty.test.ts`       | Property-based tests for vault execution invariants       |
| `tests/core/execution/NationExecutionVaultFront.test.ts`         | Bot vault-command behavior tests                          |
| `tests/client/graphics/layers/ControlPanelVaultHud.test.ts`      | ControlPanel vault HUD rendering tests                    |
| `tests/client/graphics/layers/GameRightSidebarVaultFeed.test.ts` | Right sidebar vault feed rendering tests                  |

---

## VaultFront-modified files

Upstream OpenFrontIO files that carry VaultFront additions. When merging
upstream changes, check these files for conflicts.

### Core — schemas and game model

| File                            | VaultFront additions                                     |
| ------------------------------- | -------------------------------------------------------- |
| `src/core/Schemas.ts`           | Vault types in the shared game schema                    |
| `src/core/game/Game.ts`         | Vault interface methods on the Game contract             |
| `src/core/game/GameImpl.ts`     | Vault method implementations                             |
| `src/core/game/GameUpdates.ts`  | `VaultFrontStatus` and `VaultFrontActivity` update types |
| `src/core/game/GameView.ts`     | Vault view interface extension                           |
| `src/core/game/Stats.ts`        | Vault stat types                                         |
| `src/core/game/StatsImpl.ts`    | Vault stat implementation                                |
| `src/core/game/UserSettings.ts` | Vault user-settings fields                               |
| `src/core/GameRunner.ts`        | Vault execution wiring in the game runner                |

### Core — configuration

| File                                      | VaultFront additions          |
| ----------------------------------------- | ----------------------------- |
| `src/core/configuration/Config.ts`        | Vault config interface fields |
| `src/core/configuration/DefaultConfig.ts` | Vault config default values   |
| `src/core/configuration/ProdConfig.ts`    | Vault prod-override values    |

### Core — execution (modified upstream files)

| File                                                   | VaultFront additions               |
| ------------------------------------------------------ | ---------------------------------- |
| `src/core/execution/ExecutionManager.ts`               | Vault execution registration       |
| `src/core/execution/NationExecution.ts`                | Bot vault-command scheduling logic |
| `src/core/execution/DefenseFactoryCommandExecution.ts` | Vault-aware defense integration    |

### Client — app shell and transport

| File                              | VaultFront additions                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/client/Api.ts`               | Vault runtime API calls (`fetchVaultFrontRuntimeAssignment`, `recordVaultFrontRuntimeEvent`) |
| `src/client/Transport.ts`         | Vault intent event transport                                                                 |
| `src/client/Main.ts`              | Vault client initialization                                                                  |
| `src/client/Utils.ts`             | Vault client utilities                                                                       |
| `src/client/NewsMarkdown.ts`      | Vault news/content integration                                                               |
| `src/client/GameStartingModal.ts` | Vault game-starting modal additions                                                          |
| `src/client/HostLobbyModal.ts`    | Vault lobby integration                                                                      |
| `src/client/SinglePlayerModal.ts` | Vault single-player flow                                                                     |

### Client — branding and nav

| File                                     | VaultFront additions                    |
| ---------------------------------------- | --------------------------------------- |
| `src/client/BrandTheme.ts`               | VaultFront brand tokens (colors, fonts) |
| `src/client/components/DesktopNavBar.ts` | VaultFront nav branding                 |
| `src/client/components/Footer.ts`        | VaultFront footer branding              |
| `src/client/components/MobileNavBar.ts`  | VaultFront mobile nav branding          |
| `src/client/components/PlayPage.ts`      | VaultFront play-page shell              |

### Client — graphics and HUD

| File                                             | VaultFront additions                                     |
| ------------------------------------------------ | -------------------------------------------------------- |
| `src/client/graphics/GameRenderer.ts`            | VaultFrontLayer registration                             |
| `src/client/graphics/HudLayout.ts`               | Vault HUD layout constants                               |
| `src/client/graphics/HudTelemetry.ts`            | Vault HUD telemetry helpers                              |
| `src/client/graphics/layers/ControlPanel.ts`     | Vault HUD panel, onboarding, debug overlay, KPI tracking |
| `src/client/graphics/layers/GameLeftSidebar.ts`  | Vault left-sidebar additions                             |
| `src/client/graphics/layers/GameRightSidebar.ts` | Vault activity feed, timeline, debug overlay             |
| `src/client/graphics/layers/SettingsModal.ts`    | Vault settings options                                   |
| `src/client/graphics/layers/WinModal.ts`         | Vault post-match recap and coaching                      |

---

## Maintenance note

When VaultFront adds or removes a file, or meaningfully modifies an upstream
file that is not already listed here, update this map so future sessions stay
accurate.
