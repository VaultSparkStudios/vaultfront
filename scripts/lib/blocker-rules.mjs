/**
 * blocker-rules.mjs — classify blockers and surface attempt-order guidance.
 *
 * Exports:
 *   classifyBlocker(text) → BlockerInfo
 *   summarizeAttemptOrder(text) → string
 */

/** @typedef {{ category: string, attemptable: boolean, elevatedProbe: string, probeCommands: string[], capabilities: string[], signupUiOnly: boolean }} BlockerInfo */

const RULES = [
  {
    pattern: /api[_ -]?key|secret|credential|token|password/i,
    category: "missing-credential",
    attemptable: true,
    elevatedProbe: "check-secrets.mjs --audit",
    capabilities: ["ANTHROPIC_API_KEY"],
    signupUiOnly: false,
  },
  {
    pattern: /dashboard|signup|register|billing|stripe|payment/i,
    category: "dashboard-signup",
    attemptable: false,
    elevatedProbe: "none",
    capabilities: [],
    signupUiOnly: true,
  },
  {
    pattern: /deploy|production|prod|release|push/i,
    category: "deployment-gate",
    attemptable: true,
    elevatedProbe: "node scripts/probe-capability.mjs --cap deploy",
    capabilities: [],
    signupUiOnly: false,
  },
  {
    pattern: /cross[- ]repo|another repo|different repo/i,
    category: "cross-repo",
    attemptable: false,
    elevatedProbe: "none",
    capabilities: [],
    signupUiOnly: false,
  },
];

/**
 * Classify a blocker description into a structured info object.
 * @param {string} text
 * @returns {BlockerInfo}
 */
export function classifyBlocker(text) {
  const t = text || "";
  for (const rule of RULES) {
    if (rule.pattern.test(t)) {
      return {
        category: rule.category,
        attemptable: rule.attemptable,
        elevatedProbe: rule.elevatedProbe,
        probeCommands:
          rule.elevatedProbe !== "none" ? [rule.elevatedProbe] : [],
        capabilities: rule.capabilities,
        signupUiOnly: rule.signupUiOnly,
      };
    }
  }
  return {
    category: "unknown",
    attemptable: false,
    elevatedProbe: "none",
    probeCommands: [],
    capabilities: [],
    signupUiOnly: false,
  };
}

/**
 * Return a short human-readable attempt-order summary for a blocker description.
 * @param {string} text
 * @returns {string}
 */
export function summarizeAttemptOrder(text) {
  const info = classifyBlocker(text);
  if (info.signupUiOnly) {
    return ["true human-only (dashboard signup required)"];
  }
  if (!info.attemptable) {
    return ["true human-only — no agent path"];
  }
  return [
    "run secrets discovery",
    info.elevatedProbe !== "none"
      ? `run elevated/admin probe: ${info.elevatedProbe}`
      : "run elevated/admin probe if a safe scripted path exists",
    "escalate only if both checks prove no agent path",
  ];
}

export { RULES };
