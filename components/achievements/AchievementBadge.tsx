import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { radii, typography } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { AchievementItem } from "../../hooks/useAchievements";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AchievementBadge({ item }: { item: AchievementItem }) {
  const colors = useThemeColors();
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
}

const styles = StyleSheet.create({
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
