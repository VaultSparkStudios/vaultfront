#!/usr/bin/env node
// check-canon-044-waves.mjs — S186 (founder directive)
//
// Enforces CANON-044: every studio agent (any model, any project) MUST maintain a
// visible in-session **Wave** task list (Wave 1, Wave 2, …) for multi-step work,
// reconciled at closeout. An in-session render is ephemeral and can't be diffed
// after the fact — so enforcement targets the DURABLE agent-facing surfaces that
// *compel* the render: if every repo's protocol + agent guide carry the mandate,
// then any agent reading them is bound by it. This is the agent-neutral way to make
// a behavior stick across Claude Code, Codex, and any other model.
//
// Verifies (for each surface that EXISTS in this repo) that it carries the CANON-044
// Wave-list mandate. Runs in any repo (propagated via PROTOCOL_SCRIPTS).
//
// Usage:
//   node scripts/check-canon-044-waves.mjs           # human report, exit 1 on gap
//   node scripts/check-canon-044-waves.mjs --json

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Surfaces present in EVERY studio repo (propagated). A surface is only checked if
// it exists, but at least AGENTS.md must exist + carry the mandate.
const SURFACES = [
  { file: "AGENTS.md", must: [/CANON-044/, /[Ww]ave/], required: true },
  {
    file: "docs/SESSION_PROTOCOL.md",
    must: [/CANON-044|[Ww]ave list|task.?scaffold/i, /[Ww]ave/],
  },
  {
    file: "docs/STUDIO_CANON.md",
    must: [/CANON-044/, /MUST/, /Wave 1/i, /project-specific/i],
  }, // studio-ops (source of truth) — S192: each Wave line is a real project-specific plan item
  {
    file: "docs/templates/project-system/AGENTS_universal_sections.md",
    must: [/CANON-044/, /[Ww]ave/],
  }, // studio-ops
];

// Pure file reads — safe to call in-process from a test (spawns nothing).
export function scanCanon044(root = ROOT) {
  const findings = [];
  let checked = 0;
  for (const s of SURFACES) {
    const abs = join(root, s.file);
    if (!existsSync(abs)) {
      if (s.required)
        findings.push({ file: s.file, issue: "missing required surface" });
      continue;
    }
    checked++;
    const txt = readFileSync(abs, "utf8");
    const missing = s.must.filter((re) => !re.test(txt));
    if (missing.length)
      findings.push({
        file: s.file,
        issue: `missing CANON-044 Wave marker(s): ${missing.map(String).join(" ")}`,
      });
  }
  return {
    ok: findings.length === 0 && checked > 0,
    surfacesChecked: checked,
    findings,
  };
}

const INVOKED_DIRECTLY =
  process.argv[1] && process.argv[1].endsWith("check-canon-044-waves.mjs");
if (INVOKED_DIRECTLY) {
  const JSON_OUT = process.argv.includes("--json");
  // --root / --project <path> lets the canon-conformance engine run this per-project
  // (default: this repo's own ROOT, so standalone invocation is unchanged).
  const argv = process.argv.slice(2);
  const rootArg = (() => {
    const i = argv.findIndex((a) => a === "--root" || a === "--project");
    return i >= 0 ? argv[i + 1] : null;
  })();
  const scanRoot = rootArg ? resolve(rootArg) : ROOT;
  const { ok, surfacesChecked: checked, findings } = scanCanon044(scanRoot);
  if (JSON_OUT) {
    console.log(
      JSON.stringify({ ok, surfacesChecked: checked, findings }, null, 2),
    );
  } else if (ok) {
    console.log(
      `✓ canon-044-waves: ${checked} agent-facing surface(s) carry the Wave-list mandate (Wave 1/Wave 2, multi-step required)`,
    );
  } else {
    console.log(
      `⛔ canon-044-waves: ${findings.length} surface(s) missing the Wave-list mandate:`,
    );
    for (const f of findings) console.log(`   ${f.file} — ${f.issue}`);
    console.log(
      "   Fix: ensure the surface states agents MUST keep a visible Wave (Wave 1/Wave 2/…) task list for multi-step work (CANON-044).",
    );
  }
  process.exit(ok ? 0 : 1);
}
