# Agent Instructions

## Deployment standards

Before making deployment, domain, GitHub Pages, or studio-site integration
changes, read these files first:

- `docs/STUDIO_DEPLOYMENT_STANDARD.md`
- `docs/STUDIO_BACKEND_PLAN.md`
- `docs/DEPLOY_PAGES.md`
- `docs/templates/deploy-pages.template.yml`
- `docs/templates/deploy-backend.docker-compose.template.yml`
- `docs/templates/Caddyfile.studio-backend.template`
- `docs/templates/GAME_LAUNCH_CHECKLIST.template.md`

## Required behavior

- Treat `docs/STUDIO_DEPLOYMENT_STANDARD.md` as the default studio-wide policy
  for future game launches unless the user explicitly overrides it.
- Keep this repo self-sufficient: deployment/domain/workflow context must remain
  understandable from repo files, not just prior chat context.
- Keep public game URLs lowercase and slug-based.
- Keep the studio landing page repo separate from individual game repos.
- Keep frontend Pages deployment separate from backend/runtime deployment.
- Keep backend/runtime naming on the studio default:
  - `https://play-{slug}.vaultsparkstudios.com`
  - `https://api-{slug}.vaultsparkstudios.com`
- Update `CODEX_HANDOFF_YYYY-MM-DD.md` after deployment-related changes.
- If you create a temporary clone of another repo inside this repo, add it to
  `.git/info/exclude` so it cannot be accidentally staged here.
- Before committing studio-site homepage changes, fetch the latest remote state
  and verify the live site or upstream landing-page file so you are not editing
  against a stale clone.

## VaultSpark Studios website integration

- Studio root site repo: `VaultSparkStudios/VaultSparkStudios.github.io`
- Standard game path pattern: `https://vaultsparkstudios.com/{slug}/`
- Standard backend patterns:
  - `https://play-{slug}.vaultsparkstudios.com`
  - `https://api-{slug}.vaultsparkstudios.com`
- Default backend host model:
  - shared studio VPS
  - Docker Compose
  - Caddy
  - shared Postgres
  - shared Redis
