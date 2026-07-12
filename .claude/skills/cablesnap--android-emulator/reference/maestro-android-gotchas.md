# Maestro on Android — CableSnap gotchas

Hard-won selector and timing rules distilled from the `.maestro/flows/*.yaml` inline comments. Read before editing or debugging a flow.

## Selector rules

- **Prefer `id:` (testID) over `text:`.** On Android, UIAutomator2 exposes a `Pressable`/`Button`'s `accessibilityLabel` as the view's content-description and COLLAPSES the child `<Text>` out of the tree Maestro reads. So `tapOn: "Log Food"` fails ("Element not found: Text matching regex: Log Food") even though the label is on screen — the Button's `accessibilityLabel="Log manual entry"` shadows it. Tap the `testID` (`log-food-button`) instead. This shadowing is the single most common cause of flow failures in this repo.
- **TextInput text == its VALUE, not its label.** UIAutomator2 reports a `TextInput`'s current value (e.g. "0") as its text, not its `accessibilityLabel`. `tapOn: "Set 1 weight"` never matches; use the testID (`set-1-weight`).
- **React Navigation native header titles are unmatchable.** The session name renders only as the native toolbar title (outside the matchable view hierarchy). Assert on a real RN node in the screen body instead (e.g. "Add Exercise", or the "SET"/"KG"/"REPS" table headers).
- **`text:` is regex-matched by default** in the pinned Maestro (the YAML `text:` maps to `ElementSelector.textRegex`), so alternation like `"Log body weight|Current Weight"` works. There is NO `regex: true` toggle — adding one aborts `maestro test` at parse time before any flow runs.

## Scrolling & virtualization

- `tapOn` does NOT auto-scroll and will not hit an element whose bounds are outside the visible frame; a virtualized FlatList may not even mount it. Use `scrollUntilVisible: { element: { id: ... }, direction: DOWN, timeout: N }` first.
- `scrollUntilVisible`'s `timeout` is in SECONDS (multiplied by 1000 internally). `extendedWaitUntil`'s `timeout` is in MILLISECONDS. Do not mix the units up.
- Opening the soft keyboard shrinks `useWindowDimensions()` height (adjustResize), which can push a sheet's list area outside the layout frame so items never render. Avoid tapping search fields when a no-query full list will do; `hideKeyboard` between inputs to keep lower fields + submit button reachable.

## Timing

- `clearState: true` forces a cold start; the app holds a blank frame through async DB open + migrations before first paint. A bare `assertVisible` races this on a loaded CI emulator — use `extendedWaitUntil: { visible: ..., timeout: 90000 }` for the first post-launch assertion.
- Per-command `timeout:` is NOT reliably enforced (a flow was observed swiping for ~26 min despite a 30s command timeout). Liveness is guaranteed only by the `MAESTRO_TEST_TIMEOUT` hard wall-clock cap (`timeout` coreutils, SIGTERM then SIGKILL) in `scripts/e2e-maestro-emulator.sh`; exit 124/137 means "the gate hung".
- Maestro's Android driver push/start can be slow on a warming CI emulator — `MAESTRO_DRIVER_STARTUP_TIMEOUT` is raised (default 15000ms → 120000ms) in the driver script.

## CI gate shape (`.github/workflows/e2e-android-emulator.yml`)

- The emulator-runner action runs each `script:` line as its own `/bin/sh -c`, so ALL logic lives in `scripts/e2e-maestro-emulator.sh` (single-command invocation). Never inline multi-line shell in the workflow.
- KVM is probed FIRST (top of job) and gates every heavyweight step; no `/dev/kvm` → explicit skip (no false pass), not a hang.
- Build is `assembleRelease -PreactNativeArchitectures=x86_64` (single ABI; release embeds the Hermes bundle so the APK launches without Metro and avoids the dev-launcher screen).
- GPU mode is `-gpu swiftshader` (pure Swiftshader, NOT `swiftshader_indirect`) — the gfxstream indirect path loses a ColorBuffer handle and hangs on long multi-flow runs.
- Artifacts (`report.xml`, screenshots, `maestro.log`, `commands-(<flow>).json`) upload on `failure() || cancelled()` to `maestro-results/`.
