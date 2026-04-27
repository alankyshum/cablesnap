import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";

type PRRow = { exercise_id: string; name: string; previous_max: number; weight: number };

type Props = { prs: PRRow[]; colors: ThemeColors };

/**
 * BLD-690 — PR card extracted from the detail screen body so the screen
 * stays under the 200-line FTA decomposition cap.
 */
export function PRsCard({ prs, colors }: Props) {
  if (prs.length === 0) return null;
  return (
    <Card
      style={StyleSheet.flatten([styles.card, { backgroundColor: colors.tertiaryContainer }])}
      accessibilityLabel={`${prs.length} new personal record${prs.length > 1 ? "s" : ""} achieved in this workout`}
    >
      <CardContent>
        <View style={styles.header}>
          <MaterialCommunityIcons name="trophy" size={20} color={colors.onTertiaryContainer} />
          <Text variant="title" style={{ color: colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}>
            {prs.length} New PR{prs.length > 1 ? "s" : ""}
          </Text>
        </View>
        {prs.map((pr) => (
          <View key={pr.exercise_id} style={styles.row}>
            <Text
              variant="body"
              style={{ color: colors.onTertiaryContainer, flex: 1 }}
              accessibilityLabel={`New personal record: ${pr.name}, ${pr.previous_max} to ${pr.weight}`}
            >
              {pr.name}
            </Text>
            <Text variant="body" style={{ color: colors.onTertiaryContainer }}>
              {pr.previous_max} → {pr.weight}
            </Text>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 20 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
});
