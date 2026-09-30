import fs from 'node:fs';
import path from 'node:path';

export const ROUTINE_RECEIPT_SCHEMA_VERSION = '1.0';
export const ROUTINE_RECEIPT_LEDGER = 'portfolio/ops/routine-session-receipts.ndjson';
export const ROUTINE_TRIGGER = 'scheduled-routine';
export const ROUTINE_WRITEBACK_DISPOSITIONS = new Set([
  'evidence-only',
  'maintenance-recorded',
  'session-writeback-complete',
]);

const ROUTINE_AUDIT_PATH_RE = /^docs\/AUDIT_\d{4}-\d{2}-\d{2}-routine\.(?:json|md)$/i;

function normalizedPath(value) {
  const result = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!result || path.posix.isAbsolute(result) || result.split('/').includes('..')) return null;
  return result;
}

function normalizedPaths(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizedPath).filter(Boolean))].sort();
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateRoutineReceipt(receipt = {}) {
  const errors = [];
  if (receipt.schemaVersion !== ROUTINE_RECEIPT_SCHEMA_VERSION) errors.push('schemaVersion must be 1.0');
  if (!/^routine:[^:]+:[0-9a-f]{7,40}$/i.test(String(receipt.receiptId ?? ''))) errors.push('receiptId must bind routine id and commit');
  if (!receipt.routine || typeof receipt.routine !== 'object') errors.push('routine object required');
  if (!String(receipt.routine?.id ?? '').trim()) errors.push('routine.id required');
  if (!String(receipt.routine?.name ?? '').trim()) errors.push('routine.name required');
  if (receipt.trigger !== ROUTINE_TRIGGER) errors.push(`trigger must be ${ROUTINE_TRIGGER}`);
  if (!validIso(receipt.startedAt)) errors.push('startedAt must be ISO-8601');
  if (!validIso(receipt.completedAt)) errors.push('completedAt must be ISO-8601');
  if (validIso(receipt.startedAt) && validIso(receipt.completedAt)
      && Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) errors.push('completedAt precedes startedAt');
  if (!/^[0-9a-f]{7,40}$/i.test(String(receipt.commit ?? ''))) errors.push('commit must be a git SHA');
  if (!Array.isArray(receipt.changedPaths) || receipt.changedPaths.length === 0) errors.push('changedPaths must be non-empty');
  const changedPaths = normalizedPaths(receipt.changedPaths);
  if (changedPaths.length !== (receipt.changedPaths ?? []).length) errors.push('changedPaths must be unique normalized relative paths');
  if (JSON.stringify(changedPaths) !== JSON.stringify(receipt.changedPaths ?? [])) errors.push('changedPaths must be sorted');
  if (!Array.isArray(receipt.producedArtifacts)) errors.push('producedArtifacts must be an array');
  const producedArtifacts = normalizedPaths(receipt.producedArtifacts);
  if (producedArtifacts.length !== (receipt.producedArtifacts ?? []).length) errors.push('producedArtifacts must be unique normalized relative paths');
  if (JSON.stringify(producedArtifacts) !== JSON.stringify(receipt.producedArtifacts ?? [])) errors.push('producedArtifacts must be sorted');
  for (const artifact of producedArtifacts) {
    if (!changedPaths.includes(artifact)) errors.push(`produced artifact is absent from changedPaths: ${artifact}`);
  }
  if (!ROUTINE_WRITEBACK_DISPOSITIONS.has(receipt.writeBackDisposition)) errors.push('writeBackDisposition is invalid');
  if (producedArtifacts.some((artifact) => ROUTINE_AUDIT_PATH_RE.test(artifact))
      && receipt.writeBackDisposition !== 'evidence-only') {
    errors.push('routine audit artifacts require writeBackDisposition=evidence-only');
  }
  return { ok: errors.length === 0, errors, changedPaths, producedArtifacts };
}

export function buildRoutineReceipt({
  routineId,
  routineName,
  startedAt,
  completedAt = new Date().toISOString(),
  commit,
  changedPaths,
  producedArtifacts = [],
  writeBackDisposition,
} = {}) {
  const normalizedCommit = String(commit ?? '').trim().toLowerCase();
  const receipt = {
    schemaVersion: ROUTINE_RECEIPT_SCHEMA_VERSION,
    receiptId: `routine:${String(routineId ?? '').trim()}:${normalizedCommit}`,
    routine: { id: String(routineId ?? '').trim(), name: String(routineName ?? '').trim() },
    trigger: ROUTINE_TRIGGER,
    startedAt,
    completedAt,
    commit: normalizedCommit,
    changedPaths: normalizedPaths(changedPaths),
    producedArtifacts: normalizedPaths(producedArtifacts),
    writeBackDisposition,
  };
  const verdict = validateRoutineReceipt(receipt);
  if (!verdict.ok) throw new Error(`invalid routine receipt: ${verdict.errors.join('; ')}`);
  return receipt;
}

export function appendRoutineReceiptAtomic(repoRoot, receipt, { ledger = ROUTINE_RECEIPT_LEDGER } = {}) {
  const verdict = validateRoutineReceipt(receipt);
  if (!verdict.ok) throw new Error(`invalid routine receipt: ${verdict.errors.join('; ')}`);
  const ledgerPath = path.join(repoRoot, ledger);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const existing = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '';
  const duplicate = existing.split(/\r?\n/).filter(Boolean).some((line) => {
    try { return JSON.parse(line).receiptId === receipt.receiptId; } catch { return false; }
  });
  if (duplicate) return { appended: false, duplicate: true, ledger };
  const line = Buffer.from(`${JSON.stringify(receipt)}\n`, 'utf8');
  const fd = fs.openSync(ledgerPath, 'a');
  try {
    fs.writeSync(fd, line, 0, line.length);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return { appended: true, duplicate: false, ledger };
}

export function readRoutineReceipts(repoRoot, { ledger = ROUTINE_RECEIPT_LEDGER } = {}) {
  const ledgerPath = path.join(repoRoot, ledger);
  if (!fs.existsSync(ledgerPath)) return { rows: [], invalidLines: [] };
  const rows = [];
  const invalidLines = [];
  for (const [index, line] of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const verdict = validateRoutineReceipt(row);
      if (!verdict.ok) invalidLines.push({ line: index + 1, errors: verdict.errors });
      else rows.push(row);
    } catch (error) {
      invalidLines.push({ line: index + 1, errors: [`invalid JSON: ${error.message}`] });
    }
  }
  return { rows, invalidLines };
}

export function routineReceiptCoversCommit(receipt, commit = {}) {
  if (!validateRoutineReceipt(receipt).ok) return false;
  const receiptSha = String(receipt.commit).toLowerCase();
  const commitSha = String(commit.sha ?? '').toLowerCase();
  if (!receiptSha.startsWith(commitSha) && !commitSha.startsWith(receiptSha)) return false;
  const commitPaths = normalizedPaths(commit.files);
  return JSON.stringify(commitPaths) === JSON.stringify(receipt.changedPaths);
}

export function findRoutineReceipt(commit, receipts = []) {
  return receipts.find((receipt) => routineReceiptCoversCommit(receipt, commit)) ?? null;
}
