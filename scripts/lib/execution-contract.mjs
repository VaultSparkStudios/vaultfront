// Shared scope contract. Rendering adapters must derive from this object.
export const EXECUTION_CONTRACT = Object.freeze({
  version: 1,
  defaultMode: 'Deliver',
  modes: {
    Deliver: { explicitScope: false, instruction: 'Complete the selected outcomes and their acceptance checks. Stop when they are verified.' },
    Explore: { explicitScope: true, instruction: 'Investigate the requested question within the stated research boundary. Deliver findings and options; implementation needs authorization.' },
    Maintain: { explicitScope: true, instruction: 'Run the explicitly selected maintenance jobs or cadence. Verify their outcomes and stop at the stated boundary.' },
  },
  budgetRule: 'Budgets are ceilings. Unused tokens, an empty queue, or historical velocity never authorize additional work or greater depth.',
  completionRule: 'Partial, blocked, deferred, stale, or unmeasured evidence is not verified completion. Keep remaining authorized work visible.',
  authorityRule: 'Preserve the user\'s scope and existing authorization. Apply the gates required by the action. Explicit /start and /closeout keep their canonical protocols.',
  aliases: { start: 'studio-start', go: 'go', implement: 'implement', arc: 'arc', closeout: 'studio-closeout', initiate: 'studio-initiate' },
  gates: [
    { id:'start', owner:'studio-start', actions:['start'], reference:'docs/SESSION_PROTOCOL.md', rule:'Acquire the session lock, reconcile Canon/Ark, use the compact brief, and run required startup checks including Windows Git guard and frontier freshness.' },
    { id:'premises', owner:'check-audit-premises', actions:['implement-audit'], reference:'scripts/check-audit-premises.mjs', rule:'Verify selected audit premises before implementation; disprove or repair false premises.' },
    { id:'secret', owner:'secrets-gateway', actions:['credentials'], reference:'docs/SECRETS_PROTOCOL.md', rule:'Resolve through getSecret/resolveCapability and redact; never print secrets or read .env directly in subprocesses.' },
    { id:'trust', owner:'package-trust', actions:['install','download'], reference:'docs/OBELISK_PACKAGE_TRUST_PROTOCOL.md', rule:'Verify package/archive/binary/model trust before download/install. BLOCK stops that artifact.' },
    { id:'approval', owner:'founder-twin', actions:['network-write','privileged','destructive','payment','credentials'], reference:'docs/TWIN_PROTOCOL.md', rule:'Verify intent, target, trust, credential path, blast radius/rollback and Twin verdict; deny stops. Reuse existing founder authorization for the same bounded action.' },
    { id:'sensitive-policy', owner:'founder', actions:['canon-change','public-promise','rights','license','launch-date','security-policy','data-policy'], reference:'docs/STUDIO_CANON.md', rule:'Escalate changes to these commitments or policies; preserve approved scope and decision records.' },
    { id:'cross-repo', owner:'ark-recipient', actions:['cross-repo'], reference:'docs/STUDIO_ARK.md', rule:'Never write sibling files directly. Use signed Ark cargo, recipient locks and owner acceptance; delivery is not verified adoption.' },
    { id:'cost', owner:'founder', actions:['paid-api','paid-service'], reference:'docs/STUDIO_CANON.md', rule:'Use existing resources first. New paid use requires the applicable explicit approval and cost estimate; model choice also requires runtime entitlement and current evidence.' },
    { id:'visual', owner:'implementer', actions:['ui-change'], reference:'docs/STUDIO_CANON.md', rule:'CANON-053: inspect before/after rendered pixels on desktop and mobile, every theme and touched state; fix defects and bind the visual receipt to source hashes.' },
    { id:'release', owner:'app-release-gate', actions:['deploy','launch','identity-change'], reference:'docs/STUDIO_CANON.md', rule:'Verify applicable staging, Obelisk journeys, legal/contact/branding/security/agent surfaces, rollback and founder launch approval before production or SPARKED.' },
    { id:'public-sanitization', owner:'publisher', actions:['public-push','publish'], reference:'docs/SANITIZATION_PROTOCOL.md', rule:'Exclude secrets, CDR/private strategy/lore, local paths and restricted artifacts before public publication.' },
    { id:'blocked', owner:'implementer', actions:['label-blocked'], reference:'docs/AGENT_CAPABILITIES.md', rule:'Run secrets/capability discovery and elevated blocker-preflight; attach evidence before a human-blocked label.' },
    { id:'git', owner:'project-agent', actions:['commit','push'], reference:'AGENTS.md', rule:'Follow the current project git workflow. Scan changes for secrets; preserve unrelated work. Force-push, destructive history operations and protected releases remain gated.' },
    { id:'closeout', owner:'studio-closeout', actions:['closeout'], reference:'docs/SESSION_PROTOCOL.md', rule:'Run canonical ordered write-back, append-only DECISIONS/SIL/CDR rules, status sum invariant, truth reconciliation, scaffold and shell cleanup, and applicable push gates.' },
  ],
});

