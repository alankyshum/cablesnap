/**
 * ImportWorkoutsCard — Settings entry card for CSV workout history import.
 * BLD-2463
 *
 * Placed after CSVExportCard in Settings → "Data & Backup" tile.
 * Follows DataManagementCard props pattern: { colors, onPick, bareContent }.
 */
import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { FileInput } from "lucide-react-native";
import { fontSizes, spacing } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ThemeColors;
  onPick: () => void;
  loading?: boolean;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function ImportWorkoutsCard({
  colors,
  onPick,
  loading = false,
  bareContent = false,
}: Props) {
  const content = (
    <>
      <Text
        variant="body"
        style={{ color: colors.onSurface, fontWeight: "600", fontSize: fontSizes.sm, marginBottom: spacing.sm }}
      >
        Import Workout History
      </Text>
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginBottom: spacing.md }}
      >
        Bring your history from Strong, Hevy, or FitNotes (.csv)
      </Text>
      <View style={styles.buttonFlow}>
        <Button
          variant="outline"
          icon={FileInput}
          onPress={onPick}
          loading={loading}
          disabled={loading}
          testID="import-workouts-pick-btn"
          accessibilityLabel="Choose CSV file to import workout history"
          accessibilityRole="button"
        >
          Choose CSV File…
        </Button>
      </View>
    </>
  );

  if (bareContent) return <View testID="import-workouts-card">{content}</View>;

  return (
    <Card
      variant="outline"
      style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}
      testID="import-workouts-card"
    >
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  buttonFlow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
