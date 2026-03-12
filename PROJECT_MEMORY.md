# Project Memory

This file is the stable memory layer for fresh AI sessions.

Read this after `AGENTS.md` and before the dated handoff file.

## Identity

- Game: `VaultFront`
- Repo: `VaultSparkStudios/VaultFront`
- Public slug: `vaultfront`
- Studio site repo: `VaultSparkStudios/VaultSparkStudios.github.io`

## Canonical URLs

- Studio root:
  - `https://vaultsparkstudios.com/`
- Public game path:
  - `https://vaultsparkstudios.com/vaultfront/`
- Gameplay runtime target:
  - `https://play-vaultfront.vaultsparkstudios.com`
- API runtime target:
  - `https://api-vaultfront.vaultsparkstudios.com`

## Current public state

- The public `vaultfront` path is a project page, not a playable client.
- The studio homepage VaultFront card CTA is `View Project`.
- The project page content is now published from this repo's own GitHub Pages
  workflow, not from the studio-site repo.
- The playable launch is blocked on the dedicated runtime/backend rollout.

## Deployment posture

- Frontend Pages deployment and backend/runtime deployment stay separate.
- `deploy-pages.yml` is manual-only until runtime launch readiness exists.
- `deploy-pages.yml` currently publishes `pages-stub/` as the public project
  page artifact.
- The public path must not be overwritten with the static client until the
  backend stack is live and verified.
- The repo-local `build:pages` client bundle remains for future launch
  readiness, but it is not the current public publish source.
- Backend naming stays on the studio default:
  - `play-{slug}.vaultsparkstudios.com`
  - `api-{slug}.vaultsparkstudios.com`

## Repo memory stack

Read order for future sessions:

1. `AGENTS.md`
2. `PROJECT_MEMORY.md`
3. latest `CODEX_HANDOFF_YYYY-MM-DD.md`
4. deployment/runtime docs referenced by the task

## Canonical repo docs

- `docs/STUDIO_DEPLOYMENT_STANDARD.md`
- `docs/STUDIO_BACKEND_PLAN.md`
- `docs/DEPLOY_PAGES.md`
- `docs/templates/deploy-pages.template.yml`
- `docs/templates/deploy-backend.docker-compose.template.yml`
- `docs/templates/Caddyfile.studio-backend.template`
- `docs/templates/GAME_LAUNCH_CHECKLIST.template.md`

## Remotes

- upstream source remote retained locally:
  - `origin -> https://github.com/openfrontio/OpenFrontIO.git`
- game remote:
  - `vaultfront -> https://github.com/VaultSparkStudios/VaultFront.git`

## Resume pointers

- Latest operational handoff file:
  - `CODEX_HANDOFF_2026-03-12.md`
- The main local `OpenFrontIO` worktree may be dirty with unrelated HUD/test
  edits.
- A clean VaultFront worktree has been used for deployment/repo-sync work:
  - `.codex-temp-vaultfront-clean`
- A temporary studio-site clone has been used for studio homepage and project
  page work:
  - `.codex-temp-studio-site`

## Next launch-critical work

1. Confirm `VaultFront` repo Pages is set to `GitHub Actions`.
2. Run the manual stub publish workflow from this repo.
3. Verify `https://vaultsparkstudios.com/vaultfront/` loads from repo-local
   Pages instead of returning `404`.
4. Provision the shared VPS runtime stack.
5. Bring up Caddy, Postgres, Redis, and the VaultFront play/api services.
6. Configure DNS and TLS for `play-vaultfront` and `api-vaultfront`.
7. Verify websocket, CORS, and health endpoints from the public game path.
8. Only then replace the stub workflow with the real Pages client rollout.

## Maintenance rule

When canonical state changes, update this file and the latest handoff so a new
session can resume from repo state without relying on prior chat.
