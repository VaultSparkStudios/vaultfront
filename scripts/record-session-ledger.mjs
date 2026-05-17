#!/usr/bin/env node
/**
 * record-session-ledger.mjs
 *
 * Called from the Claude Code Stop hook.  Reads the session event from stdin,
 * extracts token usage from the transcript (last assistant message), and
 * appends a NDJSON entry to docs/cache-ledger.ndjson so context-meter gains
 * ledger-level confidence.
 *
 * Entry format (compatible with context-meter.mjs):
 *   { ts, script, model, input, output, cache_read, cache_create, session_id }
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = path.join(ROOT, "docs", "cache-ledger.ndjson");

async function main() {
  let event = {};
  try {
    const raw = fs.readFileSync("/dev/stdin", "utf8");
    event = JSON.parse(raw);
  } catch {
    // stdin not available or malformed — skip silently
    process.exit(0);
  }

  const { session_id, transcript_path } = event;
  if (!transcript_path || !fs.existsSync(transcript_path)) {
    process.exit(0);
  }

  // Parse transcript to find last assistant stop_reason message with usage
  let lastUsage = null;
  let model = "unknown";
  try {
    const lines = fs
      .readFileSync(transcript_path, "utf8")
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      const entry = JSON.parse(line);
      // Claude Code transcript entries: { type: 'assistant', message: { usage, model } }
      if (entry.type === "assistant" && entry.message?.usage) {
        lastUsage = entry.message.usage;
        model = entry.message.model ?? model;
      }
    }
  } catch {
    process.exit(0);
  }

  if (!lastUsage) {
    process.exit(0);
  }

  const ledgerEntry = {
    ts: new Date().toISOString(),
    script: "claude-code-interactive",
    model,
    session_id: session_id ?? "unknown",
    input: lastUsage.input_tokens ?? 0,
    output: lastUsage.output_tokens ?? 0,
    cache_read: lastUsage.cache_read_input_tokens ?? 0,
    cache_create: lastUsage.cache_creation_input_tokens ?? 0,
  };

  // Ensure docs/ directory exists
  const docsDir = path.dirname(LEDGER_PATH);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  fs.appendFileSync(LEDGER_PATH, JSON.stringify(ledgerEntry) + "\n", "utf8");
  console.error("[ledger] Appended session entry to docs/cache-ledger.ndjson");
}

main().catch((e) => {
  console.error("[ledger] Error:", e.message);
  process.exit(0); // non-fatal
});
