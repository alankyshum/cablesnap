---
name: cablesnap--android-emulator-debug
description: "Build, run, and debug the CableSnap Expo/React Native app on a local Android emulator, then drive it via adb and a scrcpy mirror to verify a feature end-to-end. Use when you need to close the code-then-debug-and-verify loop, reproduce a bug on device, exercise a native or OAuth flow, or hand off an interactive screen (e.g. Strava login) to the user."
---

# Skill: cablesnap--android-emulator-debug

# Goal
Take a code change from source to a running app on a local Android emulator, drive its UI headlessly via adb, and verify the feature on-device — handing off any interactive step (login/OAuth) to the user through a scrcpy mirror.

# Hard rules
- **MUST** `source <repo>/.android-env.sh` at the start of every shell block (exports JAVA_HOME, ANDROID_HOME, PATH). Without it `adb`/`emulator`/`gradle` are not found.
- **MUST** run Metro on port 8082 and add BOTH `adb reverse tcp:8082 tcp:8082` and `adb reverse tcp:8081 tcp:8082` — port 8081 is taken by the emulator's netsimd and the dev-client URL hardcodes 8081.
- **NEVER** type the user's third-party credentials. For any login/authorize screen, launch the scrcpy mirror and hand the screen to the user.
- Android package is `com.persoack.cablesnap`; deep-link scheme is `cablesnap://` (dev client: `exp+cablesnap://expo-development-client`).

# Inputs / Prerequisites
- macOS on Apple Silicon (arm64), Homebrew present, ~10 GB free disk. No sudo required.
- Repo checked out; run all scripts from the repo root.
- One-time toolchain: run `scripts/env-setup.sh` (installs JDK17 + Android SDK + AVD, writes `.android-env.sh`).

# Operations
| Action | Command | When |
|---|---|---|
| Install toolchain + create AVD (one-time) | `bash .claude/skills/cablesnap--android-emulator-debug/scripts/env-setup.sh` | First run on a machine, or if `adb`/AVD is missing. |
| Boot emulator + Metro + install/launch app | `bash .claude/skills/cablesnap--android-emulator-debug/scripts/boot.sh` | Start of a debug session. |
| Rebuild + reinstall after a code change | `source .android-env.sh && npm run android` | After editing app or native code. |
| Screenshot | `source .android-env.sh && adb exec-out screencap -p > /tmp/shot-$(date +%s).png` | To inspect the current screen. |
| Dump visible text + tap bounds | `bash .claude/skills/cablesnap--android-emulator-debug/scripts/ui-dump.sh` | To locate a control to tap (RN needs coordinate/bounds taps). |
| Screenshot + VL description + tap bounds | `bash .claude/skills/cablesnap--android-emulator-debug/scripts/look.sh <label> "<question>"` | Every navigation step — for a text-only/headless shell context, or to get tap-bound coordinates. |
| Tap / swipe | `adb shell input tap X Y` / `adb shell input swipe 540 1700 540 700 400` | To navigate the UI. |
| Interactive mirror for manual auth | `bash .claude/skills/cablesnap--android-emulator-debug/scripts/mirror.sh` | Before an OAuth/login step — the user clicks in this window. |

# Verify loop
1. Apply the code change (delegate to `code`).
2. `npm run android` to rebuild + reinstall (Gradle incremental; first build ~5 min).
3. Drive to the feature with `ui-dump.sh` + `input tap`; screenshot after each step and read the PNG to choose the next tap.
4. For a login/OAuth screen: run `mirror.sh`, tap the trigger, hand off to the user, then poll screenshots for the post-auth state.
5. Confirm the expected UI/state; capture a final screenshot as evidence.

# Sub-agent dispatch
- Dispatch `code-oc` for every shell/build step (it runs adb/Gradle and returns logs); the router reads screenshots to decide navigation.
- Give each dispatch the exact `source .android-env.sh && cd <repo>` prefix, the precise adb commands, and a screenshot path to return.
- Keep UI navigation iterative: one tap -> screenshot -> read -> next. Do not blind-chain many taps.
- Run the emulator headless (`-no-window`); scrcpy mirrors it on demand — both attach simultaneously.

