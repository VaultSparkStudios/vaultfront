// sil-categories.mjs — canonical SIL v3.0 category list (CANON-009, 10×100=1000).
//
// S156 #21: lint-policy-drift found this array independently defined in FIVE
// files (check-sil-category-ranges · write-project-status · reconcile-sil-math
// · resync-sil-score · sil-ingest-guard) — the exact divergent-policy class
// S153 debugged three times. One definition, everyone imports.
//
// Changing the rubric is a CANON change (DECISIONS.md) — never edit this list
// for a local convenience.

export const V3_CATS = [
  "devHealth",
  "creativeAlignment",
  "momentum",
  "engagement",
  "processQuality",
  "crossRepoCoherence",
  "securityPosture",
  "ecosystemIntegration",
  "capitalEfficiency",
  "automationCoverage",
];

export const V3_MAX_PER_CATEGORY = 100;
export const V3_MAX_TOTAL = 1000;
