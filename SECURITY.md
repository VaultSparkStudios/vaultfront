# Security Policy

> Canonical VaultSpark Studios security policy (CANON-043). Replace `VaultFront`
> with the project name when adopting. Keep the reporting address as the studio
> address (CANON-028 — no personal identities).

## Reporting a vulnerability

If you discover a security vulnerability in **VaultFront**, please report it
privately. **Do not open a public issue for security problems.**

- **Email:** founder@vaultsparkstudios.com (subject: `SECURITY — VaultFront`)
- **GitHub private vulnerability reporting:** if enabled on this repository
  (Security → "Report a vulnerability"), prefer that channel.

Please include: what you found, steps to reproduce, affected version/commit, and
any suggested remediation. We aim to acknowledge reports within **5 business days**
and to keep you updated as we triage and fix.

## Scope

- In scope: this repository's code, configuration, and deployed surfaces.
- Out of scope: third-party dependencies (report those upstream; our Dependabot
  alerts track known CVEs), social-engineering, and physical attacks.

## Our practices

- **Secrets** never live in the repo — all credentials resolve through the
  VaultSpark secrets gateway (CANON-012); `secrets/` is blanket-gitignored.
- **Dependency CVEs** are tracked via GitHub Dependabot alerts + automatic
  security-update PRs (CANON-043).
- **Supply chain** installs are gated by Obelisk package trust (CANON-023).
- **Pre-push** secret scanning + sanitization run before code leaves a machine.

## Disclosure

We follow coordinated disclosure: we'll work with you on a fix and a reasonable
disclosure timeline, and credit you if you wish.

---
*VaultSpark Studios LLC — security@ inquiries via founder@vaultsparkstudios.com*
