import { ScrollView, StyleSheet } from "react-native"
import { Stack } from "expo-router"
import Animated, { useReducedMotion } from "react-native-reanimated"
import { useThemeColors } from "@/hooks/useThemeColors"
import { useTimerEngine } from "@/hooks/useTimerEngine"
import { useTimerAnimation } from "@/hooks/useTimerAnimation"
import { TimerBody } from "@/components/timer/TimerBody"
import { TimerControls } from "@/components/timer/TimerControls"

export function TimerContent() {
  const colors = useThemeColors()
  const reduced = useReducedMotion()
  const engine = useTimerEngine()
  const { phase, status, remaining } = engine.state

  const { bgStyle, bgColor, ringProgress } = useTimerAnimation({ phase, status, remaining, currentProgress: engine.currentProgress, reduced, colors })

  return (
    <Animated.View style={[styles.container, bgStyle]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TimerBody
            engine={engine}
            bgColor={bgColor}
            ringProgress={ringProgress}
            colors={colors}
          />

          <TimerControls status={status} startLabel={engine.startLabel} startA11y={engine.startA11y} onStart={engine.handleStart} onReset={engine.handleReset} colors={colors} />
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
})
