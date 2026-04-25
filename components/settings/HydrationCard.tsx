/**
 * BLD-600 — Hydration settings card.
 *
 * Configures unit (ml/fl_oz), daily goal (stored as ml), and three preset volumes
 * (stored as ml). Reset-to-defaults restores 2000 ml goal and 250/500/750 ml presets.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { fontSizes } from "@/constants/design-tokens";
import { getAppSetting, setAppSetting, deleteAppSetting } from "@/lib/db";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";
import { mlToOz, ozToMl, type HydrationUnit } from "@/lib/hydration-units";

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
};

const DEFAULT_GOAL_ML = 2000;
const DEFAULT_PRESETS_ML: [number, number, number] = [250, 500, 750];

function toDisplay(ml: number, unit: HydrationUnit): string {
  if (unit === "ml") return String(Math.round(ml));
  const oz = mlToOz(ml);
  const isInt = Math.abs(oz - Math.round(oz)) < 0.05;
  return isInt ? String(Math.round(oz)) : oz.toFixed(1);
}

function fromDisplay(text: string, unit: HydrationUnit): number | null {
  const n = parseFloat(text.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(unit === "ml" ? n : ozToMl(n));
}

export default function HydrationCard({ colors, toast }: Props) {
  const [unit, setUnit] = useState<HydrationUnit>("ml");
  const [goalText, setGoalText] = useState(String(DEFAULT_GOAL_ML));
  const [presetText, setPresetText] = useState<[string, string, string]>(["250", "500", "750"]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting("hydration.unit"),
      getAppSetting("hydration.daily_goal_ml"),
      getAppSetting("hydration.preset_1_ml"),
      getAppSetting("hydration.preset_2_ml"),
      getAppSetting("hydration.preset_3_ml"),
    ]).then(([u, g, p1, p2, p3]) => {
      if (cancelled) return;
      const nextUnit: HydrationUnit = u === "fl_oz" ? "fl_oz" : "ml";
      const goalMl = g ? parseInt(g, 10) : DEFAULT_GOAL_ML;
      const presetsMl: [number, number, number] = [
        p1 ? parseInt(p1, 10) : DEFAULT_PRESETS_ML[0],
        p2 ? parseInt(p2, 10) : DEFAULT_PRESETS_ML[1],
        p3 ? parseInt(p3, 10) : DEFAULT_PRESETS_ML[2],
      ];
      setUnit(nextUnit);
      setGoalText(toDisplay(Number.isFinite(goalMl) && goalMl > 0 ? goalMl : DEFAULT_GOAL_ML, nextUnit));
      setPresetText([
        toDisplay(presetsMl[0], nextUnit),
        toDisplay(presetsMl[1], nextUnit),
        toDisplay(presetsMl[2], nextUnit),
      ]);
      setHydrated(true);
    }).catch(() => { setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  const handleUnitChange = async (next: HydrationUnit) => {
    if (next === unit) return;
    // Reflow display values from current text (interpreted in old unit) to new unit.
    const goalMl = fromDisplay(goalText, unit);
    const presetsMl: [number | null, number | null, number | null] = [
      fromDisplay(presetText[0], unit),
      fromDisplay(presetText[1], unit),
      fromDisplay(presetText[2], unit),
    ];
    setUnit(next);
    setGoalText(toDisplay(goalMl ?? DEFAULT_GOAL_ML, next));
    setPresetText([
      toDisplay(presetsMl[0] ?? DEFAULT_PRESETS_ML[0], next),
      toDisplay(presetsMl[1] ?? DEFAULT_PRESETS_ML[1], next),
      toDisplay(presetsMl[2] ?? DEFAULT_PRESETS_ML[2], next),
    ]);
    try { await setAppSetting("hydration.unit", next); }
    catch { toast.error("Failed to save hydration unit"); }
  };

  const commitGoal = async () => {
    const ml = fromDisplay(goalText, unit);
    if (ml == null) {
      toast.error("Goal must be greater than 0");
      return;
    }
    try { await setAppSetting("hydration.daily_goal_ml", String(ml)); }
    catch { toast.error("Failed to save hydration goal"); }
  };

  const commitPreset = async (idx: 0 | 1 | 2) => {
    const ml = fromDisplay(presetText[idx], unit);
    if (ml == null) {
      toast.error("Preset must be greater than 0");
      return;
    }
    const key = `hydration.preset_${idx + 1}_ml`;
    try { await setAppSetting(key, String(ml)); }
    catch { toast.error("Failed to save preset"); }
  };

  const handleReset = async () => {
    setUnit("ml");
    setGoalText(String(DEFAULT_GOAL_ML));
    setPresetText(["250", "500", "750"]);
    try {
      await Promise.all([
        deleteAppSetting("hydration.unit"),
        deleteAppSetting("hydration.daily_goal_ml"),
        deleteAppSetting("hydration.preset_1_ml"),
        deleteAppSetting("hydration.preset_2_ml"),
        deleteAppSetting("hydration.preset_3_ml"),
      ]);
    } catch { toast.error("Failed to reset hydration settings"); }
  };

  return (
    <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>
          Hydration
        </Text>

        {/* Unit toggle */}
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>Unit</Text>
          <View style={styles.toggleRow}>
            {(["ml", "fl_oz"] as HydrationUnit[]).map((u) => (
              <Pressable
                key={u}
                onPress={() => handleUnitChange(u)}
                accessibilityLabel={u === "ml" ? "Use milliliters" : "Use fluid ounces"}
                accessibilityRole="button"
                accessibilityState={{ selected: unit === u }}
                style={({ pressed }) => [
                  styles.toggleBtn,
                  { borderColor: colors.primary },
                  unit === u && { backgroundColor: colors.primary },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text variant="caption" style={{ color: unit === u ? "#fff" : colors.primary }}>
                  {u === "ml" ? "ml" : "fl oz"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Daily goal */}
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
            Daily goal ({unit === "ml" ? "ml" : "fl oz"})
          </Text>
          <TextInput
            accessibilityLabel="Daily hydration goal"
            value={goalText}
            onChangeText={setGoalText}
            onBlur={commitGoal}
            keyboardType="numeric"
            editable={hydrated}
            style={[styles.input, { color: colors.onSurface, borderColor: colors.onSurfaceVariant }]}
          />
        </View>

        {/* Presets */}
        {[0, 1, 2].map((i) => (
          <View key={`preset-${i}`} style={styles.row}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
              Preset {i + 1} ({unit === "ml" ? "ml" : "fl oz"})
            </Text>
            <TextInput
              accessibilityLabel={`Preset ${i + 1}`}
              value={presetText[i]}
              onChangeText={(t) => setPresetText((p) => {
                const next = [...p] as [string, string, string];
                next[i] = t;
                return next;
              })}
              onBlur={() => commitPreset(i as 0 | 1 | 2)}
              keyboardType="numeric"
              editable={hydrated}
              style={[styles.input, { color: colors.onSurface, borderColor: colors.onSurfaceVariant }]}
            />
          </View>
        ))}

        <Pressable
          onPress={handleReset}
          accessibilityLabel="Reset hydration settings to defaults"
          accessibilityRole="button"
          style={({ pressed }) => [{ marginTop: 12, alignSelf: "flex-start" }, pressed && { opacity: 0.6 }]}
        >
          <Text variant="caption" style={{ color: colors.primary }}>Reset to defaults</Text>
        </Pressable>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12 },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggleBtn: {
    minHeight: 36,
    minWidth: 56,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    minWidth: 80,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: "right",
    fontSize: fontSizes.sm,
  },
});
