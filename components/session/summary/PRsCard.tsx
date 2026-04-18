import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { toDisplay } from "@/lib/units";
import type { PR, RepPR } from "@/hooks/useSummaryData";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  prs: PR[];
  repPrs: RepPR[];
  unit: "kg" | "lb";
  colors: ThemeColors;
};

export default function PRsCard({ prs, repPrs, unit, colors }: Props) {
  const allPrs = [...prs, ...repPrs];

  return (
    <Card
      style={StyleSheet.flatten([styles.section, { backgroundColor: colors.tertiaryContainer }])}
      accessibilityLabel={`${allPrs.length} new personal record${allPrs.length > 1 ? "s" : ""}`}
    >
      <CardContent>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="trophy" size={20} color={colors.onTertiaryContainer} />
          <Text
            variant="title"
            style={{ color: colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}
          >
            {allPrs.length} New PR{allPrs.length > 1 ? "s" : ""}
          </Text>
        </View>
        {prs.map((pr) => (
          <View key={pr.exercise_id} style={styles.row}>
            <Text
              variant="body"
              style={{ color: colors.onTertiaryContainer, flex: 1 }}
              accessibilityLabel={`New personal record: ${pr.name}, ${toDisplay(pr.weight, unit)} ${unit}`}
            >
              {pr.name}
            </Text>
            <Text variant="body" style={{ color: colors.onTertiaryContainer }}>
              {toDisplay(pr.previous_max, unit)} → {toDisplay(pr.weight, unit)} {unit}
            </Text>
          </View>
        ))}
        {repPrs.map((pr) => (
          <View key={pr.exercise_id} style={styles.row}>
            <Text
              variant="body"
              style={{ color: colors.onTertiaryContainer, flex: 1 }}
              accessibilityLabel={`New rep personal record: ${pr.name}, ${pr.reps} reps`}
            >
              {pr.name}
            </Text>
            <Text variant="body" style={{ color: colors.onTertiaryContainer }}>
              {pr.previous_max} → {pr.reps} reps
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
