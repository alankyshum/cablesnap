package com.persoack.cablesnap.wearbridge

import com.google.android.gms.wearable.Wearable
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
 *
 * **Wearable load-class reference:** [WEARABLE_API_CLASS] exists so the bridge
 * AAR's `classes.jar` carries a hard bytecode reference to
 * [com.google.android.gms.wearable.Wearable]. Without it, AGP's
 * `mergeExtDexRelease` elides the wearable AAR from `:app`'s external-deps
 * DEX merge set (resolution-time edge present, packaging-time artifact
 * absent), leaving zero `gms.wearable` classes in the Play APK. AC10a
 * verifies. M1's actual `MessageClient` calls will subsume this reference;
 * for M0 the pin is enough. See PLAN-BLD-716.md §"Tenth-order finding —
 * mergeExtDexRelease external-dep elision" for full root cause.
 */
class WearOSModule : Module() {
  companion object {
    @Suppress("unused")
    private val WEARABLE_API_CLASS: Class<*> = Wearable::class.java
  }

  override fun definition() = ModuleDefinition {
    Name("WearOS")
  }
}
