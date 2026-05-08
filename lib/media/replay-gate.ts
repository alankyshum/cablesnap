/**
 * lib/media/replay-gate.ts
 *
 * Tiny module-singleton ref-counter for Sentry Mobile Replay gating.
 *
 * When ANY media surface (FormVideoSheet, FormClipsPlayer, Form Library
 * thumbnail grid, CompareView) is mounted, the counter is > 0 and the
 * `beforeErrorSampling` callback in app/_layout.tsx returns `false`,
 * preventing Sentry from attaching a replay payload to error events while
 * camera / video surfaces are on screen.
 *
 * AC12 (BLD-1092): the MobileReplayIntegration in @sentry/react-native@8.9.2
 * exposes ONLY {options, getReplayId()}. There is NO stop()/start()/pause()
 * method. Using beforeErrorSampling + this counter is the ONLY SDK-verified
 * way to gate error replay without tearing down the Sentry client.
 *
 * DO NOT call client.close() / client.init() from lib/media/*.
 */

let _count = 0;

/** Increment the media-surface mount counter. */
export function increment(): void {
  _count = Math.max(0, _count) + 1;
}

/** Decrement the media-surface mount counter. Never goes below 0. */
export function decrement(): void {
  _count = Math.max(0, _count - 1);
}

/** Number of media surfaces currently mounted. Non-negative. */
export function count(): number {
  return _count;
}

/** Convenience alias used by the Sentry beforeErrorSampling gate. */
export function mediaSurfaceMountCount(): number {
  return _count;
}

/** Reset counter to 0. ONLY used in unit tests. */
export function _resetForTests(): void {
  _count = 0;
}
