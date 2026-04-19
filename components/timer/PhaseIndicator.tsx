import { Pressable, StyleSheet, View } from "react-native"
import { Text } from "@/components/ui/text"
import { Icon } from "@/components/ui/icon"
import { Play, Pause } from "lucide-react-native"
import { phaseLabel } from "@/lib/timer"
import { type useTimerEngine } from "@/hooks/useTimerEngine"

const phaseIconMap = { work: Play, rest: Pause } as const
type TimerState = ReturnType<typeof useTimerEngine>["state"]

export function PhaseIndicator({ phase, bgColor, state }: { phase: string; bgColor: string; state: TimerState }) {
  const PhaseIcon = phaseIconMap[phase as keyof typeof phaseIconMap]
  return (
    <View style={styles.phaseRow}>
      {PhaseIcon && (
        <Pressable style={{ margin: 0 }}>
          <Icon name={PhaseIcon} size={20} color={bgColor} />
        </Pressable>
      )}
      <Text variant="subtitle" style={[styles.phaseText, { color: bgColor }]} accessibilityRole="text">
        {phaseLabel(state)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  phaseText: {
    fontWeight: "700",
    letterSpacing: 2,
  },
})
