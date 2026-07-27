# cablesnap:wearos:fdroid-proguard
#
# R8 / ProGuard rules for the releaseFdroid build variant.
#
# Context: CableSnap's F-Droid build excludes several optional Google
# integrations at the Gradle dependency level:
#   - com.android.installreferrer  (expo-application: install attribution)
#   - com.google.android.gms       (Play Services tasks, code scanner)
#   - com.google.firebase          (expo-notifications: FCM push tokens)
#   - com.google.mlkit             (expo-camera: on-device barcode scanner)
#
# These packages are declared `compileOnly` (or stripped entirely) so they
# are present for compilation but not bundled in the F-Droid APK.  R8 in
# full mode (AGP 8+) treats any unresolved class reference as a hard error
# even after dependency exclusion, because R8's missing-class check runs
# BEFORE dead-code elimination.  The directives below tell R8 the missing
# classes are intentional.
#
# WHY -dontwarn on BOTH the missing packages AND the referencing modules:
#   In R8 full mode, `-dontwarn <pkg>` suppresses the hard error for a class
#   that is absent from the compile classpath.  Covering the referencing Expo
#   module packages (`expo.modules.*`) is belt-and-suspenders: if R8 cannot
#   statically prove that every reference from, e.g., ApplicationModule to
#   InstallReferrer is dead, the per-referrer package rule alone may not be
#   sufficient.  Together they guarantee R8 never aborts on these known-safe
#   absent classes.
#
# IMPORTANT: This file must be wired into the releaseFdroid variant's
# proguardFiles list.  plugins/with-wearos-module.js appends this content
# (with the sentinel above) to android/app/proguard-rules.pro during
# `expo prebuild`, and the releaseFdroid block explicitly lists
# proguard-rules.pro so R8 reads it.

# ---- Missing optional packages ------------------------------------------------
-dontwarn com.android.installreferrer.**
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**
-dontwarn com.google.mlkit.**

# ---- Referencing Expo modules (belt-and-suspenders) ---------------------------
# expo-application/ApplicationModule references InstallReferrer
-dontwarn expo.modules.application.**
# expo-camera/CameraViewModule + BarcodeAnalyzer reference GMS/MLKit scanner APIs
-dontwarn expo.modules.camera.**
# expo-notifications/PushTokenModule references FCM messaging APIs
-dontwarn expo.modules.notifications.**
