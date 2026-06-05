// Pure per-turn model classifier used by scripts/lib/model-router.mjs.
// Keep this module dependency-free so startup and compact-handoff can import it
// before any capability or secrets setup has run.

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

  for (const re of OPUS_PATTERNS) {
    if (re.test(text)) {
      return {
        model: "opus",
        reason: "canon/security/architecture signal",
        tier: "T3_opus",
      };
    }
  }

  for (const re of HAIKU_PATTERNS) {
    if (re.test(text)) {
      return {
        model: "haiku",
        reason: "pure transform - haiku sufficient",
        tier: "T1_sonnet->haiku",
      };
    }
  }

  if (len < 300 && !/decide|design|plan|architect/i.test(text)) {
    return { model: "haiku", reason: "short transactional turn", tier: "T1" };
  }

  if (len > 2000 && /plan|design|propose|recommend/i.test(text)) {
    return { model: "opus", reason: "long planning turn", tier: "T3_opus" };
  }

  const tierMap = {
    T3_opus: "opus",
    T2_opusplan: "sonnet",
    T1_sonnet: "sonnet",
    T1_haiku: "haiku",
  };
  return {
    model: tierMap[repoTier] || "sonnet",
    reason: `${intent || "execution"} repo-tier default`,
    tier: repoTier,
  };
}

if (process.argv[1]?.endsWith("turn-classifier.mjs")) {
  const prompt = process.argv.slice(2).join(" ");
  if (!prompt) {
    console.log('usage: node scripts/lib/turn-classifier.mjs "<prompt text>"');
    process.exit(0);
  }
  console.log(JSON.stringify(classifyTurn({ prompt }), null, 2));
}
