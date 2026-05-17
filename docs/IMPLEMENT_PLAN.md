# Implement Plan — AUDIT_2026-05-17

Generated: 2026-05-17
Source: docs/AUDIT_2026-05-17.json

## Sequencing rationale

Reordered from raw Priority for optimal efficiency:

- Foundations + infra first (unblock downstream)
- Same code-surface items grouped (context savings)
- 🔥 wins with low effort front-loaded for momentum
- Token-cost measurement last (needs other changes settled)

## Execution sequence

| Seq | Slug                       | Axis          | Effort | Priority | Rationale                                           |
| --- | -------------------------- | ------------- | ------ | -------- | --------------------------------------------------- |
| 1   | missing-infra-scripts      | speed         | 4h     | 4.6      | Unblocks workflow scripts; foundation               |
| 2   | surge-visibility           | ux            | 2h     | 48.0     | Quick win; foundational for surge-chronicle         |
| 3   | surge-chronicle            | gamification  | 4h     | 83.6 🔥  | Builds on surge-visibility; same code surface       |
| 4   | combo-meter                | ux            | 4h     | 49.5     | Same HUD surface as surge-chronicle                 |
| 5   | dynamic-vault-scaling      | feature_depth | 2h     | 18.0     | Quick, standalone VaultFrontExecution change        |
| 6   | achievement-spotlight      | gamification  | 4h     | 48.7     | Post-game cluster start                             |
| 7   | post-game-micro-feedback   | feedback_loop | 2h     | 28.0     | Post-game cluster; pairs with achievement-spotlight |
| 8   | ai-battle-narrative        | ai            | 4h     | 52.2 🔥  | Post-game cluster; needs /api/battle-narrative      |
| 9   | last-stand-event           | gamification  | 8h     | 81.3 🔥  | New game event; VaultFrontExecution + Layer         |
| 10  | convoy-intercept-predictor | gamification  | 8h     | 65.1 🔥  | Convoy system; builds on status update              |
| 11  | mutator-variety            | feature_depth | 4h     | 20.3     | Fast; extends existing mutator type                 |
| 12  | mutator-vote               | gamification  | 8h     | 50.6     | DB + UI; depends on mutator-variety slugs           |
| 13  | elo-placement-progression  | gamification  | 8h     | 43.4     | Competitive systems; PlayerStatsStore + UI          |
| 14  | replay-highlight-sharing   | feature_depth | 4h     | 32.5     | ReplayStore + ReplayPanel                           |
| 15  | smart-spectator-camera     | ai            | 8h     | 28.9     | Spectator system; SpectatorBus                      |
| 16  | api-auth-security          | security      | 4h     | 8.1      | Validation; required before ghost-route ships       |
| 17  | bot-vaultfront-awareness   | ai            | 1d     | 14.4     | Large bot changes; BotExecution + AiAttackBehavior  |
| 18  | convoy-ghost-route         | feature_depth | 1d     | 23.0     | Complex new mechanic; requires api-auth-security    |
| 19  | context-token-ledger       | token         | 4h     | 7.7      | Measure after all other changes settled             |

## Status

- [ ] 1. missing-infra-scripts
- [ ] 2. surge-visibility
- [ ] 3. surge-chronicle
- [ ] 4. combo-meter
- [ ] 5. dynamic-vault-scaling
- [ ] 6. achievement-spotlight
- [ ] 7. post-game-micro-feedback
- [ ] 8. ai-battle-narrative
- [ ] 9. last-stand-event
- [ ] 10. convoy-intercept-predictor
- [ ] 11. mutator-variety
- [ ] 12. mutator-vote
- [ ] 13. elo-placement-progression
- [ ] 14. replay-highlight-sharing
- [ ] 15. smart-spectator-camera
- [ ] 16. api-auth-security
- [ ] 17. bot-vaultfront-awareness
- [ ] 18. convoy-ghost-route
- [ ] 19. context-token-ledger
