import { Pressable, StyleSheet } from "react-native"
import { Text } from "@/components/ui/text"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { type SharedValue } from "react-native-reanimated"
import { roundLabel } from "@/lib/timer"
import { radii } from "@/constants/design-tokens"
import { type ThemeColors } from "@/hooks/useThemeColors"
import { type useTimerEngine } from "@/hooks/useTimerEngine"
import { TimerRing } from "./TimerRing"
import { PhaseIndicator } from "./PhaseIndicator"
import { ConfigPanel } from "./ConfigPanel"

type TimerEngine = ReturnType<typeof useTimerEngine>

const modeButtons = [
  { value: "tabata", label: "Tabata" },
  { value: "emom", label: "EMOM" },
  { value: "amrap", label: "AMRAP" },
] as const

interface TimerBodyProps {
  engine: TimerEngine
  bgColor: string
  ringProgress: SharedValue<number>
  colors: ThemeColors
}

export function TimerBody({ engine, bgColor, ringProgress, colors }: TimerBodyProps) {
  const { state, active, mode, pauseMsg, handleAddRound, handleMode, adjust } = engine
  const { phase, status, remaining } = state
  const showRoundLabel = status === "running" || status === "paused"
  return (
    <>
      {!active && (
        <SegmentedControl value={mode} onValueChange={handleMode} buttons={modeButtons} style={styles.modes} />
      )}

      {status === "idle" && <ConfigPanel mode={mode} config={state.config} onAdjust={adjust} />}

      {active && <PhaseIndicator phase={phase} bgColor={bgColor} state={state} />}

      {pauseMsg !== "" && status === "paused" && (
        <Text variant="body" style={styles.pauseMsg}>{pauseMsg}</Text>
      )}

      <TimerRing remaining={remaining} bgColor={bgColor} ringProgress={ringProgress} colors={colors} />

      {showRoundLabel && (
        <Text variant="subtitle" style={[styles.rounds, { color: colors.onSurfaceVariant }]}>
          {roundLabel(state)}
        </Text>
      )}

      {status === "completed" && (
        <Text variant="heading" style={[styles.done, { color: colors.primary }]} accessibilityRole="text">
          Complete!
        </Text>
      )}

      {mode === "amrap" && status === "running" && (
        <Pressable
          onPress={handleAddRound}
          style={[styles.addRound, { backgroundColor: colors.primaryContainer }]}
          accessibilityLabel={`Add round. Current: ${state.amrapRounds} rounds`}
          accessibilityRole="button"
        >
          <Text variant="title" style={{ color: colors.onPrimaryContainer }}>+1 Round</Text>
        </Pressable>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  modes: {
    marginBottom: 16,
    alignSelf: "stretch",
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
