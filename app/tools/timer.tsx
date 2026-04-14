import { useCallback, useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native"
import {
  IconButton,
  SegmentedButtons,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper"
import { Stack } from "expo-router"
import { useFocusEffect } from "expo-router"
import * as Haptics from "expo-haptics"
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake"
import { play as playAudio, unload as unloadAudio, setEnabled as setAudioEnabled } from "../../lib/audio"
import Svg, { Circle } from "react-native-svg"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
  useAnimatedProps,
} from "react-native-reanimated"
import {
  init,
  start,
  pause,
  resume,
  reset,
  addRound,
  tick,
  format,
  roundLabel,
  phaseLabel,
  pauseDuration,
  clamp,
  progress,
  type Mode,
  type State,
  type TabataConfig,
  type EmomConfig,
  type AmrapConfig,
  type Config,
} from "../../lib/timer"
import { getAppSetting, setAppSetting } from "../../lib/db"
import { hexToRgb } from "../../lib/format"

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const DEBOUNCE = 300
const RING_SIZE = 220
const RING_STROKE = 8
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const STORAGE_KEYS: Record<Mode, string> = {
  tabata: "timer_tabata_config",
  emom: "timer_emom_config",
  amrap: "timer_amrap_config",
}

export default function TimerScreen() {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<Mode>("tabata")
  const [state, setState] = useState<State>(init("tabata"))
  const [pauseMsg, setPauseMsg] = useState("")
  const [error, setError] = useState("")
  const lastTap = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  const appRef = useRef(state)
  useEffect(() => { appRef.current = state })

  const active = state.status === "running" || state.status === "paused"

  // Load timer sound setting
  useFocusEffect(
    useCallback(() => {
      getAppSetting("timer_sound_enabled").then((val) => {
        setAudioEnabled(val !== "false")
      }).catch(() => {
        setAudioEnabled(true)
        setError("Could not load sound setting")
      })
      return () => { unloadAudio() }
    }, [])
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

  // Animated values
  const bgOpacity = useSharedValue(0)
  const isWork = useSharedValue(true)
  const ringProgress = useSharedValue(0)

  // Load saved config
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
          setError("Could not load saved settings")
        }
      })()
    }, [mode])
  )

  // Save config on start
  const save = useCallback(async (m: Mode, cfg: Config) => {
    try {
      await setAppSetting(STORAGE_KEYS[m], JSON.stringify(cfg))
    } catch {
      setError("Could not save settings")
    }
  }, [])

  // Tick interval
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
      if (result.transition === "work") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        const t = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150)
        timeoutRefs.current.push(t)
        playAudio("work_start")
      } else if (result.transition === "rest") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        playAudio("rest_start")
      } else if (result.transition === "minute") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        playAudio("minute")
      } else if (result.transition === "warning30" || result.transition === "warning10") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        playAudio("warning")
      } else if (result.transition === "completed") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        const t1 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150)
        const t2 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300)
        timeoutRefs.current.push(t1, t2)
        playAudio("complete")
      }
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

  // Update animated values
  const currentProgress = progress(state)
  const { phase, status, remaining } = state
  useEffect(() => {
    const dur = reduced ? 0 : 300
    bgOpacity.value = withTiming(status === "running" ? 0.15 : 0, { duration: dur })
    isWork.value = phase === "work"
    ringProgress.value = withTiming(currentProgress, { duration: dur })
  }, [remaining, phase, status, reduced, bgOpacity, isWork, ringProgress, currentProgress])

  // AppState handling
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

  // Focus handling
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (appRef.current.status === "running") {
          setState(prev => pause(prev, Date.now()))
        }
      }
    }, [])
  )

  // Screen reader announcements
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

  // Config steppers
  const adjust = useCallback((field: string, delta: number) => {
    setState(prev => {
      const cfg = { ...prev.config }
      if (prev.mode === "tabata") {
        const tc = cfg as TabataConfig
        if (field === "work") tc.work = clamp(tc.work + delta, 5, 60)
        if (field === "rest") tc.rest = clamp(tc.rest + delta, 5, 60)
        if (field === "rounds") tc.rounds = clamp(tc.rounds + delta, 1, 20)
      } else if (prev.mode === "emom") {
        const ec = cfg as EmomConfig
        if (field === "minutes") ec.minutes = clamp(ec.minutes + delta, 1, 60)
      } else {
        const ac = cfg as AmrapConfig
        if (field === "minutes") ac.minutes = clamp(ac.minutes + delta, 1, 60)
      }
      return init(prev.mode, cfg)
    })
  }, [])

  const bgColor = state.phase === "work"
    ? theme.colors.primary
    : state.phase === "rest"
    ? theme.colors.error
    : "transparent"

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: isWork.value
      ? `rgba(${hexToRgb(theme.colors.primary)}, ${bgOpacity.value})`
      : `rgba(${hexToRgb(theme.colors.error)}, ${bgOpacity.value})`,
  }))

  const ringAnimated = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - ringProgress.value),
  }))

  const startLabel = state.status === "idle" || state.status === "completed"
    ? "Start"
    : state.status === "running"
    ? "Pause"
    : "Resume"

  const startA11y = state.status === "idle" || state.status === "completed"
    ? "Start timer"
    : state.status === "running"
    ? "Pause timer"
    : "Resume timer"

  const phaseIcon = state.phase === "work" ? "play" : state.phase === "rest" ? "pause" : undefined

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Interval Timer" }} />
      <Animated.View style={[styles.container, bgStyle]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Mode selector */}
          {!active && (
            <SegmentedButtons
              value={mode}
              onValueChange={handleMode}
              buttons={[
                { value: "tabata", label: "Tabata", accessibilityLabel: "Tabata mode" },
                { value: "emom", label: "EMOM", accessibilityLabel: "EMOM mode" },
                { value: "amrap", label: "AMRAP", accessibilityLabel: "AMRAP mode" },
              ]}
              style={styles.modes}
            />
          )}

          {/* Config steppers */}
          {state.status === "idle" && (
            <View style={styles.config}>
              {mode === "tabata" && (
                <>
                  <Stepper
                    label="Work"
                    value={(state.config as TabataConfig).work}
                    suffix="s"
                    min={5}
                    max={60}
                    onUp={() => adjust("work", 5)}
                    onDown={() => adjust("work", -5)}
                  />
                  <Stepper
                    label="Rest"
                    value={(state.config as TabataConfig).rest}
                    suffix="s"
                    min={5}
                    max={60}
                    onUp={() => adjust("rest", 5)}
                    onDown={() => adjust("rest", -5)}
                  />
                  <Stepper
                    label="Rounds"
                    value={(state.config as TabataConfig).rounds}
                    suffix=""
                    min={1}
                    max={20}
                    onUp={() => adjust("rounds", 1)}
                    onDown={() => adjust("rounds", -1)}
                  />
                </>
              )}
              {mode === "emom" && (
                <Stepper
                  label="Minutes"
                  value={(state.config as EmomConfig).minutes}
                  suffix="min"
                  min={1}
                  max={60}
                  onUp={() => adjust("minutes", 1)}
                  onDown={() => adjust("minutes", -1)}
                />
              )}
              {mode === "amrap" && (
                <Stepper
                  label="Minutes"
                  value={(state.config as AmrapConfig).minutes}
                  suffix="min"
                  min={1}
                  max={60}
                  onUp={() => adjust("minutes", 1)}
                  onDown={() => adjust("minutes", -1)}
                />
              )}
            </View>
          )}

          {/* Phase label */}
          {active && (
            <View style={styles.phaseRow}>
              {phaseIcon && (
                <IconButton
                  icon={phaseIcon}
                  size={20}
                  iconColor={bgColor}
                  style={{ margin: 0 }}
                />
              )}
              <Text
                variant="titleMedium"
                style={[styles.phaseText, { color: bgColor }]}
                accessibilityRole="text"
              >
                {phaseLabel(state)}
              </Text>
            </View>
          )}

          {/* Pause message */}
          {pauseMsg !== "" && state.status === "paused" && (
            <Text variant="bodyMedium" style={styles.pauseMsg}>
              {pauseMsg}
            </Text>
          )}

          {/* Timer display with progress ring */}
          <View style={styles.ringWrap} accessibilityLabel={`${format(state.remaining)} remaining`}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={theme.colors.surfaceVariant}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={bgColor || theme.colors.primary}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeDasharray={RING_CIRCUMFERENCE}
                animatedProps={ringAnimated}
                strokeLinecap="round"
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>
            <View style={styles.countdown}>
              <Text
                style={[styles.time, { color: theme.colors.onSurface }]}
                accessibilityLabel={`${state.remaining} seconds remaining`}
                accessibilityLiveRegion="polite"
              >
                {format(state.remaining)}
              </Text>
            </View>
          </View>

          {/* Round label */}
          {(state.status === "running" || state.status === "paused") && (
            <Text
              variant="titleMedium"
              style={[styles.rounds, { color: theme.colors.onSurfaceVariant }]}
            >
              {roundLabel(state)}
            </Text>
          )}

          {/* Completed */}
          {state.status === "completed" && (
            <Text
              variant="headlineSmall"
              style={[styles.done, { color: theme.colors.primary }]}
              accessibilityRole="text"
            >
              Complete!
            </Text>
          )}

          {/* AMRAP +1 Round */}
          {mode === "amrap" && state.status === "running" && (
            <Pressable
              onPress={handleAddRound}
              style={[styles.addRound, { backgroundColor: theme.colors.primaryContainer }]}
              accessibilityLabel={`Add round. Current: ${state.amrapRounds} rounds`}
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
            >
              <Text variant="titleLarge" style={{ color: theme.colors.onPrimaryContainer }}>
                +1 Round
              </Text>
            </Pressable>
          )}

          {/* Controls */}
          <View style={styles.controls}>
            <Pressable
              onPress={handleStart}
              style={[styles.btn, { backgroundColor: theme.colors.primary }]}
              accessibilityLabel={startA11y}
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
            >
              <Text variant="titleMedium" style={{ color: theme.colors.onPrimary }}>
                {startLabel}
              </Text>
            </Pressable>
            {(state.status === "paused" || state.status === "completed") && (
              <Pressable
                onPress={handleReset}
                style={[styles.btn, { backgroundColor: theme.colors.surfaceVariant }]}
                accessibilityLabel="Reset timer"
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
              >
                <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Reset
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </Animated.View>
      <Snackbar
        visible={!!error}
        onDismiss={() => setError("")}
        duration={3000}
        accessibilityLiveRegion="polite"
      >
        {error}
      </Snackbar>
    </>
  )
}