export function scopeInstructions() {
  const p=EXECUTION_CONTRACT;
  return [p.modes.Deliver.instruction, 'Explore and Maintain require an explicitly requested boundary.',p.budgetRule,p.completionRule,p.authorityRule].join(' ');
}

export function compileScope(input = {}) {
  const mode=input.mode || EXECUTION_CONTRACT.defaultMode;
  const definition=EXECUTION_CONTRACT.modes[mode];
  if(!definition) throw new Error('Unknown execution mode');
  if(typeof input.outcome!=='string'||!input.outcome.trim())throw new Error('A concrete authorized outcome is required');
  if(definition.explicitScope && (!input.authorization || !input.boundary))throw new Error(`${mode} requires explicit authorization and a boundary`);
  if(!Array.isArray(input.selectedIds)||!input.selectedIds.length||input.selectedIds.some(x=>typeof x!=='string'||!x.trim()))throw new Error('Select outcome IDs before execution');
  if(!Array.isArray(input.acceptance)||!input.acceptance.length||input.acceptance.some(x=>typeof x!=='string'||!x.trim()))throw new Error('Acceptance evidence must be named');
  const actions=[...new Set(input.actions || [])];
  const known=new Set(EXECUTION_CONTRACT.gates.flatMap(g=>g.actions));
  if(actions.some(a=>!known.has(a)))throw new Error('Unknown action requires classification before selecting gates');
  return {schemaVersion:EXECUTION_CONTRACT.version,mode,outcome:input.outcome.trim(),authorization:input.authorization || 'current user request',boundary:input.boundary || 'selected outcomes only',selectedIds:[...new Set(input.selectedIds)],acceptance:[...input.acceptance],actions,gates:EXECUTION_CONTRACT.gates.filter(g=>g.actions.some(a=>actions.includes(a))).map(g=>g.id),stop:definition.instruction};
}

// Filter before the existing outcome court; omitted or newly discovered work
// cannot enter a bounded execution merely because it is in the same audit.
export function selectScopedAudit(audit, scope) {
  const contract=compileScope(scope);
  const byId=new Map((audit?.items || []).map(i=>[i.slug,i]));
  if(contract.selectedIds.some(id=>!byId.has(id)))throw new Error('Selected outcome is missing from the audit');
  return {...audit,items:contract.selectedIds.map(id=>byId.get(id))};
}

export function scopeSemanticFindings(text) {
  const lines=String(text).split(/\r?\n/);
  return lines.flatMap((line,i)=>{
    if(/supersedes|never authorize|no automatic|does not authorize|not .*reason|historical|obsolete/i.test(line))return [];
    const bad=/EXHAUSTED\+budget|S175 saturation|empty list.*impossible|auto-expand|DO NOT stop\. Expand|then generate second-order|climbs? the ladder.*budget|budget remains.*(?:innovation|expand)|"Saturate".*innovation pack|no scope cap/i.test(line);
    return bad?[{line:i+1,rule:'unauthorized-expansion',text:line.trim()}]:[];
  });
}
