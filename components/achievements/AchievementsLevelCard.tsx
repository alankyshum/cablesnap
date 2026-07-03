import { View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ACHIEVEMENTS, getUserLevel } from "../../lib/achievements";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { StyleSheet } from "react-native";

interface AchievementsLevelCardProps {
  earnedCount: number;
  retroBanner: number | null;
}

export function AchievementsLevelCard({
  earnedCount,
  retroBanner,
}: AchievementsLevelCardProps) {
  const colors = useThemeColors();
  const { current, next, progress } = getUserLevel(earnedCount);
  const achievementsFromCurrent = earnedCount - current.minAchievements;
  const achievementsNeeded = next ? next.minAchievements - current.minAchievements : 0;

  return (
    <View style={styles.header}>
      <Card style={{ width: "100%", backgroundColor: colors.surface }}>
        <CardContent style={{ alignItems: "center", gap: 8 }}>
          <MaterialCommunityIcons
            name={current.iconName}
            size={36}
            color={colors.onSurface}
          />
          <View style={styles.levelTitleRow}>
            <MaterialCommunityIcons
              name={current.iconName}
              size={fontSizes.lg}
              color={colors.onSurface}
              style={{ marginRight: 6 }}
            />
            <Text
              variant="title"
              style={{ color: colors.onSurface, fontWeight: "700" }}
            >
              {current.name}
            </Text>
          </View>
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
            Level {current.level}
          </Text>
          {next ? (
            <>
              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceVariant }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` },
                  ]}
                />
              </View>
              <View style={styles.nextLevelCaption}>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {achievementsFromCurrent} / {achievementsNeeded} more achievements to reach{" "}
                </Text>
                <MaterialCommunityIcons
                  name={next.iconName}
                  size={fontSizes.sm}
                  color={colors.onSurfaceVariant}
                />
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {" "}{next.name}
                </Text>
              </View>
            </>
          ) : (
            <Text variant="body" style={{ color: colors.primary, fontWeight: "600" }}>
              Max level reached!
            </Text>
          )}
        </CardContent>
      </Card>
      <Text
        variant="body"
        style={{ color: colors.onSurfaceVariant, marginTop: 12 }}
      >
        {earnedCount} / {ACHIEVEMENTS.length} Achievements Earned
      </Text>
      {retroBanner !== null && (
        <Card
          style={[styles.retroBanner, { backgroundColor: colors.tertiaryContainer }]}
          accessibilityLiveRegion="polite"
        >
          <CardContent>
            <Text variant="body" style={{ color: colors.onTertiaryContainer }}>
              Welcome back! We found {retroBanner} achievement{retroBanner !== 1 ? "s" : ""} from your workout history.
            </Text>
          </CardContent>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 24 },
  retroBanner: { marginTop: 12, width: "100%" },
  progressTrack: { width: "100%", height: 8, borderRadius: 4, overflow: "hidden" as const },
  progressFill: { height: "100%", borderRadius: 4 },
  levelTitleRow: { flexDirection: "row", alignItems: "center" },
  nextLevelCaption: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
});
