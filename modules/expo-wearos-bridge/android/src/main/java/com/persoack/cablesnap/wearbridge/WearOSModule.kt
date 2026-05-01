package com.persoack.cablesnap.wearbridge

import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * CableSnap Wear OS phone-side bridge.
 *
 * **M0 status:** empty module — `Name("WearOS")` only, no functions, no
 * events. Exists so the `playRelease` build carries a hard bytecode
 * reference to GMS Wearable (via [WEARABLE_API_CLASS]) and so the JS
 * layer in `src/index.ts` has a concrete native target to wire up in M1.
 *
 * **Not autolinked.** The `expo-module.config.json` intentionally omits the
 * `android.modules` key so the Expo autolinker does NOT generate a hard
 * `WearOSModule::class.java` reference in `ExpoModulesPackageList`. That
 * reference would cause a `NoClassDefFoundError` crash in the F-Droid build,
 * where this module's classes are excluded from the APK via Gradle
 * `configurations { releaseFdroid* { exclude module: "expo-wearos-bridge" } }`.
 * M1 will register the module manually with a try/catch guard.
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
 * This class is present in ALL build variants (including `releaseFdroid`)
 * because the Expo autolinker's generated `ExpoModulesPackageList` contains
 * a static (non-lazy) `WearOSModule::class.java` reference that would crash
 * with `NoClassDefFoundError` if the class were absent. The GMS Wearable
 * library itself IS excluded from `releaseFdroid` via Gradle `configurations`
 * excludes, so the F-Droid APK carries zero `com.google.android.gms.wearable.*`
 * classes. The [WEARABLE_API_CLASS] reference is safe: lazy + try-catch +
 * unused in M0.
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
    private val WEARABLE_API_CLASS: Class<*>? by lazy {
      try {
        Wearable::class.java
      } catch (_: Throwable) {
        // GMS Wearable not available — non-fatal for M0.
        // M1 will add actual Wearable API usage with proper availability checks.
        null
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("WearOS")
  }
}
