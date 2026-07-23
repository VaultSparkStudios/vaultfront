"use strict";

const BRANCH_POLICIES = [
  {
    ecosystem: "npm",
    branch: /^dependabot\/npm_and_yarn\//,
    allowed: /^(?:package(?:-lock)?\.json|\.github\/dependabot\.yml)$/,
  },
  {
    ecosystem: "github-actions",
    branch: /^dependabot\/github_actions\//,
    allowed:
      /^(?:\.github\/workflows\/[^/]+\.ya?ml|\.github\/dependabot\.yml)$/,
  },
];

function validateDependabotFiles(input) {
  const errors = [];
  if (input.actorLogin !== "dependabot[bot]") {
    errors.push("Trusted automation identity must be dependabot[bot].");
  }
  const policy = BRANCH_POLICIES.find((candidate) =>
    candidate.branch.test(input.headRef ?? ""),
  );
  if (!policy) {
    errors.push(
      "Dependabot branch must declare a supported npm_and_yarn or github_actions ecosystem.",
    );
  }
  const files = [...new Set(input.files ?? [])].sort();
  if (files.length === 0) errors.push("Dependabot PR has no changed files.");
  const unsafe = policy
    ? files.filter((file) => !policy.allowed.test(file))
    : files;
  if (unsafe.length > 0) {
    errors.push(
      `Dependabot ${policy?.ecosystem ?? "unknown"} PR changes out-of-scope files: ${unsafe.join(", ")}`,
    );
  }
  return {
    ok: errors.length === 0,
    ecosystem: policy?.ecosystem ?? null,
    files,
    unsafe,
    errors,
  };
}

module.exports = { validateDependabotFiles };
