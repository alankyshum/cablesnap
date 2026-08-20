import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Apple, FileOutput, Scale, User } from "lucide-react-native";
import { fontSizes } from "@/constants/design-tokens";
import { getCSVCounts } from "@/lib/db";
import { sinceForRange, useCSVExport } from "@/hooks/useCSVExport";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@lingui/core";

type Props = {
  colors: ThemeColors;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function CSVExportCard({ colors, bareContent = false }: Props) {
  const [range, setRange] = useState("30");
  const [counts, setCounts] = useState({ sessions: 0, entries: 0 });
  const { loading, exportCSV } = useCSVExport();
  const { t } = useLingui();
  const rangeButtons = [
    { value: "7", label: t({ id: "settings.csv.range7", message: "7 days" }), accessibilityLabel: t({ id: "settings.csv.range7A11y", message: "Date range 7 days" }) },
    { value: "30", label: t({ id: "settings.csv.range30", message: "30 days" }), accessibilityLabel: t({ id: "settings.csv.range30A11y", message: "Date range 30 days" }) },
    { value: "90", label: t({ id: "settings.csv.range90", message: "90 days" }), accessibilityLabel: t({ id: "settings.csv.range90A11y", message: "Date range 90 days" }) },
    { value: "all", label: t({ id: "settings.csv.rangeAll", message: "All" }), accessibilityLabel: t({ id: "settings.csv.rangeAllA11y", message: "Date range All" }) },
  ];

  useEffect(() => {
    getCSVCounts(sinceForRange(range)).then(setCounts);
  }, [range]);

  const content = (
    <>
      <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>{t({ id: "settings.csv.title", message: "CSV Export" })}</Text>
      <SegmentedControl value={range} onValueChange={setRange} buttons={rangeButtons} style={styles.segment} />
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginBottom: 12, marginTop: 8 }}
        accessibilityLabel={i18n._({ id: "settings.csv.countsA11y", message: "{sessions, plural, one {# workout session} other {# workout sessions}}, {entries, plural, one {# nutrition entry} other {# nutrition entries}}", values: counts })}
      >
        {i18n._({ id: "settings.csv.counts", message: "{sessions, plural, one {# session} other {# sessions}}, {entries, plural, one {# nutrition entry} other {# nutrition entries}}", values: counts })}
      </Text>
      <View style={styles.buttonFlow}>
        <Button variant="outline" size="sm" icon={FileOutput} onPress={() => exportCSV("workouts", range)} loading={loading} disabled={loading} accessibilityLabel={t({ id: "settings.csv.workoutsA11y", message: "Export workouts as CSV" })}>{t({ id: "settings.csv.workouts", message: "Workouts" })}</Button>
        <Button variant="outline" size="sm" icon={Apple} onPress={() => exportCSV("nutrition", range)} loading={loading} disabled={loading} accessibilityLabel={t({ id: "settings.csv.nutritionA11y", message: "Export nutrition as CSV" })}>{t({ id: "settings.csv.nutrition", message: "Nutrition" })}</Button>
        <Button variant="outline" size="sm" icon={Scale} onPress={() => exportCSV("bodyWeight", range)} loading={loading} disabled={loading} accessibilityLabel={t({ id: "settings.csv.bodyWeightA11y", message: "Export body weight as CSV" })}>{t({ id: "settings.csv.bodyWeight", message: "Body Weight" })}</Button>
        <Button variant="outline" size="sm" icon={User} onPress={() => exportCSV("bodyMeasurements", range)} loading={loading} disabled={loading} accessibilityLabel={t({ id: "settings.csv.measurementsA11y", message: "Export body measurements as CSV" })}>{t({ id: "settings.csv.measurements", message: "Measurements" })}</Button>
      </View>
    </>
  );

  if (bareContent) return <View>{content}</View>;

  return (
    <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  segment: { marginBottom: 4 },
  buttonFlow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
