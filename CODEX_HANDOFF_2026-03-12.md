# Codex Handoff - 2026-03-12

This file is the current resume point for a fresh Codex session.

## Current focus

VaultFront is now on the own-repo GitHub Pages model and the local repo wiring
has been flipped so `VaultSparkStudios/vaultfront` is the canonical Git remote
for day-to-day work.

## Canonical repo wiring

- `origin` now points to:
  - `https://github.com/VaultSparkStudios/vaultfront.git`
- `openfront-upstream` now points to:
  - `https://github.com/openfrontio/OpenFrontIO.git`
- local `main` now tracks:
  - `origin/main`
- archived pre-migration local branch:
  - `openfront-main-archive-2026-03-12`
- clean publish worktree branch used for curated pushes:
  - `.codex-temp-vaultfront-clean`
  - `codex/project-memory-stack`

Important rule for future sessions:

- new VaultFront work should start from local `main` or another branch based on
  `origin/main`
- do not default to the archived OpenFront-tracking branch
- keep `openfront-upstream` only as a reference/upstream sync source

## What changed this session

### GitHub Pages source moved into this repo

- `.github/workflows/deploy-pages.yml` no longer tries to sync into
  `VaultSparkStudios.github.io`
- the workflow is manual-only and publishes a GitHub Pages artifact from this
  repo directly
- the current artifact source is:
  - `pages-stub/`

### Public stub content is repo-local and live

Repo-local launch stub files:

- `pages-stub/index.html`
- `pages-stub/404.html`

Purpose:

- keep `https://vaultsparkstudios.com/vaultfront/` working without exposing the
  half-live playable client
- keep the public URL on a project page until runtime launch readiness exists

### Gameplay and HUD updates were pushed to VaultFront

The following VaultFront gameplay/client work was migrated from the old local
OpenFront-tracking branch into the clean VaultFront publish worktree and then
pushed to `vaultfront/main`:

- HUD clarity/compression updates
- vault feed and objective rail readability updates
- nation bot VaultFront command tuning
- flatter VaultFront reward/passive/jam tuning
- stronger post-match recap coaching
- expanded client-side QA instrumentation

Remote state after push:

- `vaultfront/main` advanced from `5097419a` to `bbcab451`
- pushed via clean worktree branch `codex/project-memory-stack`

## Current intended public behavior

- `https://vaultsparkstudios.com/vaultfront/` should load the repo-local launch
  stub over HTTPS
- the page should not publish the playable client yet
- the studio homepage CTA remains `View Project`

## Important operational notes

- the live `404` root cause was a deployment mismatch between the old
  cross-repo Pages sync model and the live own-repo Pages model
- `build:pages` still exists for the eventual real client launch, but it is not
  the active public publish path
- do not switch the public Pages workflow back to the client bundle until:
  - `play-vaultfront.vaultsparkstudios.com` is live
  - `api-vaultfront.vaultsparkstudios.com` is live
  - websocket/CORS/health checks are verified from the public path

## Validation run this session

- earlier Pages rollout was pushed and verified live over HTTPS
- local gameplay/HUD pass committed on the old local branch as:
  - `83466f3b Refine VaultFront gameplay clarity and tuning`
- that work was ported into the clean VaultFront worktree and pushed as:
  - `ce5521cf Refine VaultFront gameplay clarity and tuning`
  - `bbcab451 Align VaultFront HUD test expectations`
- targeted clean-worktree validation passed using the root Vitest config:
  - `36/36` tests green across the touched HUD/feed/recap/execution files

## Next steps

1. Keep the page as a stub until backend readiness exists.
2. Provision `play-vaultfront` and `api-vaultfront`.
3. Verify websocket, health, and CORS behavior from the public path.
4. Later, replace the stub workflow with the standard client-bundle Pages
   workflow from `docs/templates/deploy-pages.template.yml`.
