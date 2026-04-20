import {
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Stack } from "expo-router";
import { ACHIEVEMENTS, getUserLevel } from "../../lib/achievements";
import type { AchievementCategory } from "../../lib/achievements";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useAchievements } from "@/hooks/useAchievements";
import type { AchievementItem } from "@/hooks/useAchievements";
import { AchievementBadge } from "@/components/achievements/AchievementBadge";

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  consistency: "Consistency",
  strength: "Strength",
  volume: "Volume",
  nutrition: "Nutrition",
  body: "Body",
};

export default function AchievementsScreen() {
  const colors = useThemeColors();
  const { items, earnedCount, loading, error, retroBanner } = useAchievements();

  // Group items by category
  const sections = Object.entries(CATEGORY_LABELS)
    .map(([cat, label]) => ({
      category: cat as AchievementCategory,
      label,
      items: items.filter((i) => i.category === cat),
    }))
    .filter((s) => s.items.length > 0);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: "Achievements" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>Loading achievements...</Text>
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: "Achievements" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text variant="heading" style={{ marginBottom: 8 }}>⚠️</Text>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 16 }}>
            {error}
          </Text>
        </View>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: "Achievements" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text variant="heading" style={{ marginBottom: 8 }}>🏆</Text>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 16 }}>
            Complete your first workout to start earning achievements!
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Achievements" }} />
      <FlatList
        data={[{ key: "header" }, ...sections.map((s) => ({ key: s.category, ...s }))]}
        keyExtractor={(item) => item.key}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          if (item.key === "header") {
            const { current, next, progress } = getUserLevel(earnedCount);
            const achievementsFromCurrent = earnedCount - current.minAchievements;
            const achievementsNeeded = next ? next.minAchievements - current.minAchievements : 0;
            return (
              <View style={styles.header}>
                <Card style={{ width: "100%", backgroundColor: colors.surface }}>
                  <CardContent style={{ alignItems: "center", gap: 8 }}>
                    <Text variant="heading" style={{ color: colors.onSurface, fontSize: 36 }}>
                      {current.icon}
                    </Text>
                    <Text
                      variant="title"
                      style={{ color: colors.onSurface, fontWeight: "700" }}
                    >
                      {current.icon} {current.name}
                    </Text>
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
                        <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
                          {achievementsFromCurrent} / {achievementsNeeded} more achievements to reach {next.icon} {next.name}
                        </Text>
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

          const section = item as { key: string; label: string; items: AchievementItem[] };
          return (
            <View style={styles.section}>
              <Text
                variant="title"
                style={{ color: colors.onBackground, marginBottom: 8, fontWeight: "700" }}
                accessibilityRole="header"
              >
                {section.label}
              </Text>
              <View style={styles.grid}>
                {section.items.map((badge) => (
                  <View key={badge.id} style={styles.gridItem}>
                    <AchievementBadge item={badge} />
                  </View>
                ))}
              </View>
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 48 },
  header: { alignItems: "center", marginBottom: 24 },
  retroBanner: { marginTop: 12, width: "100%" },
  section: { marginBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridItem: { width: "31%", minWidth: 100 },
  progressTrack: { width: "100%", height: 8, borderRadius: 4, overflow: "hidden" as const },
  progressFill: { height: "100%", borderRadius: 4 },
});
