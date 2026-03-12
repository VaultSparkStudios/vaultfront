# Current State

Date: 2026-03-12

## Canonical repo state

- Repo of record: `VaultSparkStudios/vaultfront`
- Local branch: `main`
- Upstream tracking: `origin/main`
- Canonical remote:
  - `origin -> https://github.com/VaultSparkStudios/vaultfront.git`
- Reference remote:
  - `openfront-upstream -> https://github.com/openfrontio/OpenFrontIO.git`
- Archived local branch retained for old OpenFront tracking history:
  - `openfront-main-archive-2026-03-12`

## Public deployment state

- Public project URL:
  - `https://vaultsparkstudios.com/vaultfront/`
- Current public behavior:
  - repo-local GitHub Pages launch stub is live over HTTPS
- Runtime targets reserved but not launched:
  - `https://play-vaultfront.vaultsparkstudios.com`
  - `https://api-vaultfront.vaultsparkstudios.com`

## Most recent shipped changes

- `5097419a` converted Pages publishing to the repo-local launch-stub model
- `ce5521cf` ported the VaultFront gameplay clarity and tuning pass to the
  canonical VaultFront branch
- `bbcab451` aligned HUD test expectations after the migration
- `829fe5fe` documented VaultFront as the canonical repo of record

## Validation status

- Public VaultFront project page previously verified live over HTTPS
- Clean-worktree targeted validation passed for the gameplay/HUD migration:
  - `36/36` tests passed
- `main` matched `origin/main` before this closeout write-back

## Open constraints

- The public site is still a stub, not the playable client
- Runtime/backend rollout has not started in this branch
- `openfront-main-archive-2026-03-12` remains local-only by design
- Closeout files written in this session are currently local until committed
