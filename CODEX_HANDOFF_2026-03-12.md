# Codex Handoff - 2026-03-12

This file is the current resume point for a fresh Codex session.

## Current focus

VaultFront deployment was updated to the new own-repo GitHub Pages model while
keeping the public URL on a launch stub until backend/runtime rollout exists.

The workspace is dirty. Do not revert unrelated user changes.

## What changed

### GitHub Pages source moved into this repo

- `.github/workflows/deploy-pages.yml` no longer tries to sync into
  `VaultSparkStudios.github.io`
- the workflow is now manual-only and publishes a GitHub Pages artifact from
  this repo directly
- the current artifact source is:
  - `pages-stub/`
- required GitHub setup:
  - `Settings -> Pages -> Source -> GitHub Actions`

### Public stub content is now repo-local

Added repo-local launch stub files:

- `pages-stub/index.html`
- `pages-stub/404.html`

Purpose:

- restore `https://vaultsparkstudios.com/vaultfront/` without exposing the
  half-live playable client
- keep the public URL on a project page until runtime launch readiness exists

### Deployment docs updated

Updated the repo docs/templates to remove the old cross-repo sync assumption and
describe direct GitHub Pages deployment instead:

- `docs/DEPLOY_PAGES.md`
- `docs/STUDIO_DEPLOYMENT_STANDARD.md`
- `docs/STUDIO_BACKEND_PLAN.md`
- `docs/templates/deploy-pages.template.yml`
- `docs/templates/GAME_LAUNCH_CHECKLIST.template.md`

## Current intended public behavior

- `https://vaultsparkstudios.com/vaultfront/` should load the repo-local launch
  stub
- the page should not publish the playable client yet
- the studio homepage CTA remains `View Project`

## Important operational notes

- The live `404` root cause was a deployment mismatch:
  - the old workflow still assumed studio-site cross-repo sync
  - the live hosting model had moved to own-repo GitHub Pages
  - the public `vaultfront/` path was no longer being served from the
    studio-site repo path even though the stub HTML still existed there
- `build:pages` still exists for the eventual real client launch, but it is not
  the active public publish path
- do not switch the public Pages workflow back to the client bundle until:
  - `play-vaultfront.vaultsparkstudios.com` is live
  - `api-vaultfront.vaultsparkstudios.com` is live
  - websocket/CORS/health checks are verified from the public path

## Validation run this session

- verified live failure before changes:
  - `https://vaultsparkstudios.com/vaultfront/` returned `404`
  - `https://vaultsparkstudios.com/vaultfront/index.html` returned `404`
  - `https://vaultsparkstudios.com/vaultfront/404.html` returned `404`
- verified repo state:
  - studio-site remote still contained `vaultfront/index.html`
  - VaultFront remote still had the old cross-repo Pages workflow
- no runtime/gameplay tests were run
- post-edit validation still needed:
  - run `git diff --check`
  - trigger the manual Pages workflow
  - verify the live URL after GitHub Pages finishes deploying

## Next steps

1. In GitHub repo settings for `VaultSparkStudios/VaultFront`, set Pages source
   to `GitHub Actions` if it is not already set.
2. Run `.github/workflows/deploy-pages.yml` manually.
3. Confirm the live URL loads:
   - `https://vaultsparkstudios.com/vaultfront/`
4. Keep the page as a stub until backend readiness exists.
5. Later, replace the stub workflow with the standard client-bundle Pages
   workflow from `docs/templates/deploy-pages.template.yml`.