// Stepper component
function Stepper({ label, value, suffix, min, max, onUp, onDown }: {
  label: string
  value: number
  suffix: string
  min: number
  max: number
  onUp: () => void
  onDown: () => void
}) {
  const theme = useTheme()
  return (
    <View style={styles.stepper}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
        {label}
      </Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={onDown}
          disabled={value <= min}
          style={[styles.stepBtn, { backgroundColor: theme.colors.surfaceVariant, opacity: value <= min ? 0.4 : 1 }]}
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: value <= min }}
          accessibilityValue={{ min, max, now: value, text: `${value}${suffix}` }}
        >
          <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>−</Text>
        </Pressable>
        <Text
          variant="titleLarge"
          style={[styles.stepVal, { color: theme.colors.onSurface }]}
          accessibilityLabel={`${label}: ${value}${suffix}`}
        >
          {value}{suffix}
        </Text>
        <Pressable
          onPress={onUp}
          disabled={value >= max}
          style={[styles.stepBtn, { backgroundColor: theme.colors.surfaceVariant, opacity: value >= max ? 0.4 : 1 }]}
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: value >= max }}
          accessibilityValue={{ min, max, now: value, text: `${value}${suffix}` }}
        >
          <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: 16,
    alignItems: "center",
  },
  modes: {
    marginBottom: 16,
    alignSelf: "stretch",
  },
  config: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  stepper: {
    alignItems: "center",
    gap: 8,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  stepVal: {
    minWidth: 60,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  phaseText: {
    fontWeight: "700",
    letterSpacing: 2,
  },
  pauseMsg: {
    marginBottom: 8,
    opacity: 0.7,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 16,
  },
  ringSvg: {
    position: "absolute",
  },
  countdown: {
    justifyContent: "center",
    alignItems: "center",
  },
  time: {
    fontSize: 56,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  rounds: {
    marginBottom: 16,
    textAlign: "center",
  },
  done: {
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "700",
  },
  addRound: {
    minWidth: 160,
    minHeight: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  controls: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  btn: {
    minWidth: 120,
    minHeight: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
})
