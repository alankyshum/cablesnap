import { Audio } from "expo-av"
import type { AVPlaybackSource } from "expo-av"

export type TimerCue =
  | "work_start"
  | "rest_start"
  | "tick"
  | "minute"
  | "warning"
  | "complete"

const SOURCES: Record<TimerCue, AVPlaybackSource> = {
  work_start: require("../assets/sounds/beep_high.wav"),
  rest_start: require("../assets/sounds/beep_low.wav"),
  tick: require("../assets/sounds/tick.wav"),
  minute: require("../assets/sounds/beep_high.wav"),
  warning: require("../assets/sounds/warning.wav"),
  complete: require("../assets/sounds/complete.wav"),
}

let sounds: Map<TimerCue, Audio.Sound> | null = null
let enabled = true
let loading = false

async function load(): Promise<Map<TimerCue, Audio.Sound>> {
  if (sounds) return sounds
  if (loading) return new Map()
  loading = true
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: false })
    const map = new Map<TimerCue, Audio.Sound>()
    const cues = Object.keys(SOURCES) as TimerCue[]
    await Promise.all(
      cues.map(async (cue) => {
        const { sound } = await Audio.Sound.createAsync(SOURCES[cue])
        map.set(cue, sound)
      }),
    )
    sounds = map
    return map
  } catch (err) {
    if (__DEV__) console.warn("audio: failed to load sounds", err)
    return new Map()
  } finally {
    loading = false
  }
}

export async function play(cue: TimerCue): Promise<void> {
  if (!enabled) return
  try {
    const map = await load()
    const sound = map.get(cue)
    if (!sound) return
    await sound.replayAsync()
  } catch (err) {
    if (__DEV__) console.warn("audio: playback error", err)
  }
}

export async function unload(): Promise<void> {
  if (!sounds) return
  const map = sounds
  sounds = null
  for (const sound of map.values()) {
    try {
      await sound.unloadAsync()
    } catch {
      // ignore cleanup errors
    }
  }
}

export function setEnabled(val: boolean): void {
  enabled = val
}

export function isEnabled(): boolean {
  return enabled
}
