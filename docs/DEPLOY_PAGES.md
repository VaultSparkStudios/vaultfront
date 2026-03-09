# VaultFront Pages Deployment

This repo can build a static client bundle for deployment at:

- `https://vaultsparkstudios.com/vaultfront/`

The bundle is intended to be copied into the separate studio landing-page repo,
not published as a standalone Pages site from this repository.

## Required GitHub variables

Set these repo variables in `VaultSparkStudios/VaultFront`:

- `STUDIO_SITE_BRANCH`
  - Example: `main`
- `GAME_SERVICE_ORIGIN`
  - Default standard: `https://play-vaultfront.vaultsparkstudios.com`
- `API_DOMAIN`
  - Default standard: `api-vaultfront.vaultsparkstudios.com`

Studio-wide default naming standard:

- `play-{slug}.vaultsparkstudios.com`
- `api-{slug}.vaultsparkstudios.com`

## Required GitHub secret

- `STUDIO_SITE_TOKEN`
  - Personal access token with write access to the studio site repo

## What the workflow does

`deploy-pages.yml`:

1. Builds the client with `VITE_APP_BASE_PATH=/vaultfront/`
2. Copies `static/index.html` to `static/404.html` for SPA deep-link fallback
3. Checks out the studio site repo
4. Syncs the built bundle into `/vaultfront/`
5. Commits and pushes the updated bundle

The studio repo target is hardcoded to:

- `VaultSparkStudios/VaultSparkStudios.github.io`

## Studio site repo follow-up

The studio site repo still needs a separate content change:

1. Add a `VaultFront` card under the `Vault-Forged` area
2. Link it to `/vaultfront/`
3. Reuse the same card/template pattern as the existing games

This repo does not contain the studio landing-page source, so that step is
documented here but not implemented locally.
