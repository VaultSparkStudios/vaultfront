# Latest Handoff

Date: 2026-03-27

---

## Session summary — 2026-03-27 (session 2)

Full audit + 25-item implementation pass. All planned items shipped.

### Shipped this session

- **SOUL.md + PROJECT_BRIEF.md** rewritten with real substance (context/)
- **CI**: security-audit job (`npm audit --audit-level=high`) added to ci.yml
- **nginx.conf**: CSP + X-Content-Type-Options + X-Frame-Options + Referrer-Policy headers
- **NewsModal**: news button made visible (removed hidden class)
- **Replay system wired**: `ReplayStore.recordTurn()` integrated into GameServer turn loop; Worker.ts exposes `/api/replay/:id` and `/api/replays` routes
- **Spectator WebSocket**: `WorkerLobbyService` third WSS (`spectatorWss`) routes `/spectate/:gameId`; `spectatorBus.broadcast()` called in GameServer turn fan-out
- **VaultFrontStatusUpdate** extended: `executionChains`, `surges`, `squadObjectives` fields
- **VaultFrontExecution.ts** publishes all three new fields each tick
- **VaultFrontLayer.ts**: execution chain combo meter, surge badge, squad ring, mutator banner rendered
- **NationExecution.ts** bot AI: gold-gated `jam_breaker`, strength-aware escort, tighter timing windows
- **VaultFrontTutorial.ts**: first-run 5-step tutorial overlay (registered in Main.ts)
- **VAULTFRONT_SOURCE_MAP.md** updated with VaultFrontTutorial.ts
- **DECISIONS.md**: 3 new architectural decisions recorded
- **TASK_BOARD.md**: fully rebuilt with SIL-14 through SIL-28 brainstorm items organised into Now / Queued / Post-Deploy / Manual

### Test status

- 623/623 unit tests green
- 0 TypeScript errors from new code
- 3 Playwright E2E specs still failing — pre-existing: `@playwright/test` not installed (manual task 0)

---

## Immediate next action

1. **Manual task 0**: `npm install --save-dev @playwright/test` then `npx playwright install`
2. Execute `docs/DEPLOY_RUNTIME_RUNBOOK.md` steps 1–8 to bring runtime online (8 manual blockers remain)
3. **SIL-14**: Extract `VaultRewardCalculator` from VaultFrontExecution.ts for safe tuning
4. **SIL-15**: Extract `VaultRouteRiskScorer` from VaultFrontExecution.ts for safe tuning
5. **SIL-16**: Keyboard shortcut system (E/J/R/Tab) for experienced players

---

## Open manual blockers (unchanged)

| #   | Task                                             | Status     |
| --- | ------------------------------------------------ | ---------- |
| 0   | Install @playwright/test + playwright browsers   | ⏳ Pending |
| 1   | Rename local folder `OpenFrontIO` → `VaultFront` | ⏳ Pending |
| 2   | Provision Hetzner VPS                            | ⏳ Pending |
| 3   | Configure GitHub Actions secrets                 | ⏳ Pending |
| 4   | Configure GitHub Actions vars                    | ⏳ Pending |
| 5   | Set up Postgres + Redis on VPS                   | ⏳ Pending |
| 6   | Configure DNS records                            | ⏳ Pending |
| 7   | Run first deploy and verify                      | ⏳ Pending |
| 8   | Swap Pages workflow to real client bundle        | ⏳ Pending |

---

## Key context files

- `context/CURRENT_STATE.md` — canonical repo + deployment state
- `context/TASK_BOARD.md` — all tasks (Now / Queued / Post-Deploy / Manual / SIL backlog)
- `context/SELF_IMPROVEMENT_LOOP.md` — session scores and brainstorm items
- `docs/VAULTFRONT_SOURCE_MAP.md` — every VaultFront-owned or modified file
- `docs/DEPLOY_RUNTIME_RUNBOOK.md` — step-by-step deploy instructions
