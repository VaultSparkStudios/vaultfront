# Current State

Date: 2026-03-26

---

## Canonical repo state

- Repo of record: `VaultSparkStudios/vaultfront`
- Local branch: `main`
- Upstream tracking: `origin/main`
- Canonical remote:
  - `origin -> https://github.com/VaultSparkStudios/vaultfront.git`
- Reference remote (read-only, upstream sync source):
  - `openfront-upstream -> https://github.com/openfrontio/OpenFrontIO.git`
- Archived local branch (do not use for new work):
  - `openfront-main-archive-2026-03-12`
- Local folder: `documents/development/OpenFrontIO`
  - ⚠️ MANUAL PENDING: rename to `documents/development/VaultFront`

---

## Public deployment state

- Public project URL: `https://vaultsparkstudios.com/vaultfront/`
- Current public behavior: repo-local GitHub Pages launch stub is live over HTTPS
- Runtime targets reserved but not yet launched:
  - `https://play-vaultfront.vaultsparkstudios.com` ⚠️ MANUAL PENDING
  - `https://api-vaultfront.vaultsparkstudios.com` ⚠️ MANUAL PENDING

---

## Most recent shipped changes

- `8f53f309` repo organization, docs, CODEOWNERS, lifecycle integration tests
- `01461146` fixed GitHub CI failures on `main`
- `88a9e04b` excluded local `.codex-temp-*` worktrees from tooling
- `bbcab451` aligned HUD test expectations after gameplay/HUD migration
- `ce5521cf` ported VaultFront gameplay clarity and tuning pass to canonical branch
- `5097419a` converted Pages publishing to repo-local launch-stub model

---

## Validation status

- 82/82 test files, 623/623 tests green (as of 2026-03-26)
- GitHub Actions `CI` last passed on `88a9e04b`
- `main` is ahead of `origin/main` by 1 commit (`8f53f309` — not yet pushed)

---

## Manual blockers — deployment

All of the following require human action outside this repo.
See `context/TASK_BOARD.md` → MANUAL section for full detail.

| #   | Task                                             | Status     |
| --- | ------------------------------------------------ | ---------- |
| 1   | Rename local folder `OpenFrontIO` → `VaultFront` | ⏳ Pending |
| 2   | Provision Hetzner VPS                            | ⏳ Pending |
| 3   | Configure GitHub Actions secrets                 | ⏳ Pending |
| 4   | Configure GitHub Actions vars                    | ⏳ Pending |
| 5   | Set up Postgres + Redis on VPS                   | ⏳ Pending |
| 6   | Configure DNS records                            | ⏳ Pending |
| 7   | Run first deploy and verify                      | ⏳ Pending |
| 8   | Swap Pages workflow to real client bundle        | ⏳ Pending |

---

## Open constraints

- Public site is a stub — not the playable client
- Backend/runtime rollout has not started; blocked entirely on manual steps
- `openfront-main-archive-2026-03-12` is local-only by design
- `8f53f309` is committed locally but not yet pushed to `origin/main`
