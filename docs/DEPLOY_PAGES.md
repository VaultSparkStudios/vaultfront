# VaultFront Pages Deployment

VaultFront now uses the own-repo GitHub Pages model.

The public URL remains:

- `https://vaultsparkstudios.com/vaultfront/`

But until the dedicated runtime is live, this repo publishes a launch stub, not
the playable client.

## Current public publish source

The current workflow publishes:

- `pages-stub/index.html`
- `pages-stub/404.html`

Workflow:

- `.github/workflows/deploy-pages.yml`

Behavior:

- manual-only via `workflow_dispatch`
- uploads the repo-local `pages-stub/` folder as the GitHub Pages artifact
- deploys directly from `VaultSparkStudios/VaultFront`
- does not sync into `VaultSparkStudios.github.io`

## One-time GitHub setup

In `VaultSparkStudios/VaultFront`:

1. Open `Settings -> Pages`
2. Set `Source` to `GitHub Actions`

If this is not configured, the workflow can succeed in GitHub Actions while the
public URL still returns `404`.

## Why the playable client is not published yet

The static app bundle is still intentionally held back.

Reasons:

- the public path should not expose a half-live client
- gameplay still depends on the dedicated runtime/backend rollout
- the public launch requires:
  - `https://play-vaultfront.vaultsparkstudios.com`
  - `https://api-vaultfront.vaultsparkstudios.com`

Current rule:

- `deploy-pages.yml` publishes the stub only
- the playable client must not replace the stub until the runtime stack is live
  and verified

## Future live-client rollout

The repo still supports a real Pages client build for the eventual launch.

Relevant command:

- `npm run build:pages`

That build uses the production subpath values for:

- `VITE_APP_BASE_PATH=/vaultfront/`
- `VITE_CANONICAL_URL=https://vaultsparkstudios.com/vaultfront/`
- `VITE_DOMAIN=vaultsparkstudios.com`
- `VITE_GAME_SERVICE_ORIGIN=https://play-vaultfront.vaultsparkstudios.com`
- `API_DOMAIN=api-vaultfront.vaultsparkstudios.com`

When runtime launch readiness exists, replace the stub-publish workflow with
the standard GitHub Pages bundle workflow from:

- `docs/templates/deploy-pages.template.yml`

## Required variables for the eventual playable client

These are not required for the current stub deployment, but they are required
before publishing the real client bundle:

- `GAME_SERVICE_ORIGIN`
  - `https://play-vaultfront.vaultsparkstudios.com`
- `API_DOMAIN`
  - `api-vaultfront.vaultsparkstudios.com`

Backend/runtime deployment remains separate and is documented in:

- `docs/STUDIO_BACKEND_PLAN.md`
