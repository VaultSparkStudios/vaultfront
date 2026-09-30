// Explicit bridge to the existing project-owned episode checker; never renders or publishes.
// context/MEDIA_WORKFLOW.json: {schemaVersion:1, adapter:{kind:'episode-python-v1',script:'production/project_check.py'}}.
// Each item supplies media:{episodeId,stage:'structure'|'proof'|'release',evidencePath?}.
// Proof evidence binds every review/technical receipt to the exact master SHA256.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from './safe-spawn.mjs';

const REVIEW_AXES = ['story', 'continuity', 'footage', 'sound', 'rights', 'technical', 'renderStability', 'cost', 'founderReview'];
const LIMITS = ['Validates files, hashes and recorded evidence; does not adjudicate rights, authenticate reviewer identity, watch footage or listen to audio.', 'Passing production acceptance never authorizes publication or spend.'];
const failed = (reason, state = 'unmeasured') => ({pass:false,state,reason,fixHint:'Configure the existing episode adapter and record evidence for this item and exact export.',publicationAuthorized:false,limits:LIMITS});
function localFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes(':')) throw Error('Expected a project-relative evidence file');
  const absolute = fs.realpathSync(path.resolve(root, relative));
  const rel = path.relative(root, absolute);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel) || !fs.statSync(absolute).isFile()) throw Error('Evidence file leaves the project');
  return absolute;
}
function json(file) {
  if (fs.statSync(file).size > 1024 * 1024) throw Error('Evidence JSON exceeds 1MiB');
  return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/, ''));
}
function digest(file) {
  const fd=fs.openSync(file,'r'), buffer=Buffer.alloc(64*1024), h=crypto.createHash('sha256');
  try {let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));return h.digest('hex');} finally {fs.closeSync(fd);}
}
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function runMediaGate(item, ctx = {}) {
  try {
    const root=fs.realpathSync(path.resolve(ctx.projectDir || process.cwd()));
    const config=json(localFile(root,'context/MEDIA_WORKFLOW.json'));
    if (config.schemaVersion!==1 || config.adapter?.kind!=='episode-python-v1') return failed('Unsupported or missing media adapter');
    const selection=item?.media;
    if (!selection || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(selection.episodeId || '') || !['structure','proof','release'].includes(selection.stage)) return failed('Name a supported episode ID and explicit acceptance stage on item.media');
    const script=localFile(root,config.adapter.script);
    if (!script.endsWith('.py')) return failed('Episode adapter must reference the existing Python checker');
    const args=['-B',script,root,selection.episodeId];
    if(selection.stage==='release')args.push('--release-ready');
    const result=(ctx.runAdapter || spawnSync)('python',args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,shell:false});
    if(result.error || result.signal || result.status!==0) return failed('Episode checker failed or exceeded its 30-second deadline','fail');
    let report;try{report=JSON.parse(result.stdout);}catch{return failed('Episode checker did not return valid JSON','fail');}
    if(report.episode_id!==selection.episodeId || !Array.isArray(report.errors) || report.errors.length || !Array.isArray(report.release_blockers) || typeof report.release_ready!=='boolean')return failed('Episode checker evidence is invalid or reports errors','fail');
    if(selection.stage==='structure')return {pass:true,state:'pass',stage:'structure',reason:'Episode structure validated; film/release readiness is not established',releaseReady:report.release_ready,publicationAuthorized:false,limits:LIMITS};
    if(selection.stage==='release' && (!report.release_ready || report.release_blockers.length))return failed('Episode is not release ready','fail');
    const releaseOnly = /^(Exact release not owner approved|Release field missing: (approved_by|approved_at|title|channel_id)|master_path: .+|thumbnail_path: .+|Review not passed: (technical|creative|rights))$/;
    if(selection.stage==='proof' && report.release_blockers.some(reason=>typeof reason!=='string' || !releaseOnly.test(reason)))return failed('Episode assets, rights, concept or other production prerequisites are unresolved','fail');
    const evidence=json(localFile(root,selection.evidencePath));
    if(evidence.schemaVersion!==1 || evidence.episodeId!==selection.episodeId || evidence.itemSlug!==item.slug)return failed('Proof evidence does not match this episode and item','fail');
    const exports=[evidence.master,...(Array.isArray(evidence.derivatives)?evidence.derivatives:[])];
    const orientations=config.requiredOrientations ?? [];
    if(!Array.isArray(orientations) || orientations.some(value=>!['landscape','portrait','square'].includes(value)))return failed('Invalid project export-orientation requirements');
    if(!evidence.master)return failed('Proof needs an exact master export');
    if(orientations.some(required=>!exports.some(exported=>exported?.orientation===required)))return failed('Proof is missing a project-required export orientation');
    for(const exported of exports){
      if(!/^[a-f0-9]{64}$/.test(exported?.sha256||'') || digest(localFile(root,exported.path))!==exported.sha256)return failed('Export hash changed or is missing','fail');
    }
    let directorMinutes=null;
    for(const axis of REVIEW_AXES){
      const check=evidence.checks?.[axis];
      if(check?.status!=='pass')return failed('Media review missing or nonpassing: '+axis);
      // Reuse one consolidated evidence document or an existing separate receipt.
      // Shared review binding must be explicit, separate from editable export metadata.
      const document=check.evidencePath ? json(localFile(root,check.evidencePath)) : evidence;
      const recorded=check.evidencePath ? (document.checks?.[axis] || document) : check;
      const receipt={masterSha256:document.masterSha256,observedAt:document.observedAt,...recorded};
      if(receipt.status!=='pass' || receipt.masterSha256!==evidence.master.sha256 || !Number.isFinite(Date.parse(receipt.observedAt)) || Date.parse(receipt.observedAt)>Date.now()+60000)return failed('Review receipt is invalid or does not identify this export: '+axis,'fail');
      if(axis==='technical' && (!Array.isArray(receipt.decodedExports) || exports.some(e=>!receipt.decodedExports.includes(e.sha256))))return failed('Full-decode evidence is missing for an export');
      if(axis==='renderStability' && (receipt.exitCode!==0 || receipt.timedOut!==false || !nonnegative(receipt.timeoutMs) || receipt.timeoutMs===0 || !nonnegative(receipt.durationMs) || receipt.durationMs>receipt.timeoutMs || receipt.concurrentWorkers!==1))return failed('Render receipt does not prove bounded successful single-worker execution','fail');
      if(axis==='cost' && (!nonnegative(receipt.actualUSD) || !nonnegative(receipt.authorizedUSD) || receipt.actualUSD>receipt.authorizedUSD || !Number.isInteger(receipt.generationAttempts) || receipt.generationAttempts<0))return failed('Measured cost/attempts missing or beyond recorded authorization','fail');
      if(axis==='cost')directorMinutes=nonnegative(receipt.directorMinutes) ? receipt.directorMinutes : null;
      if(axis==='founderReview' && (receipt.decision!=='accepted-proof' || typeof receipt.reviewer!=='string' || !receipt.reviewer.trim()))return failed('Director acceptance of this exact proof is missing');
    }
    return {pass:true,state:'pass',stage:selection.stage,reason:'Episode checker and exact-export production evidence passed',masterSha256:evidence.master.sha256,telemetry:{directorMinutes,directorTimeState:directorMinutes===null?'unmeasured':'measured'},publicationAuthorized:false,limits:LIMITS};
  } catch {return failed('Media configuration or evidence is missing, unreadable or outside the project');}
}
