import { Pressable, StyleSheet, View } from "react-native"
import { Text } from "@/components/ui/text"
import type { Status } from "../../lib/timer"
import { radii } from "../../constants/design-tokens"

type TimerControlsProps = {
  status: Status
  startLabel: string
  startA11y: string
  onStart: () => void
  onReset: () => void
  colors: {
    primary: string
    onPrimary: string
    surfaceVariant: string
    onSurfaceVariant: string
  }
}

export function TimerControls({ status, startLabel, startA11y, onStart, onReset, colors }: TimerControlsProps) {
  return (
    <View style={styles.controls}>
      <Pressable
        onPress={onStart}
        style={[styles.btn, { backgroundColor: colors.primary }]}
        accessibilityLabel={startA11y}
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
      >
        <Text variant="subtitle" style={{ color: colors.onPrimary }}>
          {startLabel}
        </Text>
      </Pressable>
      {(status === "paused" || status === "completed") && (
        <Pressable
          onPress={onReset}
          style={[styles.btn, { backgroundColor: colors.surfaceVariant }]}
          accessibilityLabel="Reset timer"
          accessibilityRole="button"
          accessibilityState={{ disabled: false }}
        >
          <Text variant="subtitle" style={{ color: colors.onSurfaceVariant }}>
            Reset
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  btn: {
    minWidth: 120,
    minHeight: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
})
