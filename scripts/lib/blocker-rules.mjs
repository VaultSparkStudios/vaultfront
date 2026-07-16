/**
 * blocker-rules.mjs
 *
 * Shared heuristics for Studio Ops blocker handling.
 * Centralizes:
 * - capability inference for secrets discovery
 * - elevated-access / admin probe guidance
 * - triage of "agent-attemptable" vs true human-only work
 *
 * The goal is to make every blocker surface tell the same story.
 */

const RULES = [
  {
    id: "cloudflare-workers-routes",
    test: /workers routes|auth worker route|zone:workers routes:edit/i,
    capability: "cloudflare.workers.routes",
    category: "Cloudflare",
    elevatedProbe:
      "Verify CF deploy capability, then attempt the route/deploy action with elevated access if sandbox or network restrictions block it.",
    probeCommands: [
      "node scripts/ops.mjs check-secrets --for cloudflare.workers.routes",
      "node scripts/ops.mjs check-secrets --for cloudflare.deploy",
    ],
    humanAction:
      "Studio Owner may still need to expand the Cloudflare token scope to include Zone:Workers Routes:Edit if the elevated attempt confirms the permission gap.",
    attemptable: true,
  },
  {
    id: "cloudflare-r2",
    test: /\br2\b|backup/i,
    capability: "cloudflare.r2",
    category: "Cloudflare",
    elevatedProbe:
      "Check R2 credentials first, then attempt the backup/bootstrap command with elevated access if the sandbox blocks external access.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for cloudflare.r2"],
    humanAction:
      "Studio Owner must create the R2 bucket + generate access key in Cloudflare dashboard — API token alone cannot bootstrap a new bucket.",
    attemptable: true,
    signupUiOnly: true,
  },
  {
    id: "cloudflare-dns",
    test: /\bdns\b|cname|wildcard|staging/i,
    // DNS edits require `Zone:DNS:Edit` scope, which is NOT granted by the
    // standard cloudflare.deploy (Workers-scoped) token. S107 probe confirmed
    // the existing CLOUDFLARE_API_TOKEN returns 10000 Authentication error
    // on POST /zones/{id}/dns_records. Requires a separate scoped token.
    capability: "cloudflare.dns",
    category: "DNS",
    elevatedProbe:
      "Verify a Cloudflare token with Zone:DNS:Edit scope is present. The default cloudflare.deploy token is Workers-only and cannot edit DNS.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for cloudflare.dns"],
    humanAction:
      "Founder must create a Cloudflare API token with `Zone:DNS:Edit` permission for zone vaultsparkstudios.com. Drop into secrets/cloudflare.env as CLOUDFLARE_DNS_TOKEN.",
    signupUiOnly: true,
    attemptable: false,
  },
  {
    id: "resend-email",
    test: /resend|smtp/i,
    capability: "resend.email",
    category: "Email",
    elevatedProbe:
      "If the API key is present, configure SMTP/integration directly. Initial signup at resend.com is UI-only.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for resend.email"],
    humanAction:
      "Studio Owner must sign up at resend.com + verify domain before API key exists.",
    attemptable: true,
    signupUiOnly: true,
  },
  {
    id: "stripe",
    test: /stripe|checkout|webhook|portal/i,
    capability: "stripe.checkout",
    category: "Stripe",
    elevatedProbe:
      "Probe the Stripe capability first. If credentials exist, continue with agent-side configuration and verification.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for stripe.checkout"],
    humanAction:
      "Escalate only when the work truly requires dashboard-only business decisions such as creating products/prices or enabling account settings.",
    attemptable: true,
  },
  {
    id: "social-reddit-twitter",
    test: /reddit|twitter|x\/twitter|social api|announce workflow/i,
    capability: ["social.reddit", "social.twitter"],
    category: "Social",
    elevatedProbe:
      "Check both Reddit and Twitter/X capabilities. If present, proceed with the announce workflow or setup verification before asking the Studio Owner.",
    probeCommands: [
      "node scripts/ops.mjs check-secrets --for social.reddit",
      "node scripts/ops.mjs check-secrets --for social.twitter",
      "node scripts/ops.mjs announce-setup --status",
    ],
    humanAction:
      "Studio Owner must register apps at reddit.com/prefs/apps + developer.twitter.com to obtain API keys — dashboard-only step before agent can proceed.",
    attemptable: true,
    signupUiOnly: true,
  },
  {
    id: "github-workflow",
    test: /github|workflow scope|workflow token|repo creation|label/i,
    capability: "github.org",
    category: "GitHub",
    elevatedProbe:
      "Probe GitHub org access and current repo state before treating this as human-only.",
    probeCommands: [
      "node scripts/ops.mjs check-secrets --for github.org",
      "node scripts/ops.mjs phantom-check",
    ],
    humanAction:
      "Escalate only if the token lacks the required scope or the action is an intentional Studio Owner approval step.",
    attemptable: true,
  },
  {
    id: "railway",
    test: /railway/i,
    capability: "railway.deploy",
    category: "Railway",
    elevatedProbe:
      "Check Railway capability first, then attempt project/environment verification with elevated access if needed.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for railway.deploy"],
    humanAction:
      "Studio Owner must create Railway project + token in dashboard.",
    attemptable: true,
    signupUiOnly: true,
  },
  {
    id: "render",
    test: /render/i,
    capability: "render.deploy",
    category: "Render",
    elevatedProbe:
      "Check Render capability first, then attempt the API/deploy action if safe.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for render.deploy"],
    humanAction:
      "Studio Owner must create Render account + generate API key in dashboard.",
    attemptable: true,
    signupUiOnly: true,
  },
  {
    id: "vercel",
    test: /vercel/i,
    capability: "vercel.deploy",
    category: "Vercel",
    elevatedProbe:
      "Check Vercel capability first, then attempt preview/deploy verification if the task is otherwise agent-resolvable.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for vercel.deploy"],
    humanAction:
      "Studio Owner must link Vercel account + create token in dashboard.",
    attemptable: true,
    signupUiOnly: true,
  },
  {
    id: "supabase",
    test: /supabase/i,
    capability: "supabase.admin",
    category: "Supabase",
    elevatedProbe:
      "Check Supabase admin capability before declaring the setup human-only.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for supabase.admin"],
    humanAction: "Escalate only if service-role access is genuinely absent.",
    attemptable: true,
  },
  {
    id: "hetzner",
    test: /hetzner|ssh/i,
    capability: "hetzner.ssh",
    category: "Hetzner",
    elevatedProbe:
      "Check Hetzner SSH capability and attempt the server-side action with elevated access if the sandbox blocks it.",
    probeCommands: ["node scripts/ops.mjs check-secrets --for hetzner.ssh"],
    humanAction: "Escalate only if SSH access is unavailable.",
    attemptable: true,
  },
  {
    id: "manual-legal",
    test: /dba|legal|state sos/i,
    capability: null,
    category: "Legal",
    elevatedProbe: "No safe agent-side elevated probe.",
    probeCommands: [],
    humanAction: "True human-only legal/owner action.",
    attemptable: false,
  },
  {
    id: "manual-affiliate",
    test: /affiliate approval|affiliate/i,
    capability: null,
    category: "Revenue",
    elevatedProbe: "No safe agent-side elevated probe.",
    probeCommands: [],
    humanAction: "True human-only partner/dashboard action.",
    attemptable: false,
  },
];

