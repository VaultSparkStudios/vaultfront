// process-tree.mjs — S341 [audit #1] = [S338 #14].
//
// THE DEFECT. Several agent sessions (Claude Code and Codex) share this checkout's
// scripts. A cleanup that chooses its victims by COMMAND TEXT cannot tell this
// session's leaked child from another session's live doctor: both are `node.exe`
// running `scripts/run-doctor.mjs` under the same root. S338 killed a Codex session's
// doctor in StatVault exactly that way, and `run-tests.mjs`'s timeout cleanup still
// selected by `CommandLine -like "*<root>*"` alone.
//
// THE RULE. Ownership is PARENTAGE. A process may be stopped only when its ancestry
// reaches a PID this run launched (or this run itself). Command text survives only as
// a narrowing filter on top — it can remove a victim, never admit one.
//
// Two real-world edges shape the walk:
//   • The timed-out child is usually already DEAD when cleanup runs (spawnSync killed
//     it), so its orphans point at a PID absent from the table. The dead child's PID is
//     therefore passed as a root, and admission through it requires a creation time at
//     or after the spawn — otherwise a recycled PID would adopt a stranger's tree.
//   • Unknown is never a pass: a row with no creation time cannot prove it post-dates
//     the spawn, so it is refused when that proof is required.
//
// Pure: it plans, it never kills. The caller performs the kill it was handed.

/**
 * @typedef {{pid:number, ppid:number, createdMs?:number|null}} ProcRow
 */

function normRows(rows) {
  const out = [];
  for (const r of [].concat(rows ?? [])) {
    const pid = Number(r?.pid);
    const ppid = Number(r?.ppid);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(ppid)) continue;
    const created = r?.createdMs == null ? null : Number(r.createdMs);
    out.push({ pid, ppid, createdMs: Number.isFinite(created) ? created : null });
  }
  return out;
}

/**
 * Every process whose ancestry reaches one of `rootPids`. Roots themselves are excluded.
 *
 * @param {number[]} rootPids
 * @param {ProcRow[]} rows
 * @param {{notBeforeMs?:number|null}} [opts] when set, a child adopted through a root
 *   that is ABSENT from the table (dead) must prove createdMs >= notBeforeMs.
 * @returns {Set<number>}
 */
export function descendantsOf(rootPids, rows, { notBeforeMs = null } = {}) {
  const table = normRows(rows);
  const byPid = new Map(table.map((r) => [r.pid, r]));
  const roots = new Set([].concat(rootPids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const owned = new Set();
  const queue = [...roots];
  const seen = new Set(queue);
  while (queue.length) {
    const parent = queue.shift();
    const parentRow = byPid.get(parent) || null;
    for (const child of table) {
      if (child.ppid !== parent || seen.has(child.pid) || roots.has(child.pid)) continue;
      // PID reuse: a child cannot predate its (live, known) parent.
      if (parentRow && parentRow.createdMs != null && child.createdMs != null && child.createdMs < parentRow.createdMs) continue;
      // A dead root proves nothing about who inherited its number.
      if (!parentRow && Number.isFinite(notBeforeMs)) {
        if (child.createdMs == null || child.createdMs < notBeforeMs) continue;
      }
      seen.add(child.pid);
      owned.add(child.pid);
      queue.push(child.pid);
    }
  }
  return owned;
}

/**
 * Plan a kill: candidates (already narrowed by the caller, e.g. by command text) are
 * split into those this run owns and those it must leave alone.
 *
 * @returns {{kill:number[], refused:{pid:number, reason:string}[]}}
 */
export function ownedKillPlan({ rootPids, rows, candidates, notBeforeMs = null, selfPid = process.pid } = {}) {
  const owned = descendantsOf(rootPids, rows, { notBeforeMs });
  const kill = [];
  const refused = [];
  for (const raw of [].concat(candidates ?? [])) {
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (pid === selfPid) { refused.push({ pid, reason: 'self' }); continue; }
    if (owned.has(pid)) kill.push(pid);
    else refused.push({ pid, reason: 'not-descendant — ancestry does not reach a PID this run launched' });
  }
  return { kill, refused };
}

export default { descendantsOf, ownedKillPlan };
