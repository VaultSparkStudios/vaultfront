# Implement Plan — 2026-07-16 S73

Source audit: `docs/AUDIT_2026-07-16.json` (12 items · combined priority 366.9)

## Execution contract

- Default rung: L2; climb to L3 when the primary list is exhausted and the context meter remains `CONTINUE`.
- Foundations before façades; same-file work stays in one lane to prevent parallel merge damage.
- A result is shipped only after its behavioral test and the relevant broad gate pass.
- Automated/agent evidence remains labeled as such and cannot clear a human-playtest gate.
- No staging, production, Obelisk relying-party, revenue, or founder-approval claim is inferred.

## Wave plan

| Wave | Lane                              | Audit items                                                                                                             | Rung  | Dependency                                                                                                    |
| ---: | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | :---: | ------------------------------------------------------------------------------------------------------------- |
|   1A | Server trust seams                | `authenticated-alpha-evidence-ledger`, `signed-replay-consumption`, `real-rematch-corridor`, `readiness-truth-contract` |  L2   | Shared `Worker.ts`/server contracts; establish trustworthy evidence first                                     |
|   1B | CI + protocol + public foundation | `ci-truth-and-coverage-ratchet`, `protocol-provenance-and-canon-repair`, `public-surface-foundation`                    |  L2   | Parallel-safe workflow/script/static surfaces                                                                 |
|   1C | Game depth                        | `vault-pressure-breach-window`, `deterministic-tactical-coach`, `server-authoritative-progression-spine`                |  L2   | Core/game/client lane; must not claim balance without tests                                                   |
|    2 | Cost/profile truth                | `public-profile-cost-firewall`                                                                                          |  L2   | Integrate after server policy seams settle; ship registry correction via Ark only                             |
|    3 | Dependency train                  | `dependency-security-train`                                                                                             | L2→L3 | Package-trust each exact target; update in compatibility groups                                               |
|    4 | Integration                       | all shipped items                                                                                                       |   —   | Typecheck, focused tests, full unit/server, coverage, build, E2E, lint, Prettier, audit, supply-chain, doctor |
|    5 | Saturation                        | innovation pack + compound refinement                                                                                   | L2→L3 | Run only after all 12 are shipped or honestly blocked                                                         |

## Verification matrix

- Server trust: focused replay, playtest pulse, readiness, rematch, and route tests; tamper/failure paths required.
- Game depth: deterministic lifecycle tests, UI contract tests, progression idempotency, and no new paid-call requirement.
- CI: `npm run test:coverage`, E2E with blank and absent base URL semantics, workflow syntax inspection, formatting check.
- Public foundation: sitemap/web-hardening/footer-completeness checks; upstream attribution preserved.
- Dependencies: package-trust verdicts, `npm audit --audit-level=high`, Studio supply-chain scan, lockfile diff review.
- Broad: `npm run lint`, `npm test`, `npm run build-prod`, `npm run e2e`, staged secret scan, Studio doctor `blockingFailing: 0`.

## Explicit residual gates

- Human rivalry/rematch playtest evidence remains open until humans actually play.
- Staging parity, theme screenshots, Cloud Web Vitals, native Obelisk login, real revenue, and founder launch approval remain red until separately evidenced.
- Production deployment is outside this implementation pass.

## Completion ledger

- Waves 1A–3: all 12 audit items shipped with behavioral coverage.
- Wave 4: 697 unit/integration tests, 22/22 CI-profile browser tests, production build, lint, coverage/format/bundle ratchets, zero-vulnerability npm audit, and clean Studio supply-chain scan.
- Wave 5: all three innovation-pack candidates implemented and evidence-detected.
- Release posture remains honestly `public-unlaunched`; the live-only gates listed above were not inferred from local evidence.
