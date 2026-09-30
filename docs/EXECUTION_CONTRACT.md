# Studio execution contract

<!-- generated: scripts/render-execution-contract.mjs; contract v1 -->

Complete the selected outcomes and their acceptance checks. Stop when they are verified. Explore and Maintain require an explicitly requested boundary. Budgets are ceilings. Unused tokens, an empty queue, or historical velocity never authorize additional work or greater depth. Partial, blocked, deferred, stale, or unmeasured evidence is not verified completion. Keep remaining authorized work visible. Preserve the user's scope and existing authorization. Apply the gates required by the action. Explicit /start and /closeout keep their canonical protocols.

## Modes

- **Deliver:** Complete the selected outcomes and their acceptance checks. Stop when they are verified.
- **Explore:** Investigate the requested question within the stated research boundary. Deliver findings and options; implementation needs authorization.
- **Maintain:** Run the explicitly selected maintenance jobs or cadence. Verify their outcomes and stop at the stated boundary.

## Action gates

Only gates triggered by the requested action apply. A gate authorizes no additional work. Read its reference when the trigger applies.

| Gate | Owner | Trigger | Required action | Reference |
|---|---|---|---|---|
| start | studio-start | start | Acquire the session lock, reconcile Canon/Ark, use the compact brief, and run required startup checks including Windows Git guard and frontier freshness. | [source](../docs/SESSION_PROTOCOL.md) |
| premises | check-audit-premises | implement-audit | Verify selected audit premises before implementation; disprove or repair false premises. | [source](../scripts/check-audit-premises.mjs) |
| secret | secrets-gateway | credentials | Resolve through getSecret/resolveCapability and redact; never print secrets or read .env directly in subprocesses. | [source](../docs/SECRETS_PROTOCOL.md) |
| trust | package-trust | install, download | Verify package/archive/binary/model trust before download/install. BLOCK stops that artifact. | [source](../docs/OBELISK_PACKAGE_TRUST_PROTOCOL.md) |
| approval | founder-twin | network-write, privileged, destructive, payment, credentials | Verify intent, target, trust, credential path, blast radius/rollback and Twin verdict; deny stops. Reuse existing founder authorization for the same bounded action. | [source](../docs/TWIN_PROTOCOL.md) |
| sensitive-policy | founder | canon-change, public-promise, rights, license, launch-date, security-policy, data-policy | Escalate changes to these commitments or policies; preserve approved scope and decision records. | [source](../docs/STUDIO_CANON.md) |
| cross-repo | ark-recipient | cross-repo | Never write sibling files directly. Use signed Ark cargo, recipient locks and owner acceptance; delivery is not verified adoption. | [source](../docs/STUDIO_ARK.md) |
| cost | founder | paid-api, paid-service | Use existing resources first. New paid use requires the applicable explicit approval and cost estimate; model choice also requires runtime entitlement and current evidence. | [source](../docs/STUDIO_CANON.md) |
| visual | implementer | ui-change | CANON-053: inspect before/after rendered pixels on desktop and mobile, every theme and touched state; fix defects and bind the visual receipt to source hashes. | [source](../docs/STUDIO_CANON.md) |
| release | app-release-gate | deploy, launch, identity-change | Verify applicable staging, Obelisk journeys, legal/contact/branding/security/agent surfaces, rollback and founder launch approval before production or SPARKED. | [source](../docs/STUDIO_CANON.md) |
| public-sanitization | publisher | public-push, publish | Exclude secrets, CDR/private strategy/lore, local paths and restricted artifacts before public publication. | [source](../docs/SANITIZATION_PROTOCOL.md) |
| blocked | implementer | label-blocked | Run secrets/capability discovery and elevated blocker-preflight; attach evidence before a human-blocked label. | [source](../docs/AGENT_CAPABILITIES.md) |
| git | project-agent | commit, push | Follow the current project git workflow. Scan changes for secrets; preserve unrelated work. Force-push, destructive history operations and protected releases remain gated. | [source](../AGENTS.md) |
| closeout | studio-closeout | closeout | Run canonical ordered write-back, append-only DECISIONS/SIL/CDR rules, status sum invariant, truth reconciliation, scaffold and shell cleanup, and applicable push gates. | [source](../docs/SESSION_PROTOCOL.md) |

## Runtime adapters

Claude Code and Codex receive the same generated block in the versioned Studio skills. The local project selects its command aliases and git workflow. `session-floor.mjs --scope <JSON>` filters selected outcome IDs before its existing outcome court. Legacy invocation without --scope keeps the explicitly selected audit as its boundary. A scope document names mode, outcome, selectedIds, acceptance, actions, authorization and boundary.

Regenerate with `node scripts/render-execution-contract.mjs --write`; check freshness and conflicting expansion directives with the command without --write.
