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

const RANGE_BUTTONS = [
  { value: "7", label: "7 days", accessibilityLabel: "Date range 7 days" },
  { value: "30", label: "30 days", accessibilityLabel: "Date range 30 days" },
  { value: "90", label: "90 days", accessibilityLabel: "Date range 90 days" },
  { value: "all", label: "All", accessibilityLabel: "Date range All" },
];

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

  useEffect(() => {
    getCSVCounts(sinceForRange(range)).then(setCounts);
  }, [range]);

  const content = (
    <>
      <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>CSV Export</Text>
      <SegmentedControl value={range} onValueChange={setRange} buttons={RANGE_BUTTONS} style={styles.segment} />
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginBottom: 12, marginTop: 8 }}
        accessibilityLabel={`${counts.sessions} workout sessions, ${counts.entries} nutrition entries`}
      >
        {counts.sessions} session{counts.sessions !== 1 ? "s" : ""}, {counts.entries} entr{counts.entries !== 1 ? "ies" : "y"}
      </Text>
      <View style={styles.buttonFlow}>
        <Button variant="outline" size="sm" icon={FileOutput} onPress={() => exportCSV("workouts", range)} loading={loading} disabled={loading} accessibilityLabel="Export workouts as CSV">Workouts</Button>
        <Button variant="outline" size="sm" icon={Apple} onPress={() => exportCSV("nutrition", range)} loading={loading} disabled={loading} accessibilityLabel="Export nutrition as CSV">Nutrition</Button>
        <Button variant="outline" size="sm" icon={Scale} onPress={() => exportCSV("bodyWeight", range)} loading={loading} disabled={loading} accessibilityLabel="Export body weight as CSV">Body Weight</Button>
        <Button variant="outline" size="sm" icon={User} onPress={() => exportCSV("bodyMeasurements", range)} loading={loading} disabled={loading} accessibilityLabel="Export body measurements as CSV">Measurements</Button>
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
