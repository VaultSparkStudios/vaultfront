/**
 * shared-policies.mjs — extraction target for lint-policy-drift twin pairs
 * (S157 #3). Append-only: one named export per extracted pair. Each entry
 * cites the pair it collapsed so the provenance is greppable.
 */
// extracted from scripts/run-doctor.mjs:124 <-> scripts/validate-studio-manifest.mjs:24 (similarity 1)
export const STUDIO_MANIFEST_REQUIRED_KEYS = [
  "identity",
  "studioOs",
  "listingMetadata",
  "surfaces",
  "capabilities",
  "integrations",
  "hosting",
  "capacity",
  "publicMetadata",
  "automation",
  "contracts",
];

// extracted S159 from scripts/check-model-router-adherence.mjs:39 <-> scripts/protocol-doctor.mjs:137 (similarity 1).
// Canonical directory-walk ignore set. Callers needing extra entries spread it:
//   new Set([...WALK_IGNORE_DIRS, '.wrangler']). Do NOT re-declare a literal —
// a scanner that silently omits one of these dirs is the S153 divergent-
// observability class (one scanner sees a tree another is blind to).
export const WALK_IGNORE_DIRS = [
  ".git",
  "node_modules",
  ".cache",
  "dist",
  "build",
];

// extracted S159 from scripts/render-protocol-biography.mjs:135 <-> scripts/run-studio-review.mjs:179 (similarity 1).
// Sparkline ramp, low→high. Index a normalized 0..7 value into this.
export const SPARK_RAMP = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

// extracted S159 from scripts/skill-doctor.mjs:238 <-> scripts/sync-agent-skills.mjs:158 (similarity 1).
// Skill frontmatter keys whose values must be scalar (not block/flow mappings).
export const SKILL_FRONTMATTER_SCALAR_KEYS = [
  "name",
  "description",
  "when_to_use",
  "argument-hint",
  "allowed-tools",
];

// extracted S159 from scripts/plan-next-session.mjs:118 <-> scripts/render-startup-brief.mjs:434 (similarity 1).
// Core blocked-status labels used to partition unified-list items into the
// "blocked" bucket in brief/plan renderers. (generate-genius-list carries a
// deliberately broader superset incl. staged/blocked-on-deploy — kept forked.)
export const BLOCKED_STATUSES_CORE = [
  "human-blocked",
  "cross-repo-locked",
  "externally-blocked",
  "blocked-on-hub",
];

// extracted S159 from scripts/lib/skill-brief.mjs:83 <-> scripts/render-closeout-brief.mjs:101 (similarity 1).
// Required per-item fields every skill-brief item must carry (validated by both
// the library validator and the independent closeout-brief validator).
export const BRIEF_REQUIRED_ITEM_FIELDS = [
  "id",
  "slug",
  "title",
  "axis",
  "leftScore",
  "rightScore",
  "insight",
  "evidence",
];

// extracted S168 from scripts/lib/skill-brief.mjs:78 <-> scripts/render-closeout-brief.mjs:99 (similarity 0.86).
// Required TOP-LEVEL brief fields (the per-item list above is separate). The
// skill-brief library additionally requires 'kind'; the closeout renderer sets
// 'kind' itself, so it validates only this shared six. Consumers needing 'kind'
// spread it in front: ['kind', ...BRIEF_REQUIRED_TOP_FIELDS]. Two validators
// drifting on which fields a brief must carry is the S153 divergent class.
export const BRIEF_REQUIRED_TOP_FIELDS = [
  "session",
  "date",
  "agent",
  "repo",
  "headline",
  "items",
];

// extracted S168 from scripts/sync-to-vorn.mjs:28 <-> scripts/validate-agent-dna.mjs:31 (similarity 0.86).
// Leak-detection keywords: an agent-DNA public payload (bio, etc.) containing any
// of these carries studio-internal strategy and MUST be redacted before it is
// published to Vorn. validate-agent-dna had DRIFTED (missing 'proprietary'),
// meaning it would pass a payload sync-to-vorn would catch — the exact S153
// divergent-observability bug. The superset is canonical; both import it now.
export const AGENT_DNA_STRATEGY_KEYWORDS = [
  "guardrail",
  "trust_tier",
  "scope_statement",
  "budget_ceiling",
  "studio-internal",
  "confidential",
  "proprietary",
];
