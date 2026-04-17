import { useCallback, useMemo, useState } from "react"
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native"
import {
  Chip,
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
  summarize,
  color,
  KG_PLATES,
  LB_PLATES,
  KG_BARS,
  LB_BARS,
} from "../../lib/plates"
import { radii } from "../../constants/design-tokens"

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

export function PlateCalculatorContent({ initialWeight }: { initialWeight?: string }) {
  const theme = useTheme()
  const [unit, setUnit] = useState<"kg" | "lb">("kg")
  const [target, setTarget] = useState(initialWeight ?? "")
  const [bar, setBar] = useState<number | null>(null)
  const [custom, setCustom] = useState("")
  const [ready, setReady] = useState(false)

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const body = await getBodySettings()
          setUnit(body.weight_unit)
          setBar(body.weight_unit === "kg" ? 20 : 45)
          if (initialWeight) setTarget(initialWeight)
        } catch {
          // Fall back to defaults if settings unavailable
          setBar(20)
        }
        setReady(true)
      })()
    }, [initialWeight])
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

  const sortedPresets = useMemo(() => [...presets].sort((a, b) => a - b), [presets])

  if (!ready) return null

  return (
    <View>
      {/* [target] with [bar] */}
      <View style={styles.inputRow}>
        <View style={styles.targetWrap}>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={target}
            onChangeText={setTarget}
            placeholder="Total"
            dense
            right={<TextInput.Affix text={unit} />}
            accessibilityLabel={"Target weight in " + label}
          />
        </View>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          with bar
        </Text>
        <View style={styles.barWrap} accessibilityRole="radiogroup" accessibilityLabel="Bar weight selection">
          <View style={styles.barInputWrap}>
            <TextInput
              mode="outlined"
              keyboardType="numeric"
              value={custom !== "" ? custom : bar != null ? String(bar) : ""}
              onChangeText={v => {
                const num = parseFloat(v)
                if (v === "" || isNaN(num)) {
                  setCustom("")
                  setBar(presets[presets.length - 1])
                } else if ((presets as readonly number[]).includes(num)) {
                  setCustom("")
                  setBar(num)
                } else {
                  setCustom(v)
                  setBar(null)
                }
              }}
              placeholder="Bar"
              dense
              right={<TextInput.Affix text={unit} />}
              accessibilityLabel={"Bar weight in " + label}
            />
          </View>
          {sortedPresets.map(p => (
            <Chip
              key={p}
              selected={custom === "" && bar === p}
              showSelectedOverlay
              onPress={() => selectBar(p)}
              compact
              accessibilityRole="radio"
              accessibilityState={{ selected: custom === "" && bar === p }}
              accessibilityLabel={p + " " + label + " bar"}
            >{p}</Chip>
          ))}
        </View>
      </View>

      {/* Barbell always visible */}
      <Barbell plates={diagram} unit={unit} barbell={barbell || "Empty barbell"} />

      {/* Results */}
      <View accessibilityLiveRegion="polite">
        {!valid && target !== "" && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, textAlign: "center" }}>
            Enter a valid weight
          </Text>
        )}

        {valid && state && "error" in state && state.error === "low" && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, textAlign: "center" }}>
            Weight must exceed bar weight
          </Text>
        )}

        {valid && state && "error" in state && state.error === "empty" && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
            Target equals bar weight — no plates needed
          </Text>
        )}

        {state && !("error" in state) && (
          <>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
              ({parsed} − {active}) ÷ 2 = {state.side} {unit} per side
            </Text>

            {state.rounded && (
              <Text variant="bodySmall" style={{ color: theme.colors.tertiary, textAlign: "center", marginTop: 2 }}>
                Rounded to {state.achieved}{unit} (nearest achievable)
              </Text>
            )}
          </>
        )}
      </View>

      {/* Plate list */}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.weight)}
        scrollEnabled={false}
        renderItem={({ item: g }) => {
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
        }}
      />

      {/* Footer */}
      {state && !("error" in state) && (
        <Text variant="titleMedium" style={{ color: theme.colors.onBackground, textAlign: "center", marginTop: 16 }}>
          Total: {state.achieved}{unit}
          {active != null && (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {" "}(bar {active}{unit} + 2×{state.side}{unit})
            </Text>
          )}
        </Text>
      )}
    </View>
  )
}

export default function PlateCalculator() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ weight?: string }>()

  return (
    <>
      <Stack.Screen options={{ title: "Plate Calculator" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <FlatList
          data={[]}
          renderItem={null}
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={<PlateCalculatorContent initialWeight={params.weight} />}
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
    marginTop: 12,
    marginBottom: 8,
    minHeight: 80,
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
  },
  plate: {
    width: 22,
    borderRadius: radii.sm,
    marginHorizontal: 1,
  },
  bar: {
    width: 60,
    height: 8,
    borderRadius: radii.sm,
  },
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  targetWrap: {
    width: 130,
  },
  barWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  barInputWrap: {
    width: 90,
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
