---
name: cablesnap--android-emulator
description: "Build, run, drive, debug, and e2e-test the CableSnap Expo/React Native app on an Android emulator. Use when you need to reproduce a bug on device, verify a feature end-to-end, drive the UI via adb, hand off an OAuth/login screen to the user, or run and fix the Maestro e2e regression suite (onboarding, log-set, start-workout, add-food, view-progress) locally or in CI."
---

# Skill: cablesnap--android-emulator

# Goal
Take a CableSnap change from source to a running app on a local Android emulator, drive its UI headlessly via adb to verify a feature (handing off interactive login to the user via scrcpy), and run/repair the Maestro e2e regression suite that gates CI.

# Two modes
- **Interactive debug** — boot emulator, install a dev-client build, drive the UI with adb taps/screenshots, mirror for OAuth. See `reference/interactive-debug.md`.
- **Maestro e2e** — run the five `.maestro/flows/*` against a booted emulator and fix flaky/broken flows. See `reference/maestro-e2e.md` and `reference/maestro-android-gotchas.md`.

# Hard rules
- **MUST** `source <repo>/.android-env.sh` at the start of every shell block (exports JAVA_HOME, ANDROID_HOME, PATH) — without it `adb`/`emulator`/`gradle` are not found.
- **MUST** run Metro on port 8082 and add BOTH `adb reverse tcp:8082 tcp:8082` and `adb reverse tcp:8081 tcp:8082` — port 8081 is taken by the emulator's netsimd and the dev-client URL hardcodes 8081.
- **MUST** keep the Maestro CLI version PINNED (it lives in `.github/workflows/e2e-android-emulator.yml` `env.MAESTRO_VERSION`); never install or float `latest`.
- **MUST** select emulator UI by `id:` (testID) over visible `text:` — on Android a Pressable's `accessibilityLabel` shadows its child `<Text>`, so text matches silently fail (see `reference/maestro-android-gotchas.md`).
- **NEVER** type the user's third-party credentials — for any login/OAuth screen, launch the scrcpy mirror and hand the screen to the user.
- Android package is `com.persoack.cablesnap`; deep-link scheme is `cablesnap://` (dev client: `exp+cablesnap://expo-development-client`). Maestro flow order is fixed in `.maestro/config.yaml` — preserve it.

# Inputs / Prerequisites
- macOS on Apple Silicon (arm64), Homebrew, ~10 GB free disk, no sudo. Run all scripts from the repo root.
- One-time toolchain: `bash .claude/skills/cablesnap--android-emulator/scripts/env-setup.sh` (installs JDK17 + Android SDK + `cablesnap` AVD, writes git-ignored `.android-env.sh`).
- Maestro CLI on PATH for e2e: `curl -fsSL https://get.maestro.mobile.dev | bash` with `MAESTRO_VERSION` exported, then `export PATH="$HOME/.maestro/bin:$PATH"`.

# Operations
| Action | Command | When |
|---|---|---|
| Install toolchain + create AVD (one-time) | `bash .claude/skills/cablesnap--android-emulator/scripts/env-setup.sh` | First run on a machine, or if `adb`/AVD is missing. |
| Boot emulator + Metro + install/launch app | `bash .claude/skills/cablesnap--android-emulator/scripts/boot.sh` | Start of a debug session. |
| Rebuild + reinstall after a code change | `source .android-env.sh && npm run android` | After editing app or native code. |
| Screenshot | `source .android-env.sh && adb exec-out screencap -p > /tmp/shot-$(date +%s).png` | To inspect the current screen. |
| Dump visible text + tap bounds | `bash .claude/skills/cablesnap--android-emulator/scripts/ui-dump.sh` | To locate a control to tap. |
| Tap / swipe | `adb shell input tap X Y` / `adb shell input swipe 540 1700 540 700 400` | To navigate the UI. |
| Interactive mirror for manual auth | `bash .claude/skills/cablesnap--android-emulator/scripts/mirror.sh` | Before an OAuth/login step — the user clicks in this window. |
| Run full Maestro suite (fixed order) | `source .android-env.sh && npm run test:maestro` | Local e2e check against a booted emulator + installed app. |
| Run one Maestro flow | `source .android-env.sh && maestro test .maestro/flows/<flow>.yaml` | Iterating on a single flow. |
| Run the exact CI e2e driver | `APK_PATH=<path.apk> MAESTRO_RESULTS_DIR=maestro-results MAESTRO_VERSION=<pinned> bash scripts/e2e-maestro-emulator.sh` | Reproduce the CI gate (boot poll + install + hard-cap + JUnit/artifacts). |
| Record a new flow | `source .android-env.sh && npm run test:maestro:record` | Authoring a flow by demonstration. |
| APK launch-only smoke gate | `bash scripts/smoke-test-emulator.sh` (needs `cablesnap.apk` + `cablesnap-fdroid.apk` in cwd) | Lightweight "APK launches without crashing" check. |

