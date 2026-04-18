import { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { Stack } from "expo-router";
import { useFocusEffect } from "expo-router";
import {
  buildAchievementContext,
  getEarnedAchievementMap,
  saveEarnedAchievements,
  hasSeenRetroactiveBanner,
  markRetroactiveBannerSeen,
} from "../../lib/db";
import {
  ACHIEVEMENTS,
  getAllAchievementProgress,
  evaluateAchievements,
} from "../../lib/achievements";
import type { AchievementCategory } from "../../lib/achievements";
import { radii, typography } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

type AchievementItem = {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  earned: boolean;
  earnedAt: number | null;
  progress: number;
};

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  consistency: "Consistency",
  strength: "Strength",
  volume: "Volume",
  nutrition: "Nutrition",
  body: "Body",
};

export default function AchievementsScreen() {
  const colors = useThemeColors();
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retroBanner, setRetroBanner] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const [ctx, earnedMap] = await Promise.all([
            buildAchievementContext(),
            getEarnedAchievementMap(),
          ]);

          // Retroactive evaluation: earn any new achievements silently
          const alreadyEarnedIds = new Set(earnedMap.keys());
          const newlyEarned = evaluateAchievements(ctx, alreadyEarnedIds);

          if (newlyEarned.length > 0) {
            const now = Date.now();
            await saveEarnedAchievements(
              newlyEarned.map((n) => n.achievement.id),
              now,
            );
            for (const n of newlyEarned) {
              earnedMap.set(n.achievement.id, now);
            }
          }

          // Show retroactive banner on first open
          const seenBanner = await hasSeenRetroactiveBanner();
          if (cancelled) return;
          if (!seenBanner && earnedMap.size > 0) {
            setRetroBanner(earnedMap.size);
            await markRetroactiveBannerSeen();
          }

          const progress = getAllAchievementProgress(ctx, earnedMap);
          if (cancelled) return;

          setItems(
            progress.map((p) => ({
              id: p.achievement.id,
              name: p.achievement.name,
              description: p.achievement.description,
              category: p.achievement.category,
              icon: p.achievement.icon,
              earned: p.earned,
              earnedAt: p.earnedAt,
              progress: p.progress,
            })),
          );
          setEarnedCount(earnedMap.size);
        } catch (e) {
          if (__DEV__) console.warn("Achievement evaluation failed:", e);
          if (!cancelled) setError("Could not load achievements. Please try again later.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

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

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderBadge = ({ item }: { item: AchievementItem }) => {
    const badgeColor = item.earned
      ? colors.primaryContainer
      : colors.surfaceVariant;
    const textColor = item.earned
      ? colors.onPrimaryContainer
      : colors.onSurfaceVariant;

    return (
      <Card
        style={[styles.badge, { backgroundColor: badgeColor }]}
        accessibilityLabel={
          item.earned
            ? `${item.name} achievement — Earned on ${formatDate(item.earnedAt!)}`
            : `${item.name} achievement — Locked, ${Math.round(item.progress * 100)}% complete`
        }
        accessibilityRole="summary"
      >
        <CardContent style={styles.badgeContent}>
          <View style={styles.iconContainer}>
            <Text style={[styles.icon, !item.earned && styles.iconLocked]}>
              {item.icon}
            </Text>
            {item.earned ? (
              <Text style={styles.checkOverlay}>✅</Text>
            ) : (
              <Text style={styles.lockOverlay}>🔒</Text>
            )}
          </View>
          <Text
            variant="caption"
            numberOfLines={1}
            style={[styles.badgeName, { color: textColor }]}
          >
            {item.name}
          </Text>
          <Text
            variant="caption"
            numberOfLines={2}
            style={[styles.badgeDesc, { color: textColor }]}
          >
            {item.description}
          </Text>
          {item.earned ? (
            <Text variant="caption" style={{ color: textColor, marginTop: 4 }}>
              {formatDate(item.earnedAt!)}
            </Text>
          ) : (
            <View
              style={styles.progressContainer}
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(item.progress * 100),
                text: `${Math.round(item.progress * 100)}% complete`,
              }}
            >
              <Progress
                value={item.progress * 100}
                style={styles.progressBar}
              />
              <Text variant="caption" style={{ color: textColor, marginTop: 2 }}>
                {Math.round(item.progress * 100)}%
              </Text>
            </View>
          )}
        </CardContent>
      </Card>
    );
  };

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
                    {renderBadge({ item: badge })}
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
  badge: {
    minHeight: 48,
  },
  badgeContent: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  iconContainer: {
    position: "relative",
    marginBottom: 4,
  },
  icon: {
    fontSize: typography.statValue.fontSize,
  },
  iconLocked: {
    opacity: 0.4,
  },
  checkOverlay: {
    position: "absolute",
    bottom: -4,
    right: -8,
    fontSize: 14,
  },
  lockOverlay: {
    position: "absolute",
    bottom: -4,
    right: -8,
    fontSize: 14,
  },
  badgeName: {
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
  },
  badgeDesc: {
    textAlign: "center",
    marginTop: 2,
  },
  progressContainer: {
    width: "100%",
    marginTop: 6,
    alignItems: "center",
  },
  progressBar: {
    width: "100%",
    height: 4,
    borderRadius: radii.sm,
  },
});
