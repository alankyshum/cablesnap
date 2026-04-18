import { Pressable, StyleSheet, View } from "react-native"
import { Text } from "@/components/ui/text"
import { useThemeColors } from "@/hooks/useThemeColors"
import {
  type Mode,
  type Config,
  type TabataConfig,
  type EmomConfig,
  type AmrapConfig,
} from "../../lib/timer"
import { radii } from "../../constants/design-tokens"

type ConfigPanelProps = {
  mode: Mode
  config: Config
  onAdjust: (field: string, delta: number) => void
}

export function ConfigPanel({ mode, config, onAdjust }: ConfigPanelProps) {
  return (
    <View style={styles.config}>
      {mode === "tabata" && (
        <>
          <Stepper
            label="Work"
            value={(config as TabataConfig).work}
            suffix="s"
            min={5}
            max={60}
            onUp={() => onAdjust("work", 5)}
            onDown={() => onAdjust("work", -5)}
          />
          <Stepper
            label="Rest"
            value={(config as TabataConfig).rest}
            suffix="s"
            min={5}
            max={60}
            onUp={() => onAdjust("rest", 5)}
            onDown={() => onAdjust("rest", -5)}
          />
          <Stepper
            label="Rounds"
            value={(config as TabataConfig).rounds}
            suffix=""
            min={1}
            max={20}
            onUp={() => onAdjust("rounds", 1)}
            onDown={() => onAdjust("rounds", -1)}
          />
        </>
      )}
      {mode === "emom" && (
        <Stepper
          label="Minutes"
          value={(config as EmomConfig).minutes}
          suffix="min"
          min={1}
          max={60}
          onUp={() => onAdjust("minutes", 1)}
          onDown={() => onAdjust("minutes", -1)}
        />
      )}
      {mode === "amrap" && (
        <Stepper
          label="Minutes"
          value={(config as AmrapConfig).minutes}
          suffix="min"
          min={1}
          max={60}
          onUp={() => onAdjust("minutes", 1)}
          onDown={() => onAdjust("minutes", -1)}
        />
      )}
    </View>
  )
}

function Stepper({ label, value, suffix, min, max, onUp, onDown }: {
  label: string
  value: number
  suffix: string
  min: number
  max: number
  onUp: () => void
  onDown: () => void
}) {
  const colors = useThemeColors()
  return (
    <View style={styles.stepper}>
      <Text variant="body" style={{ color: colors.onSurface }}>
        {label}
      </Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={onDown}
          disabled={value <= min}
          style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant, opacity: value <= min ? 0.4 : 1 }]}
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: value <= min }}
          accessibilityValue={{ min, max, now: value, text: `${value}${suffix}` }}
        >
          <Text variant="subtitle" style={{ color: colors.onSurfaceVariant }}>−</Text>
        </Pressable>
        <Text
          variant="title"
          style={[styles.stepVal, { color: colors.onSurface }]}
          accessibilityLabel={`${label}: ${value}${suffix}`}
        >
          {value}{suffix}
        </Text>
        <Pressable
          onPress={onUp}
          disabled={value >= max}
          style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant, opacity: value >= max ? 0.4 : 1 }]}
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: value >= max }}
          accessibilityValue={{ min, max, now: value, text: `${value}${suffix}` }}
        >
          <Text variant="subtitle" style={{ color: colors.onSurfaceVariant }}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepVal: {
    minWidth: 60,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
})
