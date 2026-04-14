import { useCallback, useMemo, useState } from "react"
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native"
import {
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper"
import { Stack, useLocalSearchParams } from "expo-router"
import { useFocusEffect } from "expo-router"
import { getBodySettings } from "../../lib/db"
import {
  solve,
  perSide,
  kgToLb,
  lbToKg,
  summarize,
  color,
  KG_PLATES,
  LB_PLATES,
  KG_BARS,
  LB_BARS,
} from "../../lib/plates"

const HEIGHT: Record<number, number> = {
  25: 80, 55: 80,
  20: 72, 45: 72,
  15: 64, 35: 64,
  10: 56,
  5: 48,
  2.5: 40,
  1.25: 34,
  0.5: 28, 1: 28,
}

function plateHeight(w: number): number {
  return HEIGHT[w] ?? 40
}

export default function PlateCalculator() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ weight?: string; unit?: string }>()
  const [unit, setUnit] = useState<"kg" | "lb">("kg")
  const [target, setTarget] = useState(params.weight ?? "")
  const [bar, setBar] = useState<number | null>(null)
  const [custom, setCustom] = useState("")
  const [ready, setReady] = useState(false)

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const body = await getBodySettings()
        const u = (params.unit === "lb" || params.unit === "kg") ? params.unit : body.weight_unit
        setUnit(u as "kg" | "lb")
        setBar(u === "kg" ? 20 : 45)
        if (params.weight) setTarget(params.weight)
        setReady(true)
      })()
    }, [])
  )

  const presets = unit === "kg" ? KG_BARS : LB_BARS
  const denoms = unit === "kg" ? KG_PLATES : LB_PLATES
  const active = custom !== "" ? parseFloat(custom) : bar

  const parsed = parseFloat(target)
  const valid = !isNaN(parsed) && parsed > 0

  const state = useMemo(() => {
    if (!valid || active == null || isNaN(active)) return null
    if (parsed <= active) return { error: parsed === active ? "empty" as const : "low" as const }
    const side = perSide(parsed, active)
    const result = solve(side, denoms)
    const grouped = summarize(result.plates)
    const achieved = active + result.plates.reduce((a, b) => a + b, 0) * 2
    return { side, result, grouped, achieved, rounded: result.remainder > 0 }
  }, [valid, parsed, active, denoms])

  const label = unit === "kg" ? "kilograms" : "pounds"

  function switchUnit(u: string) {
    const next = u as "kg" | "lb"
    if (next === unit) return
    if (valid) {
      const converted = next === "lb" ? kgToLb(parsed) : lbToKg(parsed)
      setTarget(String(converted))
    }
    setBar(next === "kg" ? 20 : 45)
    setCustom("")
    setUnit(next)
  }

  function selectBar(val: number) {
    setBar(val)
    setCustom("")
  }

  const diagram = state && !("error" in state) ? state.result.plates : []
  const barbell = useMemo(() => {
    if (!state || "error" in state) return ""
    if (state.grouped.length === 0) return "Empty barbell, total " + active + " " + unit
    const desc = state.grouped.map(function(g) { return g.count + "\u00d7" + g.weight + unit }).join(", ")
    return "Barbell loaded with " + desc + " on each side, total " + state.achieved + " " + unit
  }, [state, active, unit])

  const items = useMemo(() => {
    if (!state || "error" in state) return []
    return state.grouped
  }, [state])

  function renderPlate({ item: g }: { item: { weight: number; count: number } }) {
    const c = color(g.weight, unit)
    return (
      <View style={styles.row}>
        <View
          style={[
            styles.swatch,
            {
              backgroundColor: c.bg,
              borderColor: c.border ? theme.colors[c.border] : "transparent",
              borderWidth: c.border ? 1 : 0,
            },
          ]}
        />
        <Text variant="bodyLarge" style={{ color: theme.colors.onBackground }}>
          {g.count}× {g.weight}{unit}
        </Text>
      </View>
    )
  }

  const header = (
    <>
      {/* Unit toggle */}
      <View accessibilityRole="radiogroup" accessibilityLabel="Unit system">
        <SegmentedButtons
          value={unit}
          onValueChange={switchUnit}
          buttons={[
            { value: "kg", label: "kg", accessibilityLabel: "Kilograms" },
            { value: "lb", label: "lb", accessibilityLabel: "Pounds" },
          ]}
          style={styles.segment}
        />
      </View>

      {/* Target weight */}
      <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginTop: 16, marginBottom: 8 }}>
        Target Weight
      </Text>
      <TextInput
        mode="outlined"
        keyboardType="numeric"
        value={target}
        onChangeText={setTarget}
        placeholder="0"
        right={<TextInput.Affix text={unit} />}
        style={styles.input}
        accessibilityLabel={"Target weight in " + label}
      />

      {/* Bar weight */}
      <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginTop: 16, marginBottom: 8 }}>
        Bar Weight
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Bar weight selection" style={styles.bars}>
        {presets.map(p => (
          <View
            key={p}
            accessibilityRole="radio"
            accessibilityState={{ selected: custom === "" && bar === p }}
            style={{ minWidth: 48, minHeight: 48 }}
          >
            <SegmentedButtons
              value={custom === "" && bar === p ? String(p) : ""}
              onValueChange={() => selectBar(p)}
              buttons={[{ value: String(p), label: p + unit }]}
              density="medium"
            />
          </View>
        ))}
        <TextInput
          mode="outlined"
          keyboardType="numeric"
          value={custom}
          onChangeText={v => { setCustom(v); setBar(null) }}
          placeholder="Custom"
          dense
          style={[styles.custom, { minHeight: 48 }]}
          right={<TextInput.Affix text={unit} />}
          accessibilityLabel={"Custom bar weight in " + label}
        />
      </View>

      {/* Results */}
      <View accessibilityLiveRegion="polite" style={styles.results}>
        {!valid && target === "" && (
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 24 }}>
            Enter a target weight
          </Text>
        )}

        {!valid && target !== "" && (
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: "center", marginTop: 16 }}>
            Enter a valid weight
          </Text>
        )}

        {valid && state && "error" in state && state.error === "low" && (
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: "center", marginTop: 16 }}>
            Weight must exceed bar weight
          </Text>
        )}

        {valid && state && "error" in state && state.error === "empty" && (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 16 }}>
            Target equals bar weight — no plates needed
          </Text>
        )}

        {state && !("error" in state) && (
          <>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 12 }}>
              ({parsed} − {active}) ÷ 2 = {state.side} {unit} per side
            </Text>

            {state.rounded && (
              <Text variant="bodySmall" style={{ color: theme.colors.tertiary, textAlign: "center", marginTop: 4 }}>
                Rounded to {state.achieved}{unit} (nearest achievable)
              </Text>
            )}

            {/* Barbell diagram */}
            <Barbell plates={diagram} unit={unit} barbell={barbell} />
          </>
        )}
      </View>
    </>
  )

  const footer = state && !("error" in state) ? (
    <Text variant="titleMedium" style={{ color: theme.colors.onBackground, textAlign: "center", marginTop: 16 }}>
      Total: {state.achieved}{unit}
      {active != null && (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {" "}(bar {active}{unit} + 2×{state.side}{unit})
        </Text>
      )}
    </Text>
  ) : null

  if (!ready) return null

  return (
    <>
      <Stack.Screen options={{ title: "Plate Calculator" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <FlatList
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          data={items}
          keyExtractor={g => String(g.weight)}
          renderItem={renderPlate}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
        />
      </KeyboardAvoidingView>
    </>
  )
}

function PlateView({ weight, unit }: { weight: number; unit: "kg" | "lb" }) {
  const theme = useTheme()
  const c = color(weight, unit)
  return (
    <View
      style={[
        plateStyles.plate,
        {
          height: plateHeight(weight),
          backgroundColor: c.bg,
          borderColor: c.border ? theme.colors[c.border] : "transparent",
          borderWidth: c.border ? 1 : 0,
        },
      ]}
    />
  )
}

function Barbell({ plates, unit, barbell: label }: { plates: number[]; unit: "kg" | "lb"; barbell: string }) {
  const theme = useTheme()
  return (
    <View
      style={plateStyles.barbell}
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <View style={plateStyles.side}>
        {[...plates].reverse().map((p, i) => (
          <PlateView key={"l" + i} weight={p} unit={unit} />
        ))}
      </View>
      <View style={[plateStyles.bar, { backgroundColor: theme.colors.outlineVariant }]} />
      <View style={plateStyles.side}>
        {plates.map((p, i) => (
          <PlateView key={"r" + i} weight={p} unit={unit} />
        ))}
      </View>
    </View>
  )
}

const plateStyles = StyleSheet.create({
  barbell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 12,
    minHeight: 100,
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
  },
  plate: {
    width: 22,
    borderRadius: 3,
    marginHorizontal: 1,
  },
  bar: {
    width: 60,
    height: 8,
    borderRadius: 2,
  },
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  segment: {
    marginTop: 8,
  },
  input: {
    fontSize: 18,
  },
  bars: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  custom: {
    flex: 1,
    minWidth: 100,
    fontSize: 14,
  },
  results: {
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
})
