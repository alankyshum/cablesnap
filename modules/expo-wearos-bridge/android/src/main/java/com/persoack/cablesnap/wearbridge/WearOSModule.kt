package com.persoack.cablesnap.wearbridge

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * CableSnap Wear OS phone-side bridge.
 *
 * **M0 status:** empty module — `Name("WearOS")` only, no functions, no
 * events. Exists so the Expo autolinker registers the module in the
 * `playRelease` build and so the JS layer in `src/index.ts` has a concrete
 * native target to wire up in M1.
 *
 * M1 will add:
 *   - Functions: `sendTemplates`, `broadcastActiveWorkout`
 *   - Events: `cablesnap.watch.setComplete`, `cablesnap.watch.setMutate`,
 *             `cablesnap.watch.workoutControl`
 *   - A bound [WearMessageReceiverService] that translates `MessageClient`
 *     callbacks (running on a `WearableListenerService` background thread)
 *     into `DeviceEventEmitter` calls dispatched to the JS thread, with a
 *     bounded native-side queue (≤200 events, drop-oldest) for cold-bundle
 *     replay. See PLAN-BLD-716.md §"Phone-side bridge concurrency model".
 *
 * This class is excluded from the `fdroidRelease` flavor by the source-set
 * guard emitted by `plugins/with-wearos-module.js`, so the F-Droid APK never
 * carries any reference to `com.google.android.gms.wearable.*`.
 */
class WearOSModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WearOS")
  }
}
