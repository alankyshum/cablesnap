// CableSnap Wear OS standalone watch app — Gradle template.
//
// This file is the source of `android/wear/build.gradle.kts` after
// `expo prebuild`. It is copied verbatim by the
// `plugins/with-wearos-module.js` Config Plugin's `withDangerousMod` hook.
//
// M0 status: empty Wear OS app — boots, signs, would install on a Wear OS 4
// emulator. No screens, no DataLayer wiring, no haptics. M2..M5 fill these in.
//
// applicationId is `com.persoack.cablesnap.wear` (distinct from the phone
// app's `com.persoack.cablesnap`) per PLAN-BLD-716.md
// §"Watch APK distribution (decided per TL-3)".

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.persoack.cablesnap.wear"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.persoack.cablesnap.wear"
    minSdk = 30 // Wear OS 4 baseline (Compose-for-Wear 1.4+).
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
  }

  buildTypes {
    getByName("release") {
      isMinifyEnabled = false
      // The release build is signed by Play App Signing on Google Play.
      // Locally and in CI we sign with the same release keystore as the
      // phone app — see scheduled-release.yml.
      signingConfig = signingConfigs.getByName("debug")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}

dependencies {
  // M0 keeps deps to the absolute minimum — just enough for an empty
  // Activity to boot. M2 lands Compose-for-Wear; M3..M4 lands the watch
  // UI screens; M5 lands the durable event queue.
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.activity:activity-ktx:1.9.2")
  implementation("com.google.android.gms:play-services-wearable:18.2.0")
}
