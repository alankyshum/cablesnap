# Maestro e2e suite

Run and repair CableSnap's five Maestro flows so the CI regression gate stays green. Read `maestro-android-gotchas.md` before editing a flow.

## Flows (`.maestro/flows/`)
| Flow | Covers | Notes |
|---|---|---|
| `onboarding` | Welcome → preferences → level → recommend → main tabs | Only flow that `launchApp: { clearState: true }`; MUST run first — leaf flows assume post-onboarding state. |
| `add-food` | Nutrition tab → Add Food sheet → manual entry → Log Food | testID-driven inputs; scrolls to below-fold submit. |
| `log-set` | Quick Start → add exercise → fill set weight/reps → discard | Heaviest flow; many testID selectors. |
| `start-workout` | Quick Start → active session footer → cancel | Asserts footer buttons, not native header title. |
| `view-progress` | Progress tab → Workouts/Body/Muscles segments | Uses regex `text:` alternation. |

## Running
- Full suite (fixed order): `npm run test:maestro`.
- Single flow: `maestro test .maestro/flows/<flow>.yaml`.
- Exact CI gate locally: `APK_PATH=<apk> MAESTRO_RESULTS_DIR=maestro-results MAESTRO_VERSION=<pinned> bash scripts/e2e-maestro-emulator.sh`.

## Execution order (`.maestro/config.yaml`)
Maestro discovers flows in non-deterministic order and does NOT reset state between flows. `executionOrder.flowsOrder` pins `onboarding` first (it `clearState`s + walks onboarding, leaving the app on the main tabs); the four leaf flows then run against that established state. `continueOnFailure: false` makes onboarding a hard prerequisite. Preserve this order — without it a leaf flow can land on the fresh-install Welcome screen and fail.

## Artifacts
On failure the driver writes `maestro-results/` (`report.xml` JUnit, screenshots, `maestro.log`, `commands-(<flow>).json`). The failure-point screenshot + a11y hierarchy show why a selector missed — read them before changing a flow. CI uploads this dir on `failure() || cancelled()`.

## CI gate
`.github/workflows/e2e-android-emulator.yml`: KVM probe (top of job, gates everything) → build release APK (`assembleRelease -PreactNativeArchitectures=x86_64`, embeds Hermes bundle so it launches without Metro) → `reactivecircus/android-emulator-runner` (API 34, x86_64, `-gpu swiftshader`) → `scripts/e2e-maestro-emulator.sh`. The action runs each `script:` line as its own `/bin/sh -c`, so ALL logic lives in the bash script — never inline multi-line shell in the workflow.
