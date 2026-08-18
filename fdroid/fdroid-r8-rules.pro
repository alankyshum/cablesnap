# F-Droid R8 keep rules
#
# The F-Droid build excludes all GMS, Firebase, MLKit, and installreferrer
# JARs from the classpath (via FDROID_EXCLUDES_BLOCK in with-wearos-module.js).
# Expo library source files compiled into the APK (expo-camera, expo-application)
# still contain bytecode references to these classes in method signatures and
# field types. R8's missing-class check treats unresolvable referenced types as
# a hard error by default.
#
# These -dontwarn directives instruct R8 to skip the missing-class check for
# all GMS / Firebase / MLKit / installreferrer packages. The referencing code
# paths are never reached at runtime on F-Droid (the functionality is either
# replaced by FOSS stubs or excluded via expo-module.config.json autolinking).
#
# Reference: https://r8.googlesource.com/r8/+/refs/heads/main/doc/keepanno.md
# and https://developer.android.com/build/shrink-code#troubleshoot-r8

# Install Referrer (com.android.installreferrer) — referenced by expo-application
-dontwarn com.android.installreferrer.**

# Google Play Services tasks — referenced by expo-camera CameraViewModule
-dontwarn com.google.android.gms.tasks.**

# ML Kit barcode scanning — referenced by expo-camera analyzers
-dontwarn com.google.mlkit.**

# Firebase — belt-and-suspenders, in case any transitive reference survives source patching
-dontwarn com.google.firebase.**

# GMS common — belt-and-suspenders for any remaining Play Services references
-dontwarn com.google.android.gms.**