# Troubleshooting
| Symptom | Fix |
|---|---|
| `adb`/`emulator`/`gradle: command not found` | `source <repo>/.android-env.sh` first. |
| App loads to a Metro red-screen / "could not connect" | Metro not on 8082 or reverses missing — rerun `boot.sh`; check `adb reverse --list` shows 8081+8082 mapped to 8082. |
| Port 8081 already in use (netsimd/gvproxy) | Expected; Metro runs on 8082 and 8081 is reverse-mapped to it. |
| Dev launcher list shows instead of the app | Relaunch: `adb shell am start -a android.intent.action.VIEW -d "exp+cablesnap://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082" com.persoack.cablesnap`. |
| uiautomator dump has no buttons | RN exposes few ids/text; tap by screenshot coordinates or the `bounds` of any text node. |
| Chrome Custom Tab first-run blocks OAuth | Dismiss "Use without an account" / "No thanks" / "Accept & continue", then the web page loads. |
| Emulator won't boot / stuck | `adb devices`; inspect `/tmp/emulator.log`; kill with `adb -s emulator-5554 emu kill` and rerun `boot.sh`. |
| scrcpy window does not open | `brew install scrcpy`; ensure a device shows in `adb devices`; inspect `/tmp/scrcpy.log`. |

# Describing a screen from a shell (optional VL helper)
When driving from a text-only shell and you want a screen described in words, a local Ollama vision-language model can do it. This is optional — if you can view images directly, just read the saved PNG.
- `scripts/look.sh <label> "<question>"` screenshots the emulator to `/tmp/cs-<label>.png`, optionally sends it to a local Ollama VL model for a text description, and prints tappable `(x,y) 'label'` bounds from uiautomator.
- Whatever vision model Ollama has locally works — check `ollama list`. `look.sh` defaults to `qwen3-vl:8b`; override with `VL_MODEL=`. Do not assume a specific model is installed.
- Drive ONE tap at a time: look -> read description + bounds -> `adb shell input tap X Y` -> look again. Do not blind-chain taps.
- A VL model is unreliable at tiny resolutions (e.g. judging whether a small grid thumbnail is a real frame vs a placeholder) and can flip its answer between reads. For fine visual judgments, get ground truth from the filesystem/logcat (below) or crop+upscale the region (`magick in.png -crop WxH+X+Y -resize 400x400 out.png`) and re-read.

# On-device evidence (don't trust pixels alone)
Prefer hard evidence over a screenshot read when verifying a feature:
- App sandbox files: `adb shell run-as com.persoack.cablesnap find . -type f` — inspect what the app actually wrote. Pull one: `adb exec-out run-as com.persoack.cablesnap cat <relpath> > /tmp/x`.
- logcat after each step: `adb logcat -d | grep -iE '<feature-keywords>|fatal|exception' | tail -50`. Absence of logs proves nothing if the code has no logging — treat it as a non-signal, not a failure.

# Form clips (video thumbnails + playback) — verified reference
Form clips are short videos bound to an exercise. Facts confirmed on-device:
- Clip videos: `files/form-clips/<gym-profile-id>/<uuid>.mp4` in the app sandbox (e.g. `files/form-clips/voltra-001/<uuid>.mp4`).
- Thumbnails: generated by `lib/media/form-clip-thumbs.ts` `getOrCreateThumb(clipId, relPath)` (expo-video-thumbnails), cached at `cache/form-clip-thumbs/<clipId>.jpg` (a real ~12 KB JPEG frame — NOT stored beside the .mp4). A real JPEG file = success; missing = generation failed.
- Playback: expo-video (ExoPlayer). Confirm real playback in logcat: `adb logcat -d | grep -iE 'ExoPlayer|MediaSessionService|PLAYING' | tail` — a working stream shows `playbackState=PLAYING(3)` with `position=` advancing each second.
- Record path: exercise detail slide-sheet -> "Form clips" tab -> "Record" -> "Start recording" -> "Save clip" (grant camera+mic if prompted; 15s max). The emulator VIRTUAL camera outputs a synthetic test scene, so recorded frames/thumbnails look like abstract colored blocks (a stylized 3D render), NOT gym footage — expected; a physical device shows real frames.
- Two surfaces share the same player (components/session/FormClipsPlayer.tsx) + thumbnail component (components/session/ClipThumbImage.tsx): (1) exercise detail Form clips tab (FormLibraryTab.tsx), (2) Settings -> "Manage form clips" (FormClipsManageSheet.tsx).