// git-window-guard.mjs
//
// Studio-wide Windows Git storm guard. `windowsHide:true` hides the child console,
// but Git can still open its own credential/editor/pager UI underneath it. These
// environment variables force Git to fail fast and stay in-process/non-interactive.

export const GIT_WINDOW_GUARD_ENV = Object.freeze({
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "true",
  SSH_ASKPASS: "true",
  GCM_INTERACTIVE: "never",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  GIT_MERGE_AUTOEDIT: "no",
  GIT_PAGER: "cat",
  TERM: "dumb",
});

export function withGitWindowGuardEnv(env = process.env) {
  if (env?.VAULTSPARK_GIT_WINDOW_GUARD_DISABLED === "1") return { ...env };
  return { ...env, ...GIT_WINDOW_GUARD_ENV };
}
