import { useEffect } from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"
import { Text } from "@/components/ui/text"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Icon } from "@/components/ui/icon"
import { Play, Pause } from "lucide-react-native"
import { Stack } from "expo-router"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated"
import { phaseLabel, roundLabel } from "../../lib/timer"
import { hexToRgb } from "../../lib/format"
import { radii } from "../../constants/design-tokens"
import { useThemeColors } from "@/hooks/useThemeColors"
import { useTimerEngine } from "@/hooks/useTimerEngine"
import { TimerRing } from "@/components/timer/TimerRing"
import { ConfigPanel } from "@/components/timer/ConfigPanel"
import { TimerControls } from "@/components/timer/TimerControls"

export function TimerContent() {
  const colors = useThemeColors()
  const reduced = useReducedMotion()
  const {
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
  } = useTimerEngine()

  // Animated values
  const bgOpacity = useSharedValue(0)
  const isWork = useSharedValue(true)
  const ringProgress = useSharedValue(0)

  const { phase, status, remaining } = state
  useEffect(() => {
    const dur = reduced ? 0 : 300
    bgOpacity.value = withTiming(status === "running" ? 0.15 : 0, { duration: dur })
    isWork.value = phase === "work"
    ringProgress.value = withTiming(currentProgress, { duration: dur })
  }, [remaining, phase, status, reduced, bgOpacity, isWork, ringProgress, currentProgress])

  const phaseColorMap = { work: colors.primary, rest: colors.error } as const
  const bgColor = phaseColorMap[phase as keyof typeof phaseColorMap] ?? "transparent"

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: isWork.value
      ? `rgba(${hexToRgb(colors.primary)}, ${bgOpacity.value})`
      : `rgba(${hexToRgb(colors.error)}, ${bgOpacity.value})`,
  }))

  const phaseIconMap = { work: Play, rest: Pause } as const
  const PhaseIcon = phaseIconMap[phase as keyof typeof phaseIconMap]

  return (
    <Animated.View style={[styles.container, bgStyle]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Mode selector */}
          {!active && (
            <SegmentedControl
              value={mode}
              onValueChange={handleMode}
              buttons={[
                { value: "tabata", label: "Tabata" },
                { value: "emom", label: "EMOM" },
                { value: "amrap", label: "AMRAP" },
              ]}
              style={styles.modes}
            />
          )}

          {/* Config steppers */}
          {status === "idle" && (
            <ConfigPanel mode={mode} config={state.config} onAdjust={adjust} />
          )}

          {/* Phase label */}
          {active && (
            <View style={styles.phaseRow}>
              {PhaseIcon && (
                <Pressable style={{ margin: 0 }}>
                  <Icon name={PhaseIcon} size={20} color={bgColor} />
                </Pressable>
              )}
              <Text
                variant="subtitle"
                style={[styles.phaseText, { color: bgColor }]}
                accessibilityRole="text"
              >
                {phaseLabel(state)}
              </Text>
            </View>
          )}

          {/* Pause message */}
          {pauseMsg !== "" && status === "paused" && (
            <Text variant="body" style={styles.pauseMsg}>
              {pauseMsg}
            </Text>
          )}

          {/* Timer display with progress ring */}
          <TimerRing
            remaining={remaining}
            bgColor={bgColor}
            ringProgress={ringProgress}
            colors={colors}
          />

          {/* Round label */}
          {(status === "running" || status === "paused") && (
            <Text
              variant="subtitle"
              style={[styles.rounds, { color: colors.onSurfaceVariant }]}
            >
              {roundLabel(state)}
            </Text>
          )}

          {/* Completed */}
          {status === "completed" && (
            <Text
              variant="heading"
              style={[styles.done, { color: colors.primary }]}
              accessibilityRole="text"
            >
              Complete!
            </Text>
          )}

          {/* AMRAP +1 Round */}
          {mode === "amrap" && status === "running" && (
            <Pressable
              onPress={handleAddRound}
              style={[styles.addRound, { backgroundColor: colors.primaryContainer }]}
              accessibilityLabel={`Add round. Current: ${state.amrapRounds} rounds`}
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
            >
              <Text variant="title" style={{ color: colors.onPrimaryContainer }}>
                +1 Round
              </Text>
            </Pressable>
          )}

          {/* Controls */}
          <TimerControls
            status={status}
            startLabel={startLabel}
            startA11y={startA11y}
            onStart={handleStart}
            onReset={handleReset}
            colors={colors}
          />
      </ScrollView>
    </Animated.View>
  )
}

export default function TimerScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Interval Timer" }} />
      <TimerContent />
    </>
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
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
})
