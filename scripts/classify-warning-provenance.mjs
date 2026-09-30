#!/usr/bin/env node
/**
 * classify-warning-provenance.mjs — S168 #2. The meta-honesty turn.
 *
 * The observability-honesty arc (S144 "no lying surfaces" → S167 "turn the lens
 * on the doctor itself") had one unexamined assumption: that a doctor warning
 * means STUDIO-OPS has debt. Often it doesn't — brand/deploy/free-tier/registry-
 * drift/obelisk are portfolio-adoption signals 35 sibling sessions own. Showing
 * them as undifferentiated yellow on the control-plane board is a CANON-031
 * honesty defect at the meta level: it conflates "I have unfinished work" with
 * "I am the dashboard for work other repos owe."
 *
 * This module tags every non-green probe by owner ∈ {self, sibling, chronic} via
 * portfolio/WARNING_PROVENANCE.json, so the board can say
 *   "N warnings · S self · X sibling · C chronic"
 * instead of one anxious yellow.
 *
 * HONESTY GUARDS (the teeth — non-redundant with check-probe-honesty, which
 * checks the REMEDY map; this checks the PROVENANCE map):
 *   1. An UNMAPPED non-green probe defaults to `self` (fail-honest — never assume
 *      someone else's problem).
 *   2. You may NOT map an auto-healable probe (in doctor-remedies HEAL_MAP) to
 *      sibling/chronic — that is hiding self-fixable debt behind another name.
 *   3. A `chronic` entry past its reviewBy re-surfaces as a live concern.
 * Violations of 2/3 make the doctor meta-probe fail. sibling/chronic that are
 * correctly mapped only INFORM — they never red the board.
 *
 * Static + non-recursive: the doctor wires validateProvenanceMap() (no live
 * doctor run). The CLI breakdown reads a doctor json via --from / newest cache.
 *
 * Usage:
 *   node scripts/classify-warning-provenance.mjs --json [--from <doctor.json>]
 *   node scripts/classify-warning-provenance.mjs            # human report
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isNonGreen } from "./lib/doctor-predicates.mjs";
import { HEAL_MAP, isSelfRemediable } from "./lib/doctor-remedies.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadProvenanceMap(repoRoot = ROOT) {
  try {
    const j = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "portfolio", "WARNING_PROVENANCE.json"),
        "utf8",
      ),
    );
    return j.probes || {};
  } catch {
    return {};
  }
}

const VALID_OWNERS = new Set(["self", "sibling", "chronic"]);

// Validate the provenance MAP itself (static — no live doctor run). Returns
// { ok, violations: [{probe, kind, detail}] }. `today` injectable for tests.
export function validateProvenanceMap(
  map = loadProvenanceMap(),
  { healMap = HEAL_MAP, today = null } = {},
) {
  const violations = [];
  const now = today ? new Date(today) : new Date();
  for (const [probe, entry] of Object.entries(map)) {
    const owner = entry?.owner;
    if (!VALID_OWNERS.has(owner)) {
      violations.push({
        probe,
        kind: "bad-owner",
        detail: `owner must be self|sibling|chronic (got ${owner})`,
      });
      continue;
    }
    if (owner !== "self" && !entry.reason) {
      violations.push({
        probe,
        kind: "missing-reason",
        detail: `${owner} mapping needs a reason`,
      });
    }
    // Guard 2: cannot offload a SELF-REMEDIABLE probe to someone else.
    // S171 [audit #3] — the test is "can studio-ops actually fix it?", NOT mere
    // HEAL_MAP membership. A 'refresh'-kind heal (e.g. ark-inbox-depth's harbor
    // re-report, agents-md-drift's drift re-report) only recomputes a
    // measurement; it does not make the probe self-fixable. The old `probe in
    // healMap` test conflated the two and wrongly BLOCKED a legitimately
    // sibling-owned probe (ark-inbox-depth: studio-ops cannot drain a sibling's
    // port). isSelfRemediable() is the shared source of truth (doctor-remedies)
    // so this guard and the heal layer can never diverge (S153 anti-pattern).
    if (
      (owner === "sibling" || owner === "chronic") &&
      isSelfRemediable(probe, { healMap })
    ) {
      violations.push({
        probe,
        kind: "hidden-self-debt",
        detail: `probe is self-remediable (studio-ops has a real fix path) — cannot be ${owner}-owned; it is studio-ops self-debt`,
      });
    }
    // Guard 3: chronic decay.
    if (owner === "chronic") {
      if (!entry.reviewBy) {
        violations.push({
          probe,
          kind: "chronic-undated",
          detail: "chronic mapping needs a reviewBy date",
        });
      } else if (new Date(entry.reviewBy) < now) {
        violations.push({
          probe,
          kind: "chronic-expired",
          detail: `chronic reviewBy ${entry.reviewBy} has passed — re-examine`,
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// S172 [audit #1] — the INVERSE of deriveDriftClass (doctor-remedies). The S171
// coherence machinery maps a provenance owner → driftClass; at the GROWTH POINT
// (a probe that just went non-green and is not yet classified) we have the
// observed driftClass and want to PROPOSE the owner. This is what makes the
// taxonomy coherent-by-construction the moment a new warning appears, instead of
// drifting for sessions and forcing a retroactive reconciliation (the S171 tax).
//   portfolio-outdated → sibling   ·   expected-external → chronic
//   local-broken / derived-stale / unknown → self  (fail-honest default)
// A SUGGESTION only — it never auto-writes the map (writing sibling without human
// confirmation would launder self-debt, the exact failure the arc forbids).
export function suggestOwnerFromDriftClass(driftClass) {
  if (driftClass === "portfolio-outdated") return "sibling";
  if (driftClass === "expected-external") return "chronic";
  return "self";
}

// S174 [audit #3] — load sibling slugs (every registered repo EXCEPT studio-ops
// itself), longest-first so a multi-word slug matches before a substring of it.
const OWN_SLUG = "vaultspark-studio-ops";
export function loadSiblingSlugs(repoRoot = ROOT) {
  try {
    const reg = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "portfolio", "PROJECT_REGISTRY.json"),
        "utf8",
      ),
    );
    const arr = Array.isArray(reg) ? reg : reg.projects || reg.repos || [];
    return arr
      .map((p) => p.slug)
      .filter((s) => s && s !== OWN_SLUG)
      .sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
}

// S174 [audit #3] — EVIDENCE-based owner suggestion. suggestOwnerFromDriftClass
// guesses from an abstract drift-KIND; but many probes' detail strings literally
// NAME the foreign entity ("awaiting owner: vorn, hashmark" · "vaultsparkstudios-
// website/depth"). A named sibling slug is direct evidence the owner is a sibling
// — far stronger than a class heuristic, and it generalizes: the NEXT foreign-
// routing probe self-suggests sibling WITH the slugs, no per-probe DRIFT_META
// entry required. Returns { owner:'sibling', evidence:[slugs] } when the detail
// names sibling slug(s); null when there is no slug evidence (caller falls back
// to the driftClass heuristic). Honesty: a probe whose detail names ONLY
// studio-ops's own slug yields no sibling evidence (stays self).
export function suggestOwnerFromEvidence(
  check,
  siblingSlugs = loadSiblingSlugs(),
) {
  const detail = String(check?.detail || check?.message || "");
  if (!detail) return null;
  const hits = [];
  for (const slug of siblingSlugs) {
    // Word-ish boundary so 'voidfall' does not spuriously match 'voidfall-companion'
    // owners (longest-first ordering already prefers the more specific slug).
    if (new RegExp(`(^|[^a-z0-9-])${slug}([^a-z0-9-]|$)`, "i").test(detail)) {
      hits.push(slug);
    }
  }
  return hits.length ? { owner: "sibling", evidence: hits } : null;
}

// S174 [audit #3] — the resolved suggestion: evidence (named sibling slug) wins
// over the driftClass heuristic. Returns { owner, source, evidence? }.
export function resolveSuggestedOwner(
  check,
  siblingSlugs = loadSiblingSlugs(),
) {
  const ev = suggestOwnerFromEvidence(check, siblingSlugs);
  if (ev) return { owner: ev.owner, source: "evidence", evidence: ev.evidence };
  return {
    owner: suggestOwnerFromDriftClass(check?.driftClass),
    source: "driftClass",
  };
}

// Self-reference exemption (the honesty rule observability surfaces must follow:
// a surface never measures itself). The unmapped-warnings gate is itself a doctor
// probe; if it ever warns (because probe X is unmapped) it becomes a non-green
// probe, and on the next run it would flag ITSELF as "unmapped" — an infinite
// self-referential inflation (the S170 self-phantom class). It can never be
// meaningfully "classified in WARNING_PROVENANCE" — it IS the classifier. Exempt.
// S175 — `tests` / `test-suite-freshness` are exempt too. They are NEVER an
// ownership-classification question: a red test is FIXED, not labeled
// self/sibling/chronic, and the failure is already surfaced directly by the
// `tests` doctor probe. Including them caused a bootstrap DEADLOCK — a transient
// mid-session test failure poisons the persisted `tests` check, and the gate then
// flags it as "unmapped" forever (it can't be classified, and the suite can't go
// green until the gate passes). Exempting them breaks the cycle without masking
// anything (the tests probe still reds on a real failure).
export const UNMAPPED_GATE_SELF_EXEMPT = new Set([
  "unmapped-warnings",
  "tests",
  "test-suite-freshness",
]);

// S172 [audit #1] — the gentle closeout gate. Given the live doctor checks (each
// carrying its driftClass) and the provenance map, return every non-green probe
// whose id is NOT mapped — i.e. silently riding the fail-honest self default.
// Each carries a driftClass-derived owner suggestion so classifying it is a
// one-line confirm. Empty array ⇒ every live warning is consciously owned.
export function detectUnmappedWarnings(checks = [], map = loadProvenanceMap()) {
  const siblingSlugs = loadSiblingSlugs();
  return checks
    .filter(isNonGreen)
    .filter((c) => !UNMAPPED_GATE_SELF_EXEMPT.has(c.id))
    .filter((c) => !(c.id in map))
    .map((c) => {
      // S174 [audit #3] — evidence (a named sibling slug in the probe's detail)
      // wins over the driftClass heuristic; the evidence is surfaced so the
      // human confirms a FACT, not a guess.
      const s = resolveSuggestedOwner(c, siblingSlugs);
      return {
        id: c.id,
        driftClass: c.driftClass || null,
        suggestedOwner: s.owner,
        suggestionSource: s.source,
        ...(s.evidence ? { evidence: s.evidence } : {}),
      };
    });
}

// Classify a live set of doctor checks. Returns the ownership breakdown over the
// non-green set. Unmapped → self (fail-honest).
export function classifyWarnings(checks = [], map = loadProvenanceMap()) {
  const nonGreen = checks.filter(isNonGreen);
  const byOwner = { self: [], sibling: [], chronic: [] };
  for (const c of nonGreen) {
    const owner = map[c.id]?.owner || "self";
    (byOwner[owner] || byOwner.self).push(c.id);
  }
  return {
    total: nonGreen.length,
    self: byOwner.self.length,
    sibling: byOwner.sibling.length,
    chronic: byOwner.chronic.length,
    breakdown: byOwner,
    line: `${nonGreen.length} warnings · ${byOwner.self.length} self · ${byOwner.sibling.length} sibling · ${byOwner.chronic.length} chronic`,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const fromIdx = argv.indexOf("--from");
  const fromPath = fromIdx >= 0 ? argv[fromIdx + 1] : null;

  const map = loadProvenanceMap();
  const mapHealth = validateProvenanceMap(map);

  // Live breakdown is best-effort: explicit --from, else newest cached doctor json.
  let checks = null;
  let source = "none";
  try {
    let doctorJsonPath = fromPath;
    if (!doctorJsonPath) {
      const cacheDir = path.join(ROOT, ".cache");
      // Prefer the canonical per-run snapshot; fall back to newest doctor*.json.
      const canonical = path.join(cacheDir, "doctor-last.json");
      if (fs.existsSync(canonical)) doctorJsonPath = canonical;
      else {
        const cands = fs
          .readdirSync(cacheDir)
          .filter((f) => /^doctor.*\.json$/.test(f))
          .map((f) => ({ f, m: fs.statSync(path.join(cacheDir, f)).mtimeMs }))
          .sort((a, b) => b.m - a.m);
        if (cands.length) doctorJsonPath = path.join(cacheDir, cands[0].f);
      }
    }
    if (doctorJsonPath && fs.existsSync(doctorJsonPath)) {
      const dj = JSON.parse(fs.readFileSync(doctorJsonPath, "utf8"));
      checks = dj.checks || null;
      source = path.relative(ROOT, doctorJsonPath).replace(/\\/g, "/");
    }
  } catch {
    /* breakdown stays advisory */
  }

  const breakdown = checks ? classifyWarnings(checks, map) : null;

  if (asJson) {
    console.log(JSON.stringify({ mapHealth, breakdown, source }, null, 2));
  } else {
    console.log("Warning-provenance classifier · S168 #2");
    console.log("─".repeat(64));
    if (breakdown) console.log(`  ${breakdown.line}   (from ${source})`);
    else console.log("  no doctor result cached — map-validation only");
    console.log(`  mapped: ${Object.keys(map).length} probes`);
    if (!mapHealth.ok) {
      for (const v of mapHealth.violations)
        console.log(`  ⛔ ${v.probe}: ${v.kind} — ${v.detail}`);
    } else {
      console.log(
        "  ✓ provenance map healthy (no hidden self-debt, no chronic decay)",
      );
    }
  }
  process.exit(mapHealth.ok ? 0 : 1);
}
