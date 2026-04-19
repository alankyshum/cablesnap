import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useRouter } from "expo-router";
import type { AchievementDef } from "@/lib/achievements";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  achievements: AchievementDef[];
  colors: ThemeColors;
};

export default function AchievementsCard({ achievements, colors }: Props) {
  const router = useRouter();
  const displayed = achievements.slice(0, 3);
  const extraCount = achievements.length - 3;

  return (
    <Card
      style={StyleSheet.flatten([styles.section, { backgroundColor: colors.tertiaryContainer }])}
      accessibilityLabel={`${achievements.length} achievement${achievements.length > 1 ? "s" : ""} unlocked`}
      accessibilityLiveRegion="polite"
    >
      <CardContent>
        <View style={styles.sectionHeader}>
          <Text style={{ fontSize: fontSizes.xl }}>🏆</Text>
          <Text
            variant="title"
            style={{ color: colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}
          >
            Achievement{achievements.length > 1 ? "s" : ""} Unlocked!
          </Text>
        </View>
        {displayed.map((a) => (
          <View key={a.id} style={styles.row}>
            <Text style={{ fontSize: fontSizes.lg, marginRight: 8 }}>{a.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text
                variant="body"
                style={{ color: colors.onTertiaryContainer, fontWeight: "600" }}
              >
                {a.name}
              </Text>
              <Text
                variant="caption"
                style={{ color: colors.onTertiaryContainer }}
              >
                {a.description}
              </Text>
            </View>
          </View>
        ))}
        {extraCount > 0 && (
          <Button
            variant="ghost"
            onPress={() => router.push("/progress/achievements")}
            style={{ marginTop: 4 }}
            accessibilityLabel={`View ${extraCount} more achievements`}
            accessibilityRole="link"
          >
            +{extraCount} more
          </Button>
        )}
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
