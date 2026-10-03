/** Keep startup allocation monotonic when recovery has advanced beyond SIL. */
export function resolveStartupSession(silSession, statusSession) {
  const valid = (value) => Number.isSafeInteger(value) && value >= 0;
  const lastRecordedSession = Math.max(
    valid(silSession) ? silSession : 0,
    valid(statusSession) ? statusSession : 0,
  );
  return {
    nextSession: (lastRecordedSession || 62) + 1,
    closeoutSession: valid(silSession) ? silSession : null,
    shouldAdvanceStatus:
      valid(silSession) &&
      (!valid(statusSession) || statusSession < silSession),
  };
}
