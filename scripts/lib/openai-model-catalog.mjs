// OpenAI API catalog verified 2026-09-15 against the model pages below.
// Model/API availability is NOT evidence of this account's access. Codex uses
// its own dynamic runtime catalog and context metadata; never infer these from API limits.
import fs from 'node:fs';
import path from 'node:path';
export const OPENAI_CATALOG_VERIFIED_AT = '2026-09-15';
export const OPENAI_SOURCES = {
  api: 'https://developers.openai.com/api/docs/models/',
  codex: 'https://learn.chatgpt.com/docs/models',
  aliases: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol',
};
const current=(tier,input,cacheRead,output,efforts)=>({
  tier,contextWindow:1_050_000,maxOutputTokens:128_000,supports:['tools','vision','streaming'],
  reasoningEfforts:efforts,price:{input,cacheRead,cacheWrite:input*1.25,output},
  longContext:{inputThreshold:272_000,inputMultiplier:2,outputMultiplier:1.5},
});
const standard=['none','low','medium','high','xhigh','max'];
export const CURRENT_OPENAI_MODELS = {
  'gpt-6-astra':current('frontier',10,1,50,standard.filter(e=>e!=='none')),
  'gpt-5.6-sol':current('flagship',4,0.4,20,standard),
  'gpt-5.6-terra':current('mid',2,0.2,12,standard),
  'gpt-5.6-luna':current('fast',0.2,0.02,1.2,standard),
};
export const OPENAI_MODEL_ALIASES = {'gpt-5.6':'gpt-5.6-sol'};
export function resolveOpenAIModel(model) {
  const id=String(model||'').replace(/^openai\//,'');
  return OPENAI_MODEL_ALIASES[id]||id;
}
export function shortOpenAIModelName(model) { return resolveOpenAIModel(model)||null; }
export function priceForOpenAIModel(model,{inputTokens=0}={}) {
  const entry=CURRENT_OPENAI_MODELS[resolveOpenAIModel(model)];
  if(!entry)return null; // Unknown/older IDs must never be charged at another provider's price.
  if(!Number.isFinite(inputTokens)||inputTokens<0)throw Error('inputTokens must be finite and nonnegative');
  const long=inputTokens>entry.longContext.inputThreshold;
  return Object.fromEntries(Object.entries(entry.price).map(([key,value])=>[
    key,value*(long?(key==='output'?entry.longContext.outputMultiplier:entry.longContext.inputMultiplier):1),
  ]));
}
export function validateOpenAIReasoning(model,reasoning) {
  const entry=CURRENT_OPENAI_MODELS[resolveOpenAIModel(model)];
  if(reasoning?.effort && entry && !entry.reasoningEfforts.includes(reasoning.effort))
    throw Error('Unsupported API reasoning effort '+reasoning.effort+' for '+model);
}
const RETIRED_CODEX_CHATGPT = {
  'gpt-5.4':'gpt-5.6-terra','gpt-5.4-mini':'gpt-5.6-luna',
  'gpt-5.2':'gpt-5.6-sol','gpt-5.3-codex':'gpt-5.6-sol',
};
/** Reads only literal model/provider fields; arbitrary TOML is not interpreted. */
export function assessCodexModelConfig(text,{authMode='unknown',now=Date.now()}={}) {
  const pins=[];let section='';const errors=[];
  for(const [i,line]of String(text||'').split(/\r?\n/).entries()){
    const header=line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);if(header){section=header[1];continue;}
    // Root and named profiles carry model settings; provider tables do not.
    if(section&&!/^profiles\.[\w-]+$/.test(section))continue;
    const match=line.match(/^\s*model\s*=\s*(["'])([^"']+)\1\s*(?:#.*)?$/);
    if(match)pins.push({model:match[2],line:i+1,section:section||'root'});
    else if(/^\s*model\s*=/.test(line))errors.push({line:i+1,reason:'model-value-unparsed'});
  }
  const stale=Date.parse(OPENAI_CATALOG_VERIFIED_AT+'T00:00:00Z')>now || now-Date.parse(OPENAI_CATALOG_VERIFIED_AT+'T00:00:00Z')>7*86400000;
  return {pins,unparsed:errors,currency:stale?'review-due':'dated-official-evidence',
    findings:pins.flatMap(pin=>{
      const replacement=RETIRED_CODEX_CHATGPT[pin.model];
      if(!replacement)return [];
      return [{...pin,severity:authMode==='chatgpt'?'fail':authMode==='api-key'?'advisory':'warn',
        kind:authMode==='api-key'?'codex-api-pin-preserved':'codex-chatgpt-retired-model',
        detail:authMode==='api-key'?'ChatGPT-sign-in retirement does not retire API-key access.':
          'Retired for Codex ChatGPT sign-in; '+(authMode==='unknown'?'authentication unmeasured; ':'')+'use '+replacement+' for that lane.',
        replacement,authMode,source:OPENAI_SOURCES.codex}];
    })};
}
export function assessCodexProjectModels(root,options={}) {
  const file=path.join(root,'.codex','config.toml');
  try{return {file,state:'present',...assessCodexModelConfig(fs.readFileSync(file,'utf8'),options)};}
  catch(error){if(error.code==='ENOENT')return {file,state:'absent',pins:[],findings:[]};
    return {file,state:'unreadable',pins:[],findings:[{severity:'warn',kind:'codex-config-unreadable',detail:error.code||'read failed'}]};}
}


/** Codex metadata is an observation of the client catalog, never API entitlement. */
export function resolveCodexRuntimeModel(model,{cache=null,now=Date.now(),maxAgeMs=86400000}={}) {
  const resolved=resolveOpenAIModel(model);
  const base={model,resolved,source:'codex-runtime-cache',apiAccess:'unverified'};
  const stamp=Date.parse(cache?.fetched_at);
  if(!Number.isFinite(stamp)||stamp>now||now-stamp>maxAgeMs||!Array.isArray(cache?.models))
    return {...base,state:'unmeasured',reason:'cache-missing-stale-or-invalid',contextWindow:null};
  const row=cache.models.find(m=>m.slug===resolved&&m.visibility==='list');
  if(!row)return {...base,state:'unmeasured',reason:'model-not-listed',contextWindow:null};
  return {...base,state:'listed',observedAt:cache.fetched_at,clientVersion:cache.client_version||null,
    contextWindow:Number.isInteger(row.context_window)&&row.context_window>0?row.context_window:null,
    reasoningEfforts:(row.supported_reasoning_levels||[]).map(r=>r.effort).filter(e=>typeof e==='string')};
}


export const OPENAI_MODEL_CURRENCY = Object.freeze({
  verifiedAt: OPENAI_CATALOG_VERIFIED_AT+'T00:00:00Z',
  maxAgeDays: 7,
  fingerprints: {
    'openai-codex-changelog':'4f34f999d260c011a4f3a1a72d9ed4f9705ff497c6529148b47723197698d886',
    'openai-api-changelog':'7cfda48b20d1dd6dfc2bc4ece6d0ae807206060a289b9ed4109344a17caa537c',
  },
});
// Source changes require review; a successful fetch alone cannot renew this catalog.
export function assessOpenAIModelCurrency(radar,now=Date.now()) {
  const maxAge=OPENAI_MODEL_CURRENCY.maxAgeDays*86400000;
  const reviewed=Date.parse(OPENAI_MODEL_CURRENCY.verifiedAt);
  if(!Number.isFinite(now)||reviewed>now||now-reviewed>maxAge)
    return {ok:false,reason:'openai-model-review-stale'};
  for(const [id,hash] of Object.entries(OPENAI_MODEL_CURRENCY.fingerprints)) {
    const source=radar?.sources?.find(s=>s.id===id);
    if(!source||source.status!=='ok'||!source.contentSha256)
      return {ok:false,reason:'openai-vendor-evidence-unavailable',sourceId:id};
    if(source.contentSha256!==hash)
      return {ok:false,reason:'openai-vendor-catalog-changed',sourceId:id};
    const observed=Date.parse(source.observedAt);
    if(!Number.isFinite(observed)||observed>now||now-observed>maxAge)
      return {ok:false,reason:'openai-vendor-evidence-stale',sourceId:id};
  }
  return {ok:true,reason:'current-reviewed-openai-catalog'};
}
