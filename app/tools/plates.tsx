import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import {
  Button,
  Chip,
  Divider,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Stack } from "expo-router";
import { useFocusEffect } from "expo-router";
import { getBodySettings } from "../../lib/db";
import { plateColor } from "../../constants/theme";

type Plate = { weight: number; enabled: boolean; count: number };

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const LB_PLATES = [55, 45, 35, 25, 10, 5, 2.5];
const KG_BARS = [20, 15, 10];
const LB_BARS = [45, 35, 25];
const KG_STEP = 2.5;
const LB_STEP = 5;

function defaults(unit: "kg" | "lb"): Plate[] {
  const sizes = unit === "lb" ? LB_PLATES : KG_PLATES;
  return sizes.map((w) => ({ weight: w, enabled: true, count: 10 }));
}

function solve(
  remaining: number,
  plates: number[],
  idx: number,
): number[] | null {
  if (Math.abs(remaining) < 0.001) return [];
  if (idx >= plates.length || remaining < 0) return null;
  const with_ = solve(remaining - plates[idx], plates, idx + 1);
  if (with_) return [plates[idx], ...with_];
  return solve(remaining, plates, idx + 1);
}

function closest(target: number, plates: number[]): number {
  const achievable = new Set<number>([0]);
  for (const p of plates) {
    const next = [...achievable];
    for (const v of next) {
      if (v + p <= target) achievable.add(Math.round((v + p) * 1000) / 1000);
    }
  }
  let best = 0;
  for (const v of achievable) {
    if (v <= target && v > best) best = v;
  }
  return best;
}

