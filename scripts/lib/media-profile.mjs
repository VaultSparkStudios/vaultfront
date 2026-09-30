// Media identity is independent of repository visibility or the channel's old subject.
const MEDIA_NAMES = new Set(['media', 'media-brand', 'youtube-channel', 'video-production', 'film']);
export function projectMedium(entry = {}) {
  const types = (Array.isArray(entry.type) ? entry.type : String(entry.type || '').split(/[,\s]+/)).map(value => String(value).toLowerCase());
  const medium = String(entry.medium || '').toLowerCase();
  if ([medium, ...types].some(value => MEDIA_NAMES.has(value))) return 'media';
  return medium || types[0] || 'unknown';
}
const acceptance = 'Use the configured media episode adapter. Name structure, proof or release acceptance explicitly; missing evidence is unmeasured. Proof requires exact exports in the project-required formats, story/continuity/footage/sound/rights/technical/render/cost reviews and director feedback. Publication authorization is separate.';
export const MEDIA_SKILL_PROFILES = {
  start: {extraSignals: ['Active episode and next scene proof', 'Selected footage and continuity evidence', 'Actual generation cost; director time measured or explicitly unknown'], promptOverlay: 'Private media production for public entertainment. Read production/OPERATIONS.md and production/QUALITY_AND_RELEASE.md. Preserve channel direction and source archives. Repository privacy does not make this infrastructure.'},
  audit: {axisWeightDeltas: {featureDepth: 2, ux: 2, feedbackLoop: 1.5, tokenCost: 1.5}, successBarAdditions: ['Identify the episode or production deliverable and its acceptance evidence.', acceptance], promptOverlay: 'Review storytelling and payoff, character continuity, actual motion footage, sound, rights provenance, stable rendering and measured cost. A concept board is not a finished film. Reuse production tools; do not assume a website, database, auth surface or paid generation is needed.'},
  implement: {successBarAdditions: [acceptance], promptOverlay: 'Reuse the existing episode checker and guarded renderer. One bounded scene proof before expanding a film; no new spend or publication permission follows from a passing gate.'},
  closeout: {extraSignals: ['Exact export hashes and review evidence', 'Measured cost and attempts; optional measured director time', 'Production acceptance and publication authorization reported separately'], successBarAdditions: ['Retain the existing SIL scoring contract. Do not substitute hypothetical audience demand for measured review evidence.']},
};