Flows live in `.maestro/flows/`: `onboarding`, `add-food`, `log-set`, `start-workout`, `view-progress`. Config + execution order in `.maestro/config.yaml`. The CI e2e driver is `scripts/e2e-maestro-emulator.sh`; the gate workflow is `.github/workflows/e2e-android-emulator.yml`.

# Sub-agent dispatch
- Dispatch `code-oc` for each shell/build/adb/maestro step (it runs the commands and returns logs); the router reads screenshots / `maestro-results/` artifacts to decide the next tap or selector fix.
- Give each dispatch the exact `source .android-env.sh && cd <repo>` prefix, the precise commands, and a screenshot / results path to return.
- Keep interactive UI navigation iterative: one tap → screenshot → read → next. Do not blind-chain many taps.
- When a Maestro flow fails, first read `reference/maestro-android-gotchas.md`, then the failure screenshot + `commands-(<flow>).json` artifact — do not guess selectors.

# Troubleshooting
| Symptom | Fix |
|---|---|
| `adb`/`emulator`/`gradle: command not found` | `source <repo>/.android-env.sh` first. |
| App loads to a Metro red-screen / "could not connect" | Metro not on 8082 or reverses missing — rerun `boot.sh`; check `adb reverse --list` shows 8081+8082 mapped to 8082. |
| Dev launcher list shows instead of the app | Relaunch: `adb shell am start -a android.intent.action.VIEW -d "exp+cablesnap://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082" com.persoack.cablesnap`. |
| `Element not found: Text matching regex: <label>` but element is on screen | Child `<Text>` shadowed by the Pressable's `accessibilityLabel`; switch to `id:` (testID). See `reference/maestro-android-gotchas.md`. |
| Leaf Maestro flow lands on Welcome screen and fails | Flow order broken — `onboarding` must run first. Restore `.maestro/config.yaml` `executionOrder.flowsOrder`. |
| Flow hangs many minutes despite a `timeout:` | Per-command timeout not enforced; only the `MAESTRO_TEST_TIMEOUT` hard cap in `scripts/e2e-maestro-emulator.sh` kills it (exit 124/137). |
| Element below the fold not tappable | `tapOn` does not auto-scroll; use `scrollUntilVisible` with `element: { id: ... }` first. |
| Chrome Custom Tab first-run blocks OAuth | Dismiss "Use without an account" / "No thanks" / "Accept & continue", then the web page loads. |
| Emulator won't boot / stuck | `adb devices`; inspect `/tmp/emulator.log`; kill with `adb -s emulator-5554 emu kill` and rerun `boot.sh`. |
| scrcpy window does not open | `brew install scrcpy`; ensure a device shows in `adb devices`; inspect `/tmp/scrcpy.log`. |
| CI e2e job skipped with "no /dev/kvm" | Runner lacks nested virtualization; the gate skips explicitly (no false pass). Re-run or use a KVM-capable runner. |
