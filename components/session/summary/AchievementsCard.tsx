import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useRouter } from "expo-router";
import type { AchievementDef } from "@/lib/achievements";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
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
      accessibilityLabel={i18n._({ id: "components.session.summary.achievements.a11y", message: "{count} {count, plural, one {achievement} other {achievements}} unlocked", values: { count: achievements.length } })}
      accessibilityLiveRegion="polite"
    >
      <CardContent>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="trophy" size={fontSizes.xl} color={colors.onTertiaryContainer} />
          <Text
            variant="title"
            style={{ color: colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}
          >
            Achievement{achievements.length > 1 ? "s" : ""} Unlocked!
          </Text>
        </View>
        {displayed.map((a) => (
          <View key={a.id} style={styles.row}>
            <MaterialCommunityIcons
              name={a.iconName}
              size={fontSizes.lg}
              color={colors.onTertiaryContainer}
              style={{ marginRight: 8 }}
            />
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
            accessibilityLabel={t({ id: "components.session.summary.achievements.more-a11y", message: `View ${extraCount} more achievements` })}
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
  section: {},
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
});
