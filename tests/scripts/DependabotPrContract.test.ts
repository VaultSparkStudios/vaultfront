import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const { validateDependabotFiles } =
  require("../../scripts/lib/dependabot-pr-contract.cjs") as {
    validateDependabotFiles(input: {
      actorLogin: string;
      headRef: string;
      files: string[];
    }): {
      ok: boolean;
      ecosystem: string | null;
      unsafe: string[];
      errors: string[];
    };
  };

describe("Dependabot PR machine contract", () => {
  test("accepts the live GitHub Actions group shape", () => {
    const result = validateDependabotFiles({
      actorLogin: "dependabot[bot]",
      headRef: "dependabot/github_actions/github-actions-43ac2fa788",
      files: [
        ".github/workflows/ci.yml",
        ".github/workflows/e2e.yaml",
        ".github/dependabot.yml",
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      ecosystem: "github-actions",
      unsafe: [],
      errors: [],
    });
  });

  test("accepts package-only npm updates", () => {
    expect(
      validateDependabotFiles({
        actorLogin: "dependabot[bot]",
        headRef: "dependabot/npm_and_yarn/vitest-5",
        files: ["package.json", "package-lock.json"],
      }).ok,
    ).toBe(true);
  });

  test.each([
    {
      name: "spoofed actor",
      actorLogin: "attacker",
      headRef: "dependabot/npm_and_yarn/vitest-5",
      files: ["package.json"],
    },
    {
      name: "npm branch changing workflow",
      actorLogin: "dependabot[bot]",
      headRef: "dependabot/npm_and_yarn/vitest-5",
      files: ["package.json", ".github/workflows/ci.yml"],
    },
    {
      name: "actions branch changing source",
      actorLogin: "dependabot[bot]",
      headRef: "dependabot/github_actions/actions-5",
      files: [".github/workflows/ci.yml", "src/server/Worker.ts"],
    },
    {
      name: "unsupported ecosystem",
      actorLogin: "dependabot[bot]",
      headRef: "dependabot/docker/base-5",
      files: ["Dockerfile"],
    },
  ])("rejects $name", (input) => {
    const result = validateDependabotFiles(input);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
