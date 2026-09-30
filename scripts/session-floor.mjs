#!/usr/bin/env node
// Outcome checkpoint: explicit current-session audit only; no generic backlog authorization.
// Exit CONTINUE=10, STOP=0. Closeout gate allow=0, remaining authorized work=11.
// STOP may mean complete, partial handoff, or unknown; inspect disposition.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from './lib/safe-spawn.mjs';
import {fileURLToPath} from 'node:url';
import {assessSessionOutcome,sessionFloorVerdict,minSessionValueGate,bootAmortization,parseBudgetDirective} from './lib/session-economics.mjs';
import {selectScopedAudit} from './lib/execution-contract.mjs';
const CONTROL_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
const flag=(n,d=null)=>{const i=argv.indexOf(n);return i>=0?argv[i+1]??d:d;};
const has=n=>argv.includes(n);
if(has('--help')||has('-h')) {
  console.log('Usage: node scripts/session-floor.mjs [--project <repo>|--repo <repo>] [--audit <path> --session <N>] [--budget +Nk --spent <measured tokens>] [--resources] [--handoff] [--json|--closeout-gate]');
  process.exit(0);
}
const ROOT=path.resolve(flag('--project')??flag('--repo')??process.cwd());
if(!fs.existsSync(ROOT)||!fs.statSync(ROOT).isDirectory()){console.error('project root is not a readable directory: '+ROOT);process.exit(2);}
let session=flag('--session');
if(!session)try{session=fs.readFileSync(path.join(ROOT,'context/.session-lock'),'utf8').match(/^session_id:\s*(\S+)/m)?.[1];}catch{}
let outcome={outcome:'unknown',authorizedRemaining:null,itemsShipped:0,reason:'no explicit current-session audit selected'};
const auditArg=flag('--audit');
if(auditArg) {
  const file=path.resolve(ROOT,auditArg),rel=path.relative(ROOT,file);
  if(rel.startsWith('..')||path.isAbsolute(rel)){console.error('audit path must remain inside the selected project');process.exit(2);}
  try{
    let audit=JSON.parse(fs.readFileSync(file,'utf8'));
    const scopeArg=flag('--scope');
    if(scopeArg){
      const scopeFile=path.resolve(ROOT,scopeArg),scopeRel=path.relative(ROOT,scopeFile);
      if(scopeRel.startsWith('..')||path.isAbsolute(scopeRel))throw new Error('scope path must remain inside the selected project');
      audit=selectScopedAudit(audit,JSON.parse(fs.readFileSync(scopeFile,'utf8')));
    }
    outcome={...assessSessionOutcome(audit,{session}),audit:rel};
  }
  catch(error){outcome={...outcome,reason:'selected audit/scope cannot be verified: '+error.message};}
}
// Reading context and token ledgers is not necessary to recognize completed work.
// Resource inspection is opt-in and estimates never become observed session spend.
let contextPct=null,amort=bootAmortization(),resourceEstimate=null;
if(has('--resources')) {
  try {
    const j=JSON.parse(execFileSync(process.execPath,[path.join(CONTROL_ROOT,'scripts/context-meter.mjs'),'--json'],{cwd:ROOT,encoding:'utf8',timeout:15000}));
    if(j.measured_ok!==false&&Number.isFinite(j.pctUsed))contextPct=j.pctUsed/100;
    if(Number.isFinite(j.usedTokens))resourceEstimate={tokens:j.usedTokens,source:'context-meter proxy',measurement:'estimate'};
    if(Number.isFinite(j.usedTokens)&&Number.isFinite(j.freshSessionBootstrap)&&j.usedTokens>j.freshSessionBootstrap)
      amort=bootAmortization({workTokens:j.usedTokens-j.freshSessionBootstrap,startupTokens:j.freshSessionBootstrap});
  } catch {}
}
const budgetArg=flag('--budget'),budgetTotal=budgetArg?parseBudgetDirective(budgetArg):null;
if(budgetArg&&!budgetTotal){console.error('--budget needs a positive +Nk/+Nm ceiling');process.exit(2);}
const spentArg=flag('--spent'),budgetSpent=spentArg===null?null:Number(spentArg);
if(spentArg!==null&&(!Number.isFinite(budgetSpent)||budgetSpent<0)){console.error('--spent needs a measured nonnegative token count');process.exit(2);}
const signals={...outcome,contextPct,budgetTotal,budgetSpent,budgetSpentMeasured:spentArg!==null};
if(has('--handoff')){signals.outcome='partial';signals.authorizedRemaining=0;}
const result=has('--closeout-gate')?minSessionValueGate({...signals,founderInvoked:has('--founder')}):sessionFloorVerdict(signals);
const output={...result,outcomeEvidence:outcome,amortization:amort,resourceEstimate,nextItem:null,
  derived:{...signals,budgetSpentSource:spentArg!==null?'explicit measured --spent':'unmeasured; skill/startup rows are not observed session totals'}};
if(has('--json'))console.log(JSON.stringify(output,null,2));
else {
  console.log('Session outcome · '+(has('--closeout-gate')?(result.pass?'closeout allowed':'remaining work'):result.verdict)+' · '+result.disposition);
  console.log(result.reason);
  console.log('Evidence: '+outcome.reason);
}
process.exit(has('--closeout-gate')?(result.pass?0:11):(result.verdict==='CONTINUE'?10:0));
