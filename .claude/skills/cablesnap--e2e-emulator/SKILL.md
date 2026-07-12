---
name: cablesnap--e2e-emulator
description: "Run and debug CableSnap's Maestro end-to-end (e2e) test suite on an Android emulator. Use when you add or change a user-facing flow (onboarding, logging a set, starting a workout, adding food, viewing progress), need to reproduce or fix a failing Maestro flow, verify a UI regression on-device, or wire the e2e gate into CI."
---

# Skill: cablesnap--e2e-emulator

# Goal
Run CableSnap's five Maestro e2e flows against a booted Android emulator, interpret pass/fail + artifacts, and fix flaky or broken flows so the CI regression gate (`.github/workflows/e2e-android-emulator.yml`) stays green.

# Hard rules
- **MUST** `source <repo>/.android-env.sh` at the start of every shell block (exports JAVA_HOME, ANDROID_HOME, PATH) — without it `adb`/`emulator` are not found.
- **MUST** keep the Maestro CLI version PINNED. The version lives in `.github/workflows/e2e-android-emulator.yml` (`env.MAESTRO_VERSION`); never install or float `latest`.
- **MUST** select emulator UI elements by `id:` (testID) over visible `text:` — on Android a Pressable's `accessibilityLabel` shadows its child `<Text>`, so text matches silently fail. See `reference/maestro-android-gotchas.md`.
- **NEVER** add per-command `timeout:` as the sole liveness guard — the pinned Maestro version does not reliably honor it; the hard wall-clock cap lives in `scripts/e2e-maestro-emulator.sh`.
- Flow order is fixed in `.maestro/config.yaml` (`onboarding` first — it `clearState`s and passes onboarding; the four leaf flows assume that established state). Preserve it.

# Inputs / Prerequisites
- A booted, `adb`-reachable Android emulator (API 34, x86_64). Locally: boot via the `cablesnap--android-emulator-debug` skill's `boot.sh`.
- A built app APK. CI builds a release APK (`assembleRelease -PreactNativeArchitectures=x86_64`) that embeds the Hermes bundle so it launches without Metro. Locally, `npm run android` installs a dev-client build.
- Maestro CLI on PATH: `curl -fsSL https://get.maestro.mobile.dev | bash` with `MAESTRO_VERSION` exported, then `export PATH="$HOME/.maestro/bin:$PATH"`.

# Operations
| Action | Command | When |
|---|---|---|
| Run full suite locally (fixed order) | `source .android-env.sh && npm run test:maestro` | Quick local check against a booted emulator + installed app. |
| Run one flow | `source .android-env.sh && maestro test .maestro/flows/<flow>.yaml` | Iterating on a single flow. |
| Run the full CI driver locally | `APK_PATH=<path.apk> MAESTRO_RESULTS_DIR=maestro-results MAESTRO_VERSION=<pinned> bash scripts/e2e-maestro-emulator.sh` | Reproduce the exact CI gate (boot poll + install + hard-cap + JUnit/artifacts). |
| Record a new flow interactively | `source .android-env.sh && npm run test:maestro:record` | Authoring a new flow by demonstration. |
| Inspect failure artifacts | open `maestro-results/` (report.xml, screenshots, maestro.log) | After a failing run — the failure-point screenshot + a11y hierarchy show why a selector missed. |
| Launch smoke-only gate (launch-without-crash) | `bash scripts/smoke-test-emulator.sh` (needs `cablesnap.apk` + `cablesnap-fdroid.apk` in cwd) | Lightweight "APK launches" check, distinct from the flow suite. |

Flows live in `.maestro/flows/`: `onboarding`, `add-food`, `log-set`, `start-workout`, `view-progress`. Config + execution order in `.maestro/config.yaml`.

# Sub-agent dispatch
- Dispatch `code-oc` for each shell/build/adb step (it runs the commands and returns logs); the router reads `maestro-results/` screenshots to decide the next selector fix.
- Give each dispatch the `source .android-env.sh && cd <repo>` prefix, the exact `maestro test` command, and the `maestro-results/` path to return.
- When a flow fails, first read `reference/maestro-android-gotchas.md`, then the failure screenshot + `commands-(<flow>).json` artifact — do not guess selectors.
- CI wiring lives in `.github/workflows/e2e-android-emulator.yml` (KVM probe → build → emulator-runner → `scripts/e2e-maestro-emulator.sh`). Edit the workflow only for gate wiring, never inline multi-line shell (the emulator-runner action runs each `script:` line as its own `/bin/sh -c`; keep logic in the bash script).

# Troubleshooting
| Symptom | Fix |
|---|---|
| `adb`/`emulator: command not found` | `source <repo>/.android-env.sh` first. |
| `Element not found: Text matching regex: <label>` but element is on screen | The child `<Text>` is shadowed by the Pressable's `accessibilityLabel`; switch to `id:` (testID). See `reference/maestro-android-gotchas.md`. |
| Leaf flow lands on Welcome screen and fails | Flow order broken — `onboarding` must run first (it `clearState`s + walks onboarding). Restore `.maestro/config.yaml` `executionOrder.flowsOrder`. |
| `Unknown option: '--test-output-dir'` | Not supported in the pinned Maestro; JUnit goes to `--output`, artifacts to `--debug-output`/`--flatten-debug-output`. |
| Flow hangs for many minutes despite a `timeout:` | Per-command timeout is not enforced; the run is killed only by the `MAESTRO_TEST_TIMEOUT` hard cap in `scripts/e2e-maestro-emulator.sh` (exit 124/137). |
| Emulator boots but app shows "Development Servers" screen | A dev-client/debug APK expects Metro; for the standalone gate build the release APK (embeds Hermes bundle) or run Metro + reverse ports via the debug skill's `boot.sh`. |
| Element below the fold not tappable | `tapOn` does not auto-scroll; use `scrollUntilVisible` with `element: { id: ... }` first. |
| Cold-start races an `assertVisible` | Use `extendedWaitUntil` with an explicit `timeout` (ms) to absorb first-paint latency. |
| CI job skipped with "no /dev/kvm" | Runner lacks nested virtualization; the gate skips explicitly (no false pass). Re-run or use a KVM-capable runner. |
