import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Weight } from "lucide-react-native";
import { Stack, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { getBodySettings } from "../../lib/db";
import { epley, brzycki, lombardi, average, percentageTable } from "../../lib/rm";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

type RMCalculatorContentProps = {
  onPlateCalc?: (weight: number) => void;
};

export function RMCalculatorContent({ onPlateCalc }: RMCalculatorContentProps = {}) {
  const colors = useThemeColors();
  const router = useRouter();
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const body = await getBodySettings();
          setUnit(body.weight_unit);
        } catch {
          // Fall back to default unit if settings unavailable
        }
      })();
    }, []),
  );

  const parsed = parseFloat(weight);
  const parsedReps = parseInt(reps, 10);
  const valid = !isNaN(parsed) && parsed > 0 && !isNaN(parsedReps) && parsedReps > 0;
  const warn = valid && parsedReps > 12;

  const results = useMemo(() => {
    if (!valid) return null;
    const e = Math.round(epley(parsed, parsedReps) * 10) / 10;
    const b = Math.round(brzycki(parsed, parsedReps) * 10) / 10;
    const l = Math.round(lombardi(parsed, parsedReps) * 10) / 10;
    const avg = Math.round(average(parsed, parsedReps) * 10) / 10;
    return { epley: e, brzycki: b, lombardi: l, average: avg };
  }, [valid, parsed, parsedReps]);

  const table = useMemo(() => {
    if (!results) return [];
    return percentageTable(results.average);
  }, [results]);

  const label = unit === "kg" ? "kilograms" : "pounds";

  return (
    <View>
      <View style={styles.inputRow}>
        <View style={styles.weightWrap}>
          <Input
            variant="outline"
            keyboardType="numeric"
            value={weight}
            onChangeText={setWeight}
             placeholder={t({ id: "app.tools.rm.weightPlaceholder", message: "Weight" })}
            rightComponent={() => <Text variant="caption" style={{ marginRight: 8 }}>{unit}</Text>}
             accessibilityLabel={t({ id: "app.tools.rm.weightA11y", message: `Weight in ${label}` })}
          />
        </View>
        <Text variant="title" style={{ color: colors.onSurfaceVariant }}>×</Text>
        <View style={styles.repsWrap}>
          <Input
            variant="outline"
            keyboardType="numeric"
            value={reps}
            onChangeText={setReps}
             placeholder={t({ id: "app.tools.rm.repsPlaceholder", message: "Reps" })}
             accessibilityLabel={t({ id: "app.tools.rm.repsA11y", message: "Number of repetitions" })}
          />
        </View>
      </View>

      {!valid && weight !== "" && (
        <Text variant="caption" style={{ color: colors.error, marginTop: 8, textAlign: "center" }}>
           {parsed <= 0 || isNaN(parsed) ? t({ id: "app.tools.rm.enterWeight", message: "Enter a weight" }) : t({ id: "app.tools.rm.enterReps", message: "Enter reps" })}
        </Text>
      )}

      {warn && (
        <Text variant="caption" style={{ color: colors.error, marginTop: 8, textAlign: "center" }}>
           {t({ id: "app.tools.rm.accuracyWarning", message: "⚠ Estimates become less accurate above 12 reps" })}
        </Text>
      )}

      {results && (
        <View style={styles.results}>
          <Text variant="subtitle" style={{ color: colors.onBackground, marginBottom: 12 }}>
             {t({ id: "app.tools.rm.estimatedOneRm", message: "Estimated 1RM" })}
          </Text>

          <View style={styles.tableHeader}>
             <Text variant="caption" style={[styles.tableCell, { color: colors.onSurfaceVariant }]}>{t({ id: "app.tools.rm.formula", message: "Formula" })}</Text>
             <Text variant="caption" style={[styles.tableCellRight, { color: colors.onSurfaceVariant }]}>{t({ id: "app.tools.rm.estOneRm", message: "Est 1RM" })}</Text>
          </View>
          <Separator />
          <View>
             <View style={styles.tableRow} accessibilityLabel={t({ id: "app.tools.rm.epleyA11y", message: `Epley formula, ${results.epley} ${label}` })}>
              <Text variant="body" style={[styles.tableCell, { color: colors.onSurface }]}>{t({ id: "app.tools.rm.epley", message: "Epley" })}</Text>
              <Text variant="body" style={[styles.tableCellRight, { color: colors.onSurface }]}>{results.epley} {unit}</Text>
            </View>
            <Separator />
          </View>
          <View>
             <View style={styles.tableRow} accessibilityLabel={t({ id: "app.tools.rm.brzyckiA11y", message: `Brzycki formula, ${results.brzycki} ${label}` })}>
              <Text variant="body" style={[styles.tableCell, { color: colors.onSurface }]}>{t({ id: "app.tools.rm.brzycki", message: "Brzycki" })}</Text>
              <Text variant="body" style={[styles.tableCellRight, { color: colors.onSurface }]}>{results.brzycki} {unit}</Text>
            </View>
            <Separator />
          </View>
          <View>
             <View style={styles.tableRow} accessibilityLabel={t({ id: "app.tools.rm.lombardiA11y", message: `Lombardi formula, ${results.lombardi} ${label}` })}>
              <Text variant="body" style={[styles.tableCell, { color: colors.onSurface }]}>{t({ id: "app.tools.rm.lombardi", message: "Lombardi" })}</Text>
              <Text variant="body" style={[styles.tableCellRight, { color: colors.onSurface }]}>{results.lombardi} {unit}</Text>
            </View>
            <Separator />
          </View>
          <View
            style={[styles.tableRow, { backgroundColor: colors.primaryContainer }]}
             accessibilityLabel={t({ id: "app.tools.rm.averageA11y", message: `Average of all formulas, ${results.average} ${label}` })}
          >
            <Text variant="body" style={[styles.tableCell, { color: colors.onSurface, fontWeight: "700" }]}>{t({ id: "app.tools.rm.average", message: "Average" })}</Text>
            <Text variant="body" style={[styles.tableCellRight, { color: colors.onSurface, fontWeight: "700" }]}>{results.average} {unit}</Text>
          </View>

          <Text variant="subtitle" style={{ color: colors.onBackground, marginTop: 24, marginBottom: 12 }}>
            {t({ id: "app.tools.rm.percentTable", message: "% 1RM Table" })}
          </Text>

          <View style={styles.tableHeader}>
            <Text variant="caption" style={[styles.tableCell, { color: colors.onSurfaceVariant }]}>{t({ id: "app.tools.rm.percentOneRm", message: "% 1RM" })}</Text>
            <Text variant="caption" style={[styles.tableCellRight, { color: colors.onSurfaceVariant }]}>{t({ id: "app.tools.rm.weight", message: "Weight" })}</Text>
            <Text variant="caption" style={[styles.tableCellRight, { color: colors.onSurfaceVariant }]}>{t({ id: "app.tools.rm.reps", message: "Reps" })}</Text>
            <View style={styles.tableCellAction} />
          </View>
          <Separator />
          <FlatList
            data={table}
            keyExtractor={(item) => String(item.pct)}
            scrollEnabled={false}
            renderItem={({ item: row }) => (
              <View>
                <View
                  style={styles.tableRow}
                   accessibilityLabel={t({ id: "app.tools.rm.tableRowA11y", message: `${row.pct} percent of one rep max, ${row.weight} ${label}, ${row.reps} reps` })}
                >
                  <Text variant="body" style={[styles.tableCell, { color: colors.onSurface }]}>{row.pct}%</Text>
                  <Text variant="body" style={[styles.tableCellRight, { color: colors.onSurface }]}>{row.weight} {unit}</Text>
                  <Text variant="body" style={[styles.tableCellRight, { color: colors.onSurface }]}>{row.reps}</Text>
                  <View style={styles.tableCellAction}>
                    <Pressable
                      onPress={() => {
                        if (onPlateCalc) {
                          onPlateCalc(row.weight);
                        } else {
                          router.push(`/tools/plates?weight=${row.weight}`);
                        }
                      }}
                       accessibilityLabel={t({ id: "app.tools.rm.calculatePlatesA11y", message: `Calculate plates for ${row.weight}${unit}` })}
                      accessibilityRole="button"
                      style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon name={Weight} size={18} color={colors.onSurfaceVariant} />
                    </Pressable>
                  </View>
                </View>
                <Separator />
              </View>
            )}
          />

          <Text variant="caption" style={[styles.disclaimer, { color: colors.onSurfaceVariant }]}>
            {t({ id: "app.tools.rm.disclaimer", message: "Estimates based on submaximal performance. Actual 1RM may vary. Estimates become less accurate above 12 reps." })}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function RMCalculator() {
  const colors = useThemeColors();

  return (
    <>
      <Stack.Screen options={{ title: t({ id: "app.tools.rm.title", message: "1RM Calculator" }) }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        >
          <RMCalculatorContent />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  weightWrap: {
    flex: 1,
  },
  repsWrap: {
    width: 100,
  },
  results: {
    marginTop: 24,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  tableCell: {
    flex: 1,
  },
  tableCellRight: {
    flex: 1,
    textAlign: "right",
  },
  tableCellAction: {
    width: 48,
    alignItems: "center",
  },
  disclaimer: {
    marginTop: 16,
    textAlign: "center",
    fontStyle: "italic",
  },
});