function aggregate(plates: number[]): { weight: number; count: number }[] {
  const map = new Map<number, number>();
  for (const p of plates) map.set(p, (map.get(p) || 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([weight, count]) => ({ weight, count }));
}

function flatten(available: Plate[]): number[] {
  const out: number[] = [];
  for (const p of available) {
    if (!p.enabled) continue;
    for (let i = 0; i < p.count; i++) out.push(p.weight);
  }
  return out.sort((a, b) => b - a);
}

export default function PlateCalculator() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [bar, setBar] = useState(20);
  const [target, setTarget] = useState("");
  const [available, setAvailable] = useState<Plate[]>(defaults("kg"));
  const [expanded, setExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const body = await getBodySettings();
        const u = body.weight_unit;
        setUnit(u);
        setBar(u === "lb" ? 45 : 20);
        setAvailable(defaults(u));
      })();
    }, []),
  );

  const bars = unit === "lb" ? LB_BARS : KG_BARS;
  const step = unit === "lb" ? LB_STEP : KG_STEP;
  const parsed = parseFloat(target);
  const valid = !isNaN(parsed) && parsed > 0;

  const result = useMemo(() => {
    if (!valid) return { error: null, plates: null, perSide: 0, achieved: 0 };

    if (parsed < bar)
      return {
        error: `Target must be greater than bar weight (${bar}${unit})`,
        plates: null,
        perSide: 0,
        achieved: 0,
      };

    if (parsed === bar)
      return {
        error: null,
        plates: [],
        perSide: 0,
        achieved: 0,
      };

    const any = available.some((p) => p.enabled);
    if (!any)
      return {
        error: "No plates available",
        plates: null,
        perSide: 0,
        achieved: 0,
      };

    const perSide = Math.round(((parsed - bar) / 2) * 1000) / 1000;
    const flat = flatten(available);
    const found = solve(perSide, flat, 0);

    if (found)
      return { error: null, plates: aggregate(found), perSide, achieved: perSide };

    const best = closest(perSide, flat);
    const fallback = solve(best, flat, 0);
    return {
      error: `Cannot make ${perSide}${unit} per side with available plates. Closest: ${best}${unit}`,
      plates: fallback ? aggregate(fallback) : [],
      perSide: best,
      achieved: best,
    };
  }, [valid, parsed, bar, unit, available]);

  const bump = (dir: 1 | -1) => {
    const cur = valid ? parsed : bar;
    const next = Math.max(0, cur + dir * step);
    setTarget(String(next));
  };

  const toggle = (idx: number) => {
    setAvailable((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, enabled: !p.enabled } : p,
      ),
    );
  };

  const setCount = (idx: number, dir: 1 | -1) => {
    setAvailable((prev) =>
      prev.map((p, i) =>
        i === idx
          ? { ...p, count: Math.max(1, Math.min(10, p.count + dir)) }
          : p,
      ),
    );
  };

  const vizLabel = () => {
    if (!result.plates || result.plates.length === 0) {
      if (valid && parsed === bar) return `Empty barbell, ${bar} ${unit}`;
      return `Barbell with no plates`;
    }
    const desc = result.plates
      .map((p) => `${p.count} ${p.weight} ${unit} plate${p.count > 1 ? "s" : ""}`)
      .join(" and ");
    const total = Math.round((result.achieved * 2 + bar) * 100) / 100;
    return `Barbell loaded with ${desc} per side, totaling ${total} ${unit}`;
  };

  return (
    <>
      <Stack.Screen options={{ title: "Plate Calculator" }} />
      <FlatList
        data={expanded ? available : []}
        keyExtractor={(p) => String(p.weight)}
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {/* Bar Weight */}
            <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 8 }}>
              Bar Weight
            </Text>
            <SegmentedButtons
              value={String(bar)}
              onValueChange={(v) => setBar(Number(v))}
              buttons={bars.map((b) => ({
                value: String(b),
                label: `${b}${unit}`,
                accessibilityLabel: `Bar weight ${b} ${unit === "kg" ? "kilograms" : "pounds"}`,
              }))}
              style={styles.segment}
            />

            {/* Target Weight */}
            <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginTop: 20, marginBottom: 8 }}>
              Target Weight
            </Text>
            <View style={styles.row}>
              <IconButton
                icon="minus"
                size={28}
                onPress={() => bump(-1)}
                accessibilityLabel={`Decrease target weight by ${step}`}
                accessibilityRole="button"
                accessibilityValue={{ now: valid ? parsed : 0, min: 0, max: 999, text: `${target || 0} ${unit}` }}
                style={styles.stepBtn}
              />
              <TextInput
                mode="outlined"
                keyboardType="numeric"
                autoFocus
                value={target}
                onChangeText={setTarget}
                placeholder={String(bar)}
                right={<TextInput.Affix text={unit} />}
                style={styles.input}
                accessibilityLabel="Target barbell weight"
              />
              <IconButton
                icon="plus"
                size={28}
                onPress={() => bump(1)}
                accessibilityLabel={`Increase target weight by ${step}`}
                accessibilityRole="button"
                accessibilityValue={{ now: valid ? parsed : 0, min: 0, max: 999, text: `${target || 0} ${unit}` }}
                style={styles.stepBtn}
              />
            </View>

            {/* Error */}
            {result.error && (
              <Text variant="bodyMedium" style={[styles.error, { color: theme.colors.error }]}>
                {result.error}
              </Text>
            )}

            {/* Results */}
            {valid && !result.error && result.plates !== null && (
              <View style={styles.results}>
                {result.plates.length === 0 ? (
                  <Text variant="bodyLarge" style={{ color: theme.colors.onBackground, textAlign: "center", marginVertical: 16 }}>
                    Per side: 0{unit} — no plates needed
                  </Text>
                ) : (
                  <>
                    <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12 }}>
                      Per side: {result.perSide}{unit}
                    </Text>
                    <View
                      style={styles.badges}
                      accessibilityLabel={vizLabel()}
                      accessibilityRole="summary"
                    >
                      {result.plates.map((p, i) => {
                        const c = plateColor(p.weight, unit, isDark);
                        return (
                          <View
                            key={i}
                            style={[
                              styles.badge,
                              {
                                backgroundColor: c.bg,
                                borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)",
                              },
                            ]}
                            accessibilityLabel={`${p.count} times ${p.weight} ${unit === "kg" ? "kilogram" : "pound"} plate`}
                          >
                            <Text style={[styles.badgeText, { color: c.text }]}>
                              {p.count} × {p.weight}{unit}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Barbell visualization */}
                    <View style={styles.barbell} accessibilityLabel={vizLabel()}>
                      <View style={[styles.sleeve, { backgroundColor: theme.colors.outlineVariant }]} />
                      {result.plates.map((p, i) => {
                        const c = plateColor(p.weight, unit, isDark);
                        return Array.from({ length: p.count }).map((_, j) => (
                          <View
                            key={`${i}-${j}`}
                            style={[
                              styles.plate,
                              {
                                backgroundColor: c.bg,
                                borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)",
                                height: 20 + Math.min(p.weight, 25) * 1.6,
                              },
                            ]}
                          />
                        ));
                      })}
                      <View style={[styles.shaft, { backgroundColor: theme.colors.outline }]} />
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Fallback plates */}
            {result.error && result.plates && result.plates.length > 0 && (
              <View style={styles.results}>
                <Text variant="titleSmall" style={{ color: theme.colors.onBackground, marginBottom: 8 }}>
                  Closest loading ({result.achieved}{unit} per side):
                </Text>
                <View style={styles.badges}>
                  {result.plates.map((p, i) => {
                    const c = plateColor(p.weight, unit, isDark);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.badge,
                          {
                            backgroundColor: c.bg,
                            borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)",
                          },
                        ]}
                        accessibilityLabel={`${p.count} times ${p.weight} ${unit === "kg" ? "kilogram" : "pound"} plate`}
                      >
                        <Text style={[styles.badgeText, { color: c.text }]}>
                          {p.count} × {p.weight}{unit}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Available Plates */}
            <Divider style={{ marginTop: 24 }} />
            <Button
              mode="text"
              onPress={() => setExpanded(!expanded)}
              icon={expanded ? "chevron-up" : "chevron-down"}
              contentStyle={styles.expandBtn}
              style={{ marginTop: 8 }}
            >
              Available Plates
            </Button>
          </>
        }
        renderItem={({ item: p, index: i }) => (
          <View style={styles.plateRow}>
            <Chip
              selected={p.enabled}
              onPress={() => toggle(i)}
              style={[styles.chip, !p.enabled && { opacity: 0.5 }]}
              accessibilityLabel={`Toggle ${p.weight} ${unit === "kg" ? "kilogram" : "pound"} plates`}
              accessibilityState={{ selected: p.enabled }}
            >
              {p.weight}{unit}
            </Chip>
            {p.enabled && (
              <View style={styles.countRow}>
                <IconButton
                  icon="minus"
                  size={20}
                  onPress={() => setCount(i, -1)}
                  disabled={p.count <= 1}
                  accessibilityLabel={`Decrease ${p.weight}${unit} plate count`}
                />
                <Text variant="bodyMedium" style={{ color: theme.colors.onBackground, minWidth: 20, textAlign: "center" }}>
                  {p.count}
                </Text>
                <IconButton
                  icon="plus"
                  size={20}
                  onPress={() => setCount(i, 1)}
                  disabled={p.count >= 10}
                  accessibilityLabel={`Increase ${p.weight}${unit} plate count`}
                />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  per side
                </Text>
              </View>
            )}
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  segment: {
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepBtn: {
    margin: 0,
  },
  input: {
    flex: 1,
    fontSize: 18,
  },
  error: {
    marginTop: 12,
    textAlign: "center",
  },
  results: {
    marginTop: 16,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    minHeight: 48,
    justifyContent: "center",
  },
  badgeText: {
    fontWeight: "700",
    fontSize: 15,
  },
  barbell: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    alignSelf: "center",
    height: 80,
  },
  sleeve: {
    width: 24,
    height: 12,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  plate: {
    width: 12,
    borderRadius: 2,
    borderWidth: 1,
    marginHorizontal: 1,
  },
  shaft: {
    width: 60,
    height: 6,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  expandBtn: {
    flexDirection: "row-reverse",
  },
  config: {
    gap: 8,
    paddingBottom: 16,
  },
  plateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chip: {
    minWidth: 72,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
