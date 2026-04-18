import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { toDisplay } from "@/lib/units";
import type { Increase } from "@/hooks/useSummaryData";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  increases: Increase[];
  unit: "kg" | "lb";
  colors: ThemeColors;
};

export default function WeightIncreasesCard({ increases, unit, colors }: Props) {
  return (
    <Card style={StyleSheet.flatten([styles.section, { backgroundColor: colors.surface }])}>
      <CardContent>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="trending-up" size={20} color={colors.primary} />
          <Text
            variant="title"
            style={{ color: colors.onSurface, marginLeft: 8, fontWeight: "700" }}
          >
            Weight Increases
          </Text>
        </View>
        {increases.map((inc) => (
          <View key={inc.exercise_id} style={styles.row}>
            <Text
              variant="body"
              style={{ color: colors.onSurface, flex: 1 }}
              accessibilityLabel={`${inc.name}: weight increased from ${toDisplay(inc.previous, unit)} to ${toDisplay(inc.current, unit)} ${unit}`}
            >
              {inc.name}
            </Text>
            <Text variant="body" style={{ color: colors.primary }}>
              {toDisplay(inc.previous, unit)} → {toDisplay(inc.current, unit)} {unit}
            </Text>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
});
