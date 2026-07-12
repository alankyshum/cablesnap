# Interactive on-device debug loop

Drive the CableSnap app on a headless emulator via adb, verifying a feature screen-by-screen and handing off OAuth to the user.

## Verify loop
1. Apply the code change (delegate to `code`).
2. `source .android-env.sh && npm run android` to rebuild + reinstall (Gradle incremental; first build ~5 min).
3. Drive to the feature with `ui-dump.sh` + `adb shell input tap X Y`; screenshot after each step (`adb exec-out screencap -p > /tmp/shot-$(date +%s).png`) and read the PNG to choose the next tap.
4. For a login/OAuth screen: run `mirror.sh`, tap the trigger, hand off to the user, then poll screenshots for the post-auth state.
5. Confirm the expected UI/state; capture a final screenshot as evidence.

## Notes
- Run the emulator headless (`-no-window`); scrcpy mirrors it on demand — both attach simultaneously.
- RN exposes few ids/text to uiautomator; tap by screenshot coordinates or the `bounds` of any text node from `ui-dump.sh`.
- Port 8081 is taken by netsimd/gvproxy — expected. Metro runs on 8082 and 8081 is reverse-mapped to it.
- Deep-link relaunch (dev client): `adb shell am start -a android.intent.action.VIEW -d "exp+cablesnap://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082" com.persoack.cablesnap`.

## Scripts
| Script | Purpose |
|---|---|
| `scripts/env-setup.sh` | One-time: install JDK17 + Android SDK, create `cablesnap` AVD, write `.android-env.sh`. Idempotent. |
| `scripts/boot.sh` | Boot emulator headless, start Metro on 8082, reverse ports, install (if needed) + launch the app. |
| `scripts/ui-dump.sh` | Dump visible text + tap bounds from the current screen. |
| `scripts/mirror.sh` | Launch a scrcpy mirror so the user can interact (OAuth/login). |
