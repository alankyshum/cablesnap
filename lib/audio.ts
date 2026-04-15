import { createAudioPlayer, setAudioModeAsync } from "expo-audio"
import type { AudioPlayer, AudioSource } from "expo-audio"

export type TimerCue =
  | "work_start"
  | "rest_start"
  | "tick"
  | "minute"
  | "warning"
  | "complete"

const SOURCES: Record<TimerCue, AudioSource> = {
  work_start: require("../assets/sounds/beep_high.wav"),
  rest_start: require("../assets/sounds/beep_low.wav"),
  tick: require("../assets/sounds/tick.wav"),
  minute: require("../assets/sounds/beep_high.wav"),
  warning: require("../assets/sounds/warning.wav"),
  complete: require("../assets/sounds/complete.wav"),
}

let players: Map<TimerCue, AudioPlayer> | null = null
let enabled = true
let loading = false

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

export async function play(cue: TimerCue): Promise<void> {
  if (!enabled) return
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

export function setEnabled(val: boolean): void {
  enabled = val
}

export function isEnabled(): boolean {
  return enabled
}
