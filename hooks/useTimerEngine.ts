import React, { useCallback, useEffect, useRef, useState } from "react"
import { AccessibilityInfo, AppState } from "react-native"
import { useToast } from "@/components/ui/bna-toast"
import { useFocusEffect } from "expo-router"
import * as Haptics from "expo-haptics"
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake"
import {
  play as playAudio,
  unload as unloadAudio,
  setEnabled as setAudioEnabled,
} from "../lib/audio"
import {
  init,
  start,
  pause,
  resume,
  reset,
  addRound,
  tick,
  format,
  clamp,
  progress,
  pauseDuration,
  type Mode,
  type State,
  type Config,
  type TabataConfig,
  type EmomConfig,
  type AmrapConfig,
} from "../lib/timer"
import { getAppSetting, setAppSetting } from "../lib/db"

const DEBOUNCE = 300

const STORAGE_KEYS: Record<Mode, string> = {
  tabata: "timer_tabata_config",
  emom: "timer_emom_config",
  amrap: "timer_amrap_config",
}

function handleTickTransition(
  transition: string | undefined,
  timeoutRefs: React.MutableRefObject<ReturnType<typeof setTimeout>[]>,
) {
  if (transition === "work") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    const t = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150)
    timeoutRefs.current.push(t)
    playAudio("work_start")
  } else if (transition === "rest") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    playAudio("rest_start")
  } else if (transition === "minute") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    playAudio("minute")
  } else if (transition === "warning30" || transition === "warning10") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    playAudio("warning")
  } else if (transition === "completed") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    const t1 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150)
    const t2 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300)
    timeoutRefs.current.push(t1, t2)
    playAudio("complete")
  }
}

function adjustConfig(state: State, field: string, delta: number): State {
  const cfg = { ...state.config }
  if (state.mode === "tabata") {
    const tc = cfg as TabataConfig
    if (field === "work") tc.work = clamp(tc.work + delta, 5, 60)
    if (field === "rest") tc.rest = clamp(tc.rest + delta, 5, 60)
    if (field === "rounds") tc.rounds = clamp(tc.rounds + delta, 1, 20)
  } else if (state.mode === "emom") {
    const ec = cfg as EmomConfig
    if (field === "minutes") ec.minutes = clamp(ec.minutes + delta, 1, 60)
  } else {
    const ac = cfg as AmrapConfig
    if (field === "minutes") ac.minutes = clamp(ac.minutes + delta, 1, 60)
  }
  return init(state.mode, cfg)
}

const STATUS_LABELS: Record<string, { label: string; a11y: string }> = {
  idle: { label: "Start", a11y: "Start timer" },
  completed: { label: "Start", a11y: "Start timer" },
  running: { label: "Pause", a11y: "Pause timer" },
  paused: { label: "Resume", a11y: "Resume timer" },
}

export function useTimerEngine() {
  const [mode, setMode] = useState<Mode>("tabata")
  const [state, setState] = useState<State>(init("tabata"))
  const [pauseMsg, setPauseMsg] = useState("")
  const toast = useToast()
  const lastTap = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  const appRef = useRef(state)
  useEffect(() => { appRef.current = state })

  const active = state.status === "running" || state.status === "paused"

  useFocusEffect(
    useCallback(() => {
      getAppSetting("timer_sound_enabled").then((val) => {
        setAudioEnabled(val !== "false")
      }).catch(() => {
        setAudioEnabled(true)
        toast.error("Could not load sound setting")
      })
      return () => { unloadAudio() }
    }, [toast])
  )

  // Keep awake only when timer is active
  const wakeLockActive = useRef(false)
  useEffect(() => {
    if (active) {
      activateKeepAwakeAsync()
        .then(() => { wakeLockActive.current = true })
        .catch(() => {})
    } else if (wakeLockActive.current) {
      deactivateKeepAwake()
      wakeLockActive.current = false
    }
    return () => {
      if (wakeLockActive.current) {
        deactivateKeepAwake()
        wakeLockActive.current = false
      }
    }
  }, [active])

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await getAppSetting(STORAGE_KEYS[mode])
          if (raw) {
            const cfg = JSON.parse(raw) as Config
            setState(init(mode, cfg))
          }
        } catch {
          toast.error("Could not load saved settings")
        }
      })()
    }, [mode, toast])
  )

  // Save config on start
  const save = useCallback(async (m: Mode, cfg: Config) => {
    try {
      await setAppSetting(STORAGE_KEYS[m], JSON.stringify(cfg))
    } catch {
      toast.error("Could not save settings")
    }
  }, [toast])

  useEffect(() => {
    if (state.status !== "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      const result = tick(appRef.current, Date.now())
      handleTickTransition(result.transition, timeoutRefs)
      setState(result.state)
    }, 200)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      timeoutRefs.current.forEach(clearTimeout)
      timeoutRefs.current = []
    }
  }, [state.status])

  useEffect(() => {
    const sub = AppState.addEventListener("change", next => {
      if (next === "background" || next === "inactive") {
        if (appRef.current.status === "running") {
          setState(prev => pause(prev, Date.now()))
        }
      } else if (next === "active") {
        if (appRef.current.status === "paused" && appRef.current.pausedAt) {
          const secs = pauseDuration(appRef.current, Date.now())
          setPauseMsg(`Paused for ${format(secs)}`)
        }
      }
    })
    return () => sub.remove()
  }, [])

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (appRef.current.status === "running") {
          setState(prev => pause(prev, Date.now()))
        }
      }
    }, [])
  )

  useEffect(() => {
    if (state.status !== "running") return
    const r = state.remaining
    if ([10, 5, 3, 2, 1].includes(r)) {
      const label = `${r} second${r === 1 ? "" : "s"} remaining`
      AccessibilityInfo.announceForAccessibility(label)
    }
  }, [state.remaining, state.status])

  const debounced = useCallback((fn: () => void) => {
    const now = Date.now()
    if (now - lastTap.current < DEBOUNCE) return
    lastTap.current = now
    fn()
  }, [])

  const handleStart = useCallback(() => {
    debounced(() => {
      if (state.status === "idle") {
        save(mode, state.config)
        setState(prev => start(prev, Date.now()))
        setPauseMsg("")
      } else if (state.status === "completed") {
        save(mode, state.config)
        setState(prev => start(reset(prev), Date.now()))
        setPauseMsg("")
      } else if (state.status === "running") {
        setState(prev => pause(prev, Date.now()))
      } else if (state.status === "paused") {
        setState(prev => resume(prev, Date.now()))
        setPauseMsg("")
      }
    })
  }, [state.status, mode, state.config, debounced, save])

  const handleReset = useCallback(() => {
    debounced(() => {
      setState(prev => reset(prev))
      setPauseMsg("")
    })
  }, [debounced])

  const handleAddRound = useCallback(() => {
    debounced(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setState(prev => addRound(prev))
    })
  }, [debounced])

  const handleMode = useCallback((m: string) => {
    const next = m as Mode
    setMode(next)
    setState(init(next))
    setPauseMsg("")
  }, [])

  const adjust = useCallback((field: string, delta: number) => {
    setState(prev => adjustConfig(prev, field, delta))
  }, [])

  const currentProgress = progress(state)

  const { label: startLabel, a11y: startA11y } = STATUS_LABELS[state.status] ?? STATUS_LABELS.idle

  return {
    mode,
    state,
    pauseMsg,
    active,
    currentProgress,
    startLabel,
    startA11y,
    handleStart,
    handleReset,
    handleAddRound,
    handleMode,
    adjust,
  }
}
