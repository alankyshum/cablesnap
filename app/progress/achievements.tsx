import {
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Stack } from "expo-router";
import type { AchievementCategory } from "../../lib/achievements";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useAchievements } from "@/hooks/useAchievements";
import type { AchievementItem } from "@/hooks/useAchievements";
import { AchievementBadge } from "@/components/achievements/AchievementBadge";
import { AchievementsLevelCard } from "@/components/achievements/AchievementsLevelCard";
import { t } from "@lingui/core/macro";

function getCategoryLabels(): Record<AchievementCategory, string> {
  return {
  consistency: t({ id: "app.progress.achievements.consistency", message: "Consistency" }),
  strength: t({ id: "app.progress.achievements.strength", message: "Strength" }),
  volume: t({ id: "app.progress.achievements.volume", message: "Volume" }),
  nutrition: t({ id: "app.progress.achievements.nutrition", message: "Nutrition" }),
  body: t({ id: "app.progress.achievements.body", message: "Body" }),
  };
}

export default function AchievementsScreen() {
  const colors = useThemeColors();
  const categoryLabels = getCategoryLabels();
  const { items, earnedCount, loading, error, retroBanner } = useAchievements();

  // Group items by category
  const sections = Object.entries(categoryLabels)
    .map(([cat, label]) => ({
      category: cat as AchievementCategory,
      label,
      items: items.filter((i) => i.category === cat),
    }))
    .filter((s) => s.items.length > 0);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t({ id: "app.progress.achievements.title", message: "Achievements" }) }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.progress.achievements.loading", message: "Loading achievements..." })}</Text>
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: t({ id: "app.progress.achievements.title", message: "Achievements" }) }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <MaterialCommunityIcons
            name="alert-circle"
            size={36}
            color={colors.onSurfaceVariant}
            style={{ marginBottom: 8 }}
          />
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
        <Stack.Screen options={{ title: t({ id: "app.progress.achievements.title", message: "Achievements" }) }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <MaterialCommunityIcons
            name="trophy"
            size={36}
            color={colors.onSurfaceVariant}
            style={{ marginBottom: 8 }}
          />
          <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 16 }}>
            {t({ id: "app.progress.achievements.empty", message: "Complete your first workout to start earning achievements!" })}
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t({ id: "app.progress.achievements.title", message: "Achievements" }) }} />
      <FlatList
        data={[{ key: "header" }, ...sections.map((s) => ({ key: s.category, ...s }))]}
        keyExtractor={(item) => item.key}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          if (item.key === "header") {
            return (
              <AchievementsLevelCard earnedCount={earnedCount} retroBanner={retroBanner} />
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
  section: { marginBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridItem: { width: "31%", minWidth: 100 },
});
