<!-- generated-by: /implement skill v1.0 -->
<!-- generated-at: 2026-05-18 -->
<!-- source-audit: docs/AUDIT_2026-05-18_S5.md -->

# Implement Plan — VaultFront Session 5

| Seq | Slug                               | Effort | Priority |
| --- | ---------------------------------- | ------ | -------- |
| 1   | sil-score-pipeline-fix             | 1h     | 10.1     |
| 2   | replay-integrity-signature         | 1h     | 26.5     |
| 3   | ai-prematch-intelligence-brief     | 1h     | 75.7     |
| 4   | ai-narrative-game-recap            | 1h     | 60.6     |
| 5   | post-match-ai-coach-debrief        | 2h     | 60.75    |
| 6   | match-outcome-rating               | 1h     | 30.9     |
| 7   | achievement-chain-meta             | 2h     | 96.0     |
| 8   | achievement-profile-panel          | 2h     | 48.0     |
| 9   | play-style-career-arc              | 2h     | 105.0    |
| 10  | vault-fortune-post-win             | 2h     | 108.0    |
| 11  | spectator-prediction-league        | 4h     | 73.0     |
| 12  | clan-war-scheduler                 | 4h     | 74.4     |
| 13  | tournament-bracket-ui              | 4h     | 48.7     |
| 14  | season-pass-track-ui               | 4h     | 73.0     |
| 15  | advanced-tutorial-contextual-hints | 2h     | 31.5     |
| 16  | mobile-layout-optimization         | 4h     | 24.8     |

---

# Implement Plan — VaultFront Session 4 (historical)

Generated: 2026-05-18 · 18 items · Combined Priority: 1026.2

## Optimal Execution Sequence

Reordered from raw-priority for: (a) foundations first, (b) axis grouping, (c) 🔥+low-effort front-loaded, (d) token-cost last.

| Seq | Slug                       | Tier | Effort | Priority | Rationale                                                   |
| --- | -------------------------- | :--: | ------ | :------: | ----------------------------------------------------------- |
| 1   | master-ts-build-fix        |  💡  | 30m    |   12.1   | Foundation — unblocks build-prod for all subsequent testing |
| 2   | global-lint-unblock        |  💡  | 30m    |   4.5    | Foundation — unblocks CI signal before any new code lands   |
| 3   | narrator-sentiment-persona |  🔥  | 30m    |   71.5   | Lowest-effort 🔥 item; NarratorBus surface warm             |
| 4   | narrator-match-context     |  ⚡  | 45m    |   49.3   | Same NarratorBus + Worker.ts surface as #3                  |
| 5   | coach-hint-event-triggers  |  🔥  | 1h     |   79.5   | CoachHintEngine isolated file                               |
| 6   | play-style-mid-match       |  🔥  | 1h     |   79.5   | Creates PlayStyleClassifier util reused downstream          |
| 7   | overlay-priority-queue     |  ⚡  | 1h     |   40.4   | VaultFrontLayer foundation — cleans surface for #8          |
| 8   | mutator-live-vote-banner   |  ⚡  | 45m    |   61.7   | VaultFrontLayer + VaultSeasonScheduler — adjacent to #7     |
| 9   | elo-winmodal-animation     |  🔥  | 1h     |   75.7   | WinModal — opens that file for #10, #11                     |
| 10  | dynasty-story-winmodal     |  ⚡  | 1h     |   56.8   | WinModal adjacent to #9                                     |
| 11  | post-match-share-card      |  ⚡  | 2h     |   49.0   | WinModal adjacent to #9/#10                                 |
| 12  | seasonal-rank-decay        |  ⚡  | 1h     |   66.2   | PlayerStatsStore + RankBadge                                |
| 13  | elo-rank-sparkline         |  ⚡  | 1h     |   56.8   | PlayerStatsStore + RankBadge adjacent to #12                |
| 14  | spectator-crowd-prediction |  🔥  | 2h     |   96.0   | NarratorBus + new endpoint — highest-priority innovation    |
| 15  | replay-ai-highlight        |  ⚡  | 2h     |   42.0   | ReplayHighlightStore isolated                               |
| 16  | daily-challenge-system     |  🔥  | 4h     |   73.1   | New store + endpoint                                        |
| 17  | vault-intelligence-market  |  🔥  | 4h     |   94.0   | VaultFrontExecution — largest item, saved for deep context  |
| 18  | token-oracle-cache         |  💡  | 30m    |   18.1   | Token cost — measured after other changes settle            |
