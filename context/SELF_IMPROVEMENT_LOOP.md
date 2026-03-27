# Self-Improvement Loop

This file is the living audit and improvement engine for the project.
Append a new entry every closeout. Never delete prior entries.

---

## Scoring rubric

Rate 0–10 per category at each closeout:

| Category               | What it measures                                               |
| ---------------------- | -------------------------------------------------------------- |
| **Dev Health**         | Code quality, CI status, test coverage, technical debt level   |
| **Creative Alignment** | Adherence to SOUL.md and CDR — are builds matching the vision? |
| **Momentum**           | Commit frequency, feature velocity, milestone progress         |
| **Engagement**         | Community, player, or user feedback signals                    |
| **Process Quality**    | Handoff freshness, Studio OS compliance, context file accuracy |

---

## Loop protocol

### At closeout (mandatory)

1. Score all 5 categories (0–10 each, 50 max)
2. Compare to prior session scores — note trajectory (↑ ↓ →) per category
3. Identify 1 top win and 1 top gap
4. Brainstorm 3–5 innovative solutions, features, or improvements
5. Commit 1–2 brainstorm items to `context/TASK_BOARD.md` — label them `[SIL]`
6. Append an entry to this file using the format below

### At start (mandatory read)

- Read this file after `context/LATEST_HANDOFF.md`
- Note open brainstorm items not yet actioned
- Check whether prior `[SIL]` TASK_BOARD commitments were completed
- If a committed item was skipped 2+ sessions in a row, escalate it to **Now** on TASK_BOARD

---

## Entries

### 2026-03-26 — Full audit + 25-item implementation pass

**Scores**

| Category           | Score       | vs Last | Notes                                                                         |
| ------------------ | ----------- | ------- | ----------------------------------------------------------------------------- |
| Dev Health         | 8.0         | —       | 623 tests green, coverage enforced, CI dep audit added, CSP headers added     |
| Creative Alignment | 7.5         | —       | SOUL.md and PROJECT_BRIEF.md rewritten with real substance                    |
| Momentum           | 5.5         | —       | Major session: replay, spectator, HUD mechanics, tutorial, bot AI all shipped |
| Engagement         | 2.0         | —       | Zero live players yet — no signal possible until deploy                       |
| Process Quality    | 8.0         | ↑       | Task board complete, memory updated, DECISIONS up to date, SIL written        |
| **Total**          | **31 / 50** |         |                                                                               |

**Top win:** First-run tutorial + execution chain combo meter + surge badge are the most impactful player-experience items — they surface the game's identity at first and last impression.

**Top gap:** Deployment is still 0/8 manual steps complete. Every item above is invisible until the runtime launches.

**Innovative Solutions Brainstorm**

See TASK_BOARD.md SIL-14 through SIL-28 for the full list.

Top 3 actionable next session:

1. `[SIL-14/15]` Extract VaultRewardCalculator and VaultRouteRiskScorer — makes tuning safe and testable
2. `[SIL-16]` Keyboard shortcut system — E/J/R/Tab — depth for experienced players
3. `[SIL-18]` Visual regression tests — catches canvas layer breakage CI currently misses

**Committed to TASK_BOARD this session**

- [SIL-14] Extract `VaultRewardCalculator`
- [SIL-15] Extract `VaultRouteRiskScorer`

---

### 2026-03-26 — Studio OS onboarding

**Scores**

| Category           | Score      | vs Last | Notes                        |
| ------------------ | ---------- | ------- | ---------------------------- |
| Dev Health         | —          | —       | Baseline — not yet assessed  |
| Creative Alignment | —          | —       | Baseline — not yet assessed  |
| Momentum           | —          | —       | Baseline — not yet assessed  |
| Engagement         | —          | —       | Baseline — not yet assessed  |
| Process Quality    | 5          | —       | Studio OS files bootstrapped |
| **Total**          | **5 / 50** |         |                              |

**Top win:** Studio OS context files bootstrapped — project now has agent continuity

**Top gap:** All context files need project-specific content filled in

**Innovative Solutions Brainstorm**

1. Fill out PROJECT_BRIEF.md with a compelling pitch — what makes this project worth playing/using?
2. Define 3 core SOUL non-negotiables that will guide every creative decision
3. Identify the single highest-leverage next feature that would most increase engagement
4. Set up CI/CD so Dev Health can be properly measured
5. Create a milestone tracker so Momentum score can be tracked over time

**Committed to TASK_BOARD this session**

- [SIL] Fill out all context files with project-specific content
- [SIL] Define first concrete milestone for Momentum tracking
