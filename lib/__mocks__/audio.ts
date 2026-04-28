// Manual jest mock for `lib/audio` (BLD-753a).
//
// Why this exists:
// - The real module owns a Map of expo-audio AudioPlayer instances and a
//   `useFocusEffect` cleanup (`unloadAudio()`) wired into `useTimerEngine`.
// - Test files used to inline-mock with `{ play, setEnabled, preload }` only,
//   which made `unload()` undefined and exploded the focus-effect cleanup with
//   `TypeError: (0 , _audio.unload) is not a function`. See BLD-753a thread.
// - Centralizing the mock here mirrors the FULL public surface of `lib/audio`
//   so future additions to the real module don't silently break tests again.
//
// Usage from a test file:
//   jest.mock("../../lib/audio");           // picks up THIS manual mock
//   // OR (also works because jest resolves manual mocks via the real module
//   // path after path-alias resolution):
//   jest.mock("@/lib/audio");
//
// All exports are `jest.fn()` so individual tests can assert calls if needed:
//   const audio = require("../../lib/audio")
//   expect(audio.play).toHaveBeenCalledWith("set_complete")

// Keep these in sync with `lib/audio.ts`. The completeness is enforced by
// `__tests__/lib/audio-mock-completeness.test.ts` (see BLD-753a).
import type { AudioCategory, TimerCue } from "../audio"

export type { AudioCategory, TimerCue }

// Mirror the const map from the real module so tests that read CUE_CATEGORY
// (e.g. via `import { CUE_CATEGORY } from "@/lib/audio"`) get a usable value.
// Values match the real module to avoid surprising any test that imports it.
export const CUE_CATEGORY: Record<TimerCue, AudioCategory> = {
  work_start: "timer",
  rest_start: "timer",
  tick: "timer",
  minute: "timer",
  warning: "timer",
  complete: "timer",
  set_complete: "feedback",
}

// Public function surface — all auto-mocked. Resolve to `undefined` so the
// promise-returning APIs can be `await`ed without behaviour changes in tests.
export const preload = jest.fn().mockResolvedValue(undefined)
export const play = jest.fn().mockResolvedValue(undefined)
export const unload = jest.fn().mockResolvedValue(undefined)
export const setEnabled = jest.fn()
export const isEnabled = jest.fn(() => true)
