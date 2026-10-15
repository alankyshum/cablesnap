---
name: cablesnap--store-screenshots
description: Produce real CableSnap Android emulator screenshots for phone, 7-inch, or 10-inch store artwork. Use when capturing native app screens for review.
---

# Goal

# CableSnap Android screenshots

Capture the running native app with `adb exec-out screencap -p`; output is a lossless, pixel-identical 24-bit RGB PNG with no alpha (no resizing, cropping, framing, or compositing). The app's persisted theme preference defaults to dark; this workflow verifies it but never changes it.

## Inputs

- Choose an explicitly named emulator serial with `--serial`. Never use an implicitly selected device: this workflow changes emulator display overrides temporarily.
- Optional `--output DIR` sets the destination (default: `$HOME/Downloads/cablesnap-store-screenshots`). It refuses to overwrite an existing capture directory.
- Optional `--devices phone,7-inch,10-inch` selects profile presets; defaults to all three. `--config FILE.json` optionally overrides profile `size` and `density` using standard JSON, e.g. `{"profiles":{"phone":{"size":"1080x1920","density":420}}}`. Unknown profile names/keys and invalid dimensions or densities fail validation; values are passed only as ADB arguments, never shell code. Every profile must be 320–3840 pixels per dimension with maximum ≤2× minimum, matching Play screenshot geometry rules.
- Optional `--screens workouts,nutrition,progress,exercises` selects ordered screens; defaults to all four. The exercises screen uses the app's `cablesnap:///exercises` deep link and is verified through its native search control.
- Dark is required and verified read-only in the app's Appearance settings before capture. If it is not selected, set it yourself in the app and retry; the CLI never changes saved theme preference.
- Optional `--apk FILE` explicitly installs that APK with `adb install -r` before capture. Otherwise require the existing installed CableSnap package. Never clear app data or build/install implicitly.

## Operation

From the repository root, source `.android-env.sh`, then run:

```sh
python3 .claude/skills/cablesnap--store-screenshots/scripts/capture.py --serial emulator-5556
```

The command checks the selected serial is an emulator and that installed `versionName` and `versionCode` match `app.config.ts`. Presets use portrait 9-by-16 geometry: phone 1080x1920/420 dpi, tablet-class 7-inch 1080x1920/288 dpi (600 dp wide), and 10-inch 1440x2560/288 dpi (800 dp wide). Screen pixels are never resized or cropped. The existing `sharp` dependency strips only fully opaque alpha and verifies decoded RGB pixels are unchanged before writing a Play-ready 24-bit PNG; the manifest records raw and exported file digests. It records/restores prior display overrides, cold-restarts for each selected profile, verifies dark selection and screen-specific content, and force-stops after restoration so cached layout metrics do not persist.

If navigation is ambiguous, app is not on a usable screen, package/version is unexpected, a pixel is not fully opaque, or any command fails, stop; the script restores display overrides and reports the failure. Preserve existing app data and existing output directories. This produces four Play screenshot assets per profile but does not publish or upload them; review all PNGs before a separate authorized Play Console action.