export function classifyBlocker(text) {
  const source = String(text || "");
  const rule = RULES.find((entry) => entry.test.test(source));
  if (!rule) {
    return {
      id: "generic",
      category: "General",
      capability: null,
      capabilities: [],
      attemptable: false,
      elevatedProbe:
        "No specific elevated-access probe known. Verify manually whether the agent has the right service/API/admin path before escalating.",
      probeCommands: [],
      humanAction:
        "Escalate only after secrets discovery and a reasonable agent-side verification attempt.",
    };
  }

  const capabilities = Array.isArray(rule.capability)
    ? rule.capability
    : rule.capability
      ? [rule.capability]
      : [];

  return {
    ...rule,
    capabilities,
  };
}

/**
 * Returns ALL matching rules — used by multi-capability blockers like
 * "Social Dashboard: Railway + DNS + Supabase secrets" where the single-rule
 * classifier under-reports the dependency surface. Callers that want a single
 * primary classification should keep using classifyBlocker(); callers that
 * want exhaustive capability coverage (phantom-sweep, dependency graphs) use
 * this.
 */
export function classifyAll(text) {
  const source = String(text || "");
  const matches = RULES.filter((entry) => entry.test.test(source));
  if (matches.length === 0) return [];
  return matches.map((rule) => ({
    ...rule,
    capabilities: Array.isArray(rule.capability)
      ? rule.capability
      : rule.capability
        ? [rule.capability]
        : [],
  }));
}

export function summarizeAttemptOrder(text) {
  const info = classifyBlocker(text);
  const steps = [];

  if (info.capabilities.length > 0) {
    steps.push(`1. Secrets discovery: ${info.capabilities.join(", ")}`);
  }
  if (info.probeCommands.length > 0) {
    steps.push(`2. Probe/admin check: ${info.probeCommands.join("  ·  ")}`);
  }
  steps.push(
    `${info.capabilities.length > 0 || info.probeCommands.length > 0 ? "3" : "1"}. ${info.humanAction}`,
  );

  return steps;
}
