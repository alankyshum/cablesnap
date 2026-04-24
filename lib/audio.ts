import { createAudioPlayer, setAudioModeAsync } from "expo-audio"
import type { AudioPlayer, AudioSource } from "expo-audio"

export type TimerCue =
  | "work_start"
  | "rest_start"
  | "tick"
  | "minute"
  | "warning"
  | "complete"
  | "set_complete"

export type AudioCategory = "timer" | "feedback"

const SOURCES: Record<TimerCue, AudioSource> = {
  work_start: require("../assets/sounds/beep_high.wav"),
  rest_start: require("../assets/sounds/beep_low.wav"),
  tick: require("../assets/sounds/tick.wav"),
  minute: require("../assets/sounds/beep_high.wav"),
  warning: require("../assets/sounds/warning.wav"),
  complete: require("../assets/sounds/complete.wav"),
  set_complete: require("../assets/sounds/set-complete.wav"),
}

/**
 * Category mapping (BLD-559): separate user-facing toggles for the
 * rest-timer audio (existing) and the set-completion confirmation audio
 * (new). The "timer" category is controlled by the legacy `Timer Sound`
 * switch; "feedback" is controlled by the new `Sound on set complete`
 * switch.
 *
 * Every cue in SOURCES MUST have an entry here — enforced by a Jest
 * completeness test.
 */
export const CUE_CATEGORY: Record<TimerCue, AudioCategory> = {
  work_start: "timer",
  rest_start: "timer",
  tick: "timer",
  minute: "timer",
  warning: "timer",
  complete: "timer",
  set_complete: "feedback",
}

let players: Map<TimerCue, AudioPlayer> | null = null
let loading = false

// Category-scoped enable flags. Defaults match legacy behavior for
// "timer" (on) and plan default for "feedback" (off).
const enabledByCategory: Record<AudioCategory, boolean> = {
  timer: true,
  feedback: false,
}

async function load(): Promise<Map<TimerCue, AudioPlayer>> {
  if (players) return players
  if (loading) return new Map()
  loading = true
  try {
    await setAudioModeAsync({ playsInSilentMode: false })
    const map = new Map<TimerCue, AudioPlayer>()
    const cues = Object.keys(SOURCES) as TimerCue[]
    for (const cue of cues) {
      map.set(cue, createAudioPlayer(SOURCES[cue]))
    }
    players = map
    return map
  } catch (err) {
    if (__DEV__) console.warn("audio: failed to load sounds", err)
    return new Map()
  } finally {
    loading = false
  }
}

/**
 * Eagerly preload all audio players so the first tap is never the load
 * trigger. Safe to call multiple times — subsequent calls are no-ops.
 */
export async function preload(): Promise<void> {
  await load()
}

export async function play(cue: TimerCue): Promise<void> {
  const category = CUE_CATEGORY[cue]
  if (!enabledByCategory[category]) return
  try {
    const map = await load()
    const player = map.get(cue)
    if (!player) return
    player.seekTo(0)
    player.play()
  } catch (err) {
    if (__DEV__) console.warn("audio: playback error", err)
  }
}

export async function unload(): Promise<void> {
  if (!players) return
  const map = players
  players = null
  for (const player of map.values()) {
    try {
      player.release()
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Toggle a specific audio category. */
export function setEnabled(category: AudioCategory, val: boolean): void {
  enabledByCategory[category] = val
}

/** Inspect a specific audio category. */
export function isEnabled(category: AudioCategory): boolean {
  return enabledByCategory[category]
}
