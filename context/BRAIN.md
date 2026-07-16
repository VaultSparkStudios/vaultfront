# Brain

Public-safe architecture notes only. Detailed implementation and operator reasoning are maintained privately.

## Durable VaultFront invariants

- Launch evidence is source-labeled: test/agent traffic proves paths but never substitutes for distinct human Alpha Gate sessions.
- Replays are signature-verified by every consumer and fail closed outside development/test.
- Match progression is server-authoritative and idempotent; clients render outcomes but do not mint them.
- Remote AI is optional, default-off, feature-attributed, and bounded by an explicit positive hourly cap; deterministic local behavior remains the baseline.
- Registry changes travel through signed Studio Ark cargo; local public-unlaunched truth remains authoritative until the control plane accepts a correction.
- Release readiness distinguishes declared configuration from verified external evidence.
