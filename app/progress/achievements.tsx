import {
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Stack } from "expo-router";
import { ACHIEVEMENTS } from "../../lib/achievements";
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
            return (
              <View style={styles.header}>
                <Text variant="heading" style={{ color: colors.onBackground }}>
                  🏆
                </Text>
                <Text
                  variant="title"
                  style={{ color: colors.onBackground, fontWeight: "700", marginTop: 4 }}
                  accessibilityRole="header"
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  retroBanner: {
    marginTop: 12,
    width: "100%",
  },
  section: {
    marginBottom: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridItem: {
    width: "31%",
    minWidth: 100,
  },
});
