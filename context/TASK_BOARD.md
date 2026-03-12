# Task Board

Date: 2026-03-12

## Completed

- Converted VaultFront GitHub Pages to the repo-local launch-stub model
- Restored `https://vaultsparkstudios.com/vaultfront/` with HTTPS-backed stub
- Migrated VaultFront to treat `VaultSparkStudios/vaultfront` as the canonical
  remote and `origin`
- Ported and pushed the gameplay/HUD clarity and tuning pass onto
  `vaultfront/main`
- Updated project memory and dated handoff files for the canonical repo change

## In Progress

- None on the canonical `main` branch

## Next

1. Provision the shared backend/runtime stack for VaultFront
2. Bring up `play-vaultfront` and `api-vaultfront`
3. Verify websocket, CORS, and health behavior from the public site
4. Replace the public stub with the real client only after runtime validation

## Deferred

- Any work that depends on a live backend/runtime deployment
- Any attempt to use `openfront-upstream/main` as the day-to-day publish branch
