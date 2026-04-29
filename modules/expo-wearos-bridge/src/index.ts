/**
 * CableSnap Wear OS bridge — JS API surface.
 *
 * **M0 status:** every exported function is a no-op or returns a no-op
 * subscription. Importing this module is safe in M0; nothing it does has any
 * side effect on the phone app. The Wear OS feature flag in M5 will gate
 * actual usage from `app/_layout.tsx`.
 *
 * In M1 these functions will route to the native `WearOSModule` via the Expo
 * Modules requireNativeModule hook. We keep the JS contract stable here so
 * downstream consumers (the `useWatchSync` hook in M3) can compile against
 * this surface today.
 *
 * See `.plans/PLAN-BLD-716.md` §"Module structure" and §"Phone-side bridge
 * concurrency model".
 */

import type {
  WatchSetCompleteListener,
  WatchSetMutateListener,
  WatchSubscription,
  WatchWorkoutControlListener,
} from "./types";

export type * from "./types";

const NOOP_SUBSCRIPTION: WatchSubscription = {
  remove: () => {
    /* M0 no-op — no native listener to detach */
  },
};

/**
 * Returns true once the phone↔watch bridge is initialized and a watch is
 * paired. Always returns `false` in M0 (no native module loaded).
 */
export function isWatchAvailable(): boolean {
  return false;
}

/**
 * Push the user's templates to the watch. M0 no-op.
 *
 * In M1+ this will JSON-encode the payload and call
 * `DataClient.putDataItem('/templates')`.
 */
export function sendTemplates(templates: unknown[]): Promise<void> {
  void templates;
  return Promise.resolve();
}

/**
 * Notify the watch that a workout session has started on the phone. M0 no-op.
 *
 * In M1+ this will call `MessageClient.sendMessage('/active-workout', payload)`.
 */
export function broadcastActiveWorkout(
  sessionSnapshot: unknown,
): Promise<void> {
  void sessionSnapshot;
  return Promise.resolve();
}

/**
 * Subscribe to "Complete Set" events from the watch. M0 returns a no-op
 * subscription that never fires.
 */
export function onSetComplete(
  listener: WatchSetCompleteListener,
): WatchSubscription {
  void listener;
  return NOOP_SUBSCRIPTION;
}

/**
 * Subscribe to set add/delete/update events from the watch. M0 returns a
 * no-op subscription that never fires.
 */
export function onSetMutate(
  listener: WatchSetMutateListener,
): WatchSubscription {
  void listener;
  return NOOP_SUBSCRIPTION;
}

/**
 * Subscribe to workout-control events (pause/resume/finish/cancel) from the
 * watch. M0 returns a no-op subscription that never fires.
 */
export function onWorkoutControl(
  listener: WatchWorkoutControlListener,
): WatchSubscription {
  void listener;
  return NOOP_SUBSCRIPTION;
}
