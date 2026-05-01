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
 *
 * **Wearable load-class reference:** [WEARABLE_API_CLASS] exists so the bridge
 * AAR's `classes.jar` carries a bytecode reference to
 * `com.google.android.gms.wearable.Wearable` via reflection. Without it, AGP's
 * `mergeExtDexRelease` elides the wearable AAR from `:app`'s external-deps
 * DEX merge set (resolution-time edge present, packaging-time artifact
 * absent), leaving zero `gms.wearable` classes in the Play APK. AC10a
 * verifies. M1's actual `MessageClient` calls will subsume this reference;
 * for M0 the pin is enough. See PLAN-BLD-716.md §"Tenth-order finding —
 * mergeExtDexRelease external-dep elision" for full root cause.
 *
 * **Why reflection instead of direct import?** A direct `import
 * com.google.android.gms.wearable.Wearable` causes the ART class verifier to
 * resolve the class when `WearOSModule` is loaded — even inside a `lazy`
 * block, because the Kotlin compiler emits a class literal reference
 * (`Wearable.class`) in the bytecode. On devices without GMS (e.g. Amazon
 * Fire, some AOSP builds), this triggers `NoClassDefFoundError` at module
 * load time. Using `Class.forName()` with a string avoids any bytecode-level
 * class reference, making the module safe on all devices.
 */
class WearOSModule : Module() {
  companion object {
    @Suppress("unused")
    private val WEARABLE_API_CLASS: Class<*>? by lazy {
      try {
        Class.forName("com.google.android.gms.wearable.Wearable")
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
    }
  }

  override fun definition() = ModuleDefinition {
    Name("WearOS")
  }
}
