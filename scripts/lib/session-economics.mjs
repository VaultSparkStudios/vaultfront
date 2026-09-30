// Session outcomes decide continuation. Resource usage never measures delivered value.
export const CLOSEOUT_PCT = 0.92;
export const CONSIDER_PCT = 0.75;
// Kept as a compatibility export; no quality grades or continuation thresholds.
export const AMORTIZATION_BANDS = [{min:0,verdict:'resource-ratio',label:'resource ratio only — outcome not assessed'}];
export function bootAmortization({workTokens=0,startupTokens=0}={}) {
  if(!Number.isFinite(startupTokens)||startupTokens<=0||!Number.isFinite(workTokens)||workTokens<0)
    return {ratio:null,verdict:'unknown',label:'startup/work tokens unmeasured — outcome not assessed'};
  return {ratio:Math.round(workTokens/startupTokens*100)/100,verdict:'resource-ratio',label:'work/startup token ratio — resource use only, outcome not assessed'};
}
/** Recorded dispositions are evidence from the selected audit, not a fresh test run. */
export function assessSessionOutcome(audit,{session,now=Date.now()}={}) {
  const sid=v=>String(v??'').trim().replace(/^S/i,'');
  const unknown=reason=>({outcome:'unknown',authorizedRemaining:null,reason,itemsShipped:0});
  if(!/^[1-9]\d*$/.test(sid(session))||sid(audit?.session)!==sid(session))return unknown('audit session does not match this session');
  if(!Array.isArray(audit.items)||!audit.items.length)return unknown('no recorded audit outcomes');
  let remaining=0,shipped=0,partial=0;
  for(const item of audit.items) {
    if(item?.status==='pending'){remaining++;continue;}
    if(!['shipped','blocked','deferred'].includes(item?.status))return unknown('unsupported audit disposition');
    const last=Array.isArray(item.executionLog)?item.executionLog.at(-1):null;
    const at=Date.parse(last?.at);
    if(last?.status!==item.status||typeof last?.note!=='string'||!last.note.trim()||!Number.isFinite(at)||at>now)
      return unknown('audit disposition lacks a matching dated execution note');
    if(item.status==='shipped')shipped++;else partial++;
  }
  return {outcome:remaining?'incomplete':partial?'partial':'verified',authorizedRemaining:remaining,
    itemsShipped:shipped,partialItems:partial,reason:'current-session audit dispositions with dated execution evidence',evidence:'recorded-not-rerun'};
}
export function sessionFloorVerdict({
  contextPct=null,outcome='unknown',authorizedRemaining=null,itemsShipped=0,
  velocityFloor=null,listExhausted=null,budgetTotal=null,budgetSpent=null,budgetSpentMeasured=false,
}={}) {
  const contextMeasured=Number.isFinite(contextPct)&&contextPct>=0&&contextPct<=1;
  const spendMeasured=budgetSpentMeasured&&Number.isFinite(budgetSpent)&&budgetSpent>=0;
  const signals={contextPct:contextMeasured?contextPct:null,contextMeasured,outcome,authorizedRemaining,
    itemsShipped,velocityFloor,listExhausted,budgetTotal,budgetSpent:spendMeasured?budgetSpent:null,budgetSpentMeasured:spendMeasured};
  const stop=(reason,disposition)=>({verdict:'STOP',reason,disposition,signals});
  if(outcome==='verified'&&authorizedRemaining===0)return stop('recorded authorized outcomes complete — no additional work required','complete');
  if(contextMeasured&&contextPct>=CLOSEOUT_PCT)return stop('context '+Math.round(contextPct*100)+'% — terminal exhausted; preserve partial progress','handoff');
  if(contextMeasured&&contextPct>=CONSIDER_PCT)return stop('context '+Math.round(contextPct*100)+'% — finish safely and hand off remaining work','handoff');
  if(Number.isFinite(budgetTotal)&&budgetTotal>0&&spendMeasured&&budgetSpent>=budgetTotal)
    return stop('measured token ceiling reached — hand off remaining authorized work','handoff');
  if(outcome==='partial')return stop('recorded blocked/deferred outcomes — close with a partial handoff, not a completion claim','handoff');
  if(Number.isInteger(authorizedRemaining)&&authorizedRemaining>0) {
    const resourceNote=contextMeasured?'':' Context UNMEASURED; overrun gauge is DARK.';
    const budgetNote=budgetTotal&&!spendMeasured?' Token spend UNMEASURED; no observed ceiling claim.':'';
    return {verdict:'CONTINUE',disposition:'incomplete',reason:authorizedRemaining+' explicitly authorized item(s) remain.'+resourceNote+budgetNote,signals};
  }
  return stop('outcome/authorization unknown — record a safe handoff; do not infer more work or claim completion'+(!contextMeasured?' (context UNMEASURED)':''),'unknown');
}
export function minSessionValueGate({founderInvoked=false,...signals}={}) {
  if(founderInvoked)return {pass:true,reason:'founder-invoked closeout — always honored',disposition:'handoff'};
  const result=sessionFloorVerdict(signals);
  return {pass:result.verdict==='STOP',reason:result.reason,disposition:result.disposition};
}
// Historical +Nk spelling retained; it now describes a ceiling, never required consumption.
export function parseBudgetDirective(text='') {
  const m=String(text).match(/\+\s*([\d.]+)\s*([km])\b/i);if(!m)return null;
  const n=Number(m[1]);return Number.isFinite(n)&&n>0?Math.round(n*(m[2].toLowerCase()==='m'?1000000:1000)):null;
}
