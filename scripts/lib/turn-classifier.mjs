// turn-classifier.mjs
// Audit item #6 (S114). Per-turn model classification atop the per-repo
// T1/T2/T3 routing. Lets the router escalate (Haiku → Sonnet → Opus) per turn
// when the turn's signal demands it, rather than running every turn at the
// repo's nominal tier.
//
// Pure function — no I/O. Imported by scripts/lib/model-router.mjs in callClaude().

const ESCALATE_KEYWORDS = [
  // creative-direction signals — opus
  "canon",
  "decision",
  "soul.md",
  "creative direction",
  "security",
  "rights",
  "license",
  "irreversible",
  // architecture signals — opus
  "architecture",
  "schema migration",
  "protocol design",
  // execution-only signals — haiku
  "summarize",
  "rephrase",
  "render",
  "classify",
  "extract",
  "tag",
  "normalize",
  "format",
  "pretty-print",
];

const OPUS_PATTERNS = [
  /canon|decision|soul\.md|creative direction/i,
  /security|rights|license|irreversible|destructive/i,
  /architecture|schema migration|protocol design/i,
];

const HAIKU_PATTERNS = [
  /^(summarize|rephrase|render|classify|extract|tag|normalize|format)\b/i,
  /pretty-?print|wrap.*at.*\d+ cols?/i,
  /one-line|three-?sentence|≤\s*\d+ tokens?/i,
];

export function classifyTurn({
  prompt = "",
  repoTier = "T2_opusplan",
  intent = "execution",
} = {}) {
  const text = String(prompt).slice(0, 4000);
  const len = text.length;

  // Force opus for any signal touching canon/security/architecture
  for (const re of OPUS_PATTERNS) {
    if (re.test(text))
      return {
        model: "opus",
        reason: "canon/security/architecture signal",
        tier: "T3_opus",
      };
  }

  // Force haiku for pure formatting/extraction
  for (const re of HAIKU_PATTERNS) {
    if (re.test(text))
      return {
        model: "haiku",
        reason: "pure transform — haiku sufficient",
        tier: "T1_sonnet→haiku",
      };
  }

  // Short, single-action prompts → haiku
  if (len < 300 && !/decide|design|plan|architect/i.test(text)) {
    return { model: "haiku", reason: "short transactional turn", tier: "T1" };
  }

  // Long planning prompts → opus
  if (len > 2000 && /plan|design|propose|recommend/i.test(text)) {
    return { model: "opus", reason: "long planning turn", tier: "T3_opus" };
  }

  // Default: respect repo tier
  const tierMap = {
    T3_opus: "opus",
    T2_opusplan: "sonnet",
    T1_sonnet: "sonnet",
    T1_haiku: "haiku",
  };
  return {
    model: tierMap[repoTier] || "sonnet",
    reason: "repo-tier default",
    tier: repoTier,
  };
}

// CLI for ad-hoc inspection
if (process.argv[1]?.endsWith("turn-classifier.mjs")) {
  const prompt = process.argv.slice(2).join(" ");
  if (!prompt) {
    console.log('usage: node scripts/lib/turn-classifier.mjs "<prompt text>"');
    process.exit(0);
  }
  console.log(JSON.stringify(classifyTurn({ prompt }), null, 2));
}
