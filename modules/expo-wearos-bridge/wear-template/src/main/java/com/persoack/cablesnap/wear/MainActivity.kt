package com.persoack.cablesnap.wear

import android.app.Activity
import android.os.Bundle

/**
 * CableSnap Wear OS — entry Activity.
 *
 * **M0 status:** empty Activity. Boots and shows the system's default
 * Activity background. M2 will replace `setContentView` with a Compose-for-Wear
 * tree rendering [TemplateListScreen]; M3..M5 fill in Live Tracking, Rest
 * Timer, Set Management, and Workout Controls.
 *
 * Intentionally not extending `ComponentActivity` yet — Compose deps land in
 * M2 to keep the M0 watch APK as small as possible.
 */
class MainActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // M0: deliberately empty. See class kdoc.
  }
}
