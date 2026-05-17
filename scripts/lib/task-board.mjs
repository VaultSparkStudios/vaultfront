/**
 * task-board.mjs — parse context/TASK_BOARD.md into structured item arrays.
 *
 * Exports:
 *   parseUnifiedItems(text) → { title, description, status }[]
 *   parseHumanItems(text)   → { title, description }[]
 */

const HUMAN_BLOCKED_SIGNALS = [
  "human action required",
  "human-blocked",
  "needs founder",
  "manual step",
  "dashboard signup",
  "requires login",
  "ui-only",
];
const CROSS_REPO_SIGNALS = ["cross-repo", "another repo", "owned by"];
const EXTERNAL_SIGNALS = ["waiting on", "external", "third-party", "vendor"];
const HUB_SIGNALS = ["hub-blocked", "blocked-on-hub"];

function classifyStatus(text) {
  const t = text.toLowerCase();
  if (HUB_SIGNALS.some((s) => t.includes(s))) return "blocked-on-hub";
  if (CROSS_REPO_SIGNALS.some((s) => t.includes(s))) return "cross-repo-locked";
  if (EXTERNAL_SIGNALS.some((s) => t.includes(s))) return "externally-blocked";
  if (HUMAN_BLOCKED_SIGNALS.some((s) => t.includes(s))) return "human-blocked";
  return "unblocked";
}

/**
 * Parse a TASK_BOARD.md text into unified items.
 * Recognises markdown list items (- or *) and ## section headings as groupers.
 */
export function parseUnifiedItems(text) {
  if (!text || typeof text !== "string") return [];
  const lines = text.split("\n");
  const items = [];
  let currentSection = "";

  for (const line of lines) {
    const sectionMatch = line.match(/^#{1,3}\s+(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    const itemMatch = line.match(/^[-*]\s+(.+)/);
    if (itemMatch) {
      const raw = itemMatch[1].trim();
      const status = classifyStatus(`${currentSection} ${raw}`);
      items.push({
        title: raw,
        description: "",
        status,
        section: currentSection,
      });
    }
  }
  return items;
}

/**
 * Parse a TASK_BOARD.md text into human-action items only.
 * Returns items whose section or text suggests human intervention is required.
 */
export function parseHumanItems(text) {
  if (!text || typeof text !== "string") return [];
  const all = parseUnifiedItems(text);
  return all.filter(
    (item) =>
      [
        "human-blocked",
        "cross-repo-locked",
        "externally-blocked",
        "blocked-on-hub",
      ].includes(item.status) ||
      HUMAN_BLOCKED_SIGNALS.some((s) =>
        `${item.section} ${item.title}`.toLowerCase().includes(s),
      ),
  );
}
