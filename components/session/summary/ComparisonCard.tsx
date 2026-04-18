import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { delta, deltaTime } from "@/lib/session-display";
import type { Comparison } from "@/hooks/useSummaryData";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  comparison: NonNullable<Comparison>;
  colors: ThemeColors;
};

export default function ComparisonCard({ comparison, colors }: Props) {
  if (!comparison.previous) return null;

  return (
    <Card style={StyleSheet.flatten([styles.section, { backgroundColor: colors.surface }])}>
      <CardContent>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="compare-horizontal" size={20} color={colors.primary} />
          <Text
            variant="title"
            style={{ color: colors.onSurface, marginLeft: 8, fontWeight: "700" }}
          >
            vs. Last Time
          </Text>
        </View>
        <View style={styles.compRow}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
            Volume
          </Text>
          <Text
            variant="body"
            style={{ color: colors.onSurface }}
            accessibilityLabel={`Volume ${comparison.current.volume >= comparison.previous.volume ? "increased" : "decreased"} by ${Math.abs(comparison.current.volume - comparison.previous.volume).toLocaleString()}`}
          >
            {delta(comparison.current.volume, comparison.previous.volume)}
          </Text>
        </View>
        <View style={styles.compRow}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
            Duration
          </Text>
          <Text variant="body" style={{ color: colors.onSurface }}>
            {deltaTime(comparison.current.duration, comparison.previous.duration)}
          </Text>
        </View>
        <View style={styles.compRow}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
            Sets
          </Text>
          <Text variant="body" style={{ color: colors.onSurface }}>
            {delta(comparison.current.sets, comparison.previous.sets)}
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
});
