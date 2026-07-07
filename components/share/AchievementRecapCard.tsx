import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { spacing, fontSizes, radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StravaShareCardPromo } from "./StravaShareCardPromo";
import type { AchievementDef } from "../../lib/achievements";

export type AchievementRecapCardProps = {
  achievements: AchievementDef[];
  sessionName: string;
  date: string;
  promoCaption: string;
  promoEnabled: boolean;
  interactive?: boolean;
  onCaptionChange?: (text: string) => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onCaptionBlur?: () => void;
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 675;

export default function AchievementRecapCard({
  achievements,
  date,
  promoCaption,
  promoEnabled,
  interactive,
  onCaptionChange,
  onToggleEnabled,
  onCaptionBlur,
}: AchievementRecapCardProps) {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";

  const displayed = achievements.slice(0, 4);
  const extraCount = achievements.length - 4;

  return (
    <View
      style={[
        styles.card,
        {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          backgroundColor: colors.surface,
          borderColor: isDark ? colors.outline : "transparent",
          borderWidth: isDark ? 1 : 0,
        },
      ]}
      testID="achievement-recap-card"
    >
      {/* Header row: brand left, date right */}
      <View style={styles.headerRow}>
        <View style={styles.brand}>
          <MaterialCommunityIcons
            name="trophy"
            size={28}
            color={colors.primary}
            testID="recap-card-trophy-icon"
          />
          <Text style={[styles.brandText, { color: colors.primary }]}>
            CableSnap
          </Text>
        </View>
        <Text style={[styles.dateText, { color: colors.onSurfaceVariant }]}>
          {date}
        </Text>
      </View>

      {/* Title */}
      <Text
        style={[styles.titleText, { color: colors.onSurface }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {achievements.length} Achievement{achievements.length > 1 ? "s" : ""} Unlocked!
      </Text>

      <View style={styles.divider} />

      {/* Achievements List */}
      <View style={styles.listContainer}>
        {displayed.map((a) => (
          <View key={a.id} style={styles.achievementRow} testID={`achievement-row-${a.id}`}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primaryContainer }]}>
              <MaterialCommunityIcons
                name={a.iconName}
                size={32}
                color={colors.onPrimaryContainer}
              />
            </View>
            <View style={styles.textContainer}>
              <Text
                style={[styles.achievementName, { color: colors.onSurface }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {a.name}
              </Text>
              <Text
                style={[styles.achievementDesc, { color: colors.onSurfaceVariant }]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {a.description}
              </Text>
            </View>
          </View>
        ))}

        {extraCount > 0 && (
          <Text
            style={[styles.overflowText, { color: colors.onSurfaceVariant }]}
            testID="achievement-recap-overflow"
          >
            +{extraCount} more
          </Text>
        )}
      </View>

      {/* Promo footer */}
      <StravaShareCardPromo
        caption={promoCaption}
        enabled={promoEnabled}
        interactive={interactive}
        onCaptionChange={onCaptionChange}
        onToggleEnabled={onToggleEnabled}
        onCaptionBlur={onCaptionBlur}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    borderRadius: 24,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brandText: {
    fontSize: fontSizes.xxl,
    fontWeight: "700",
  },
  dateText: {
    fontSize: fontSizes.lg,
    lineHeight: 24,
  },
  titleText: {
    fontSize: fontSizes.xxl,
    fontWeight: "800",
    lineHeight: 36,
    marginBottom: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(128,128,128,0.2)",
    marginBottom: spacing.lg,
  },
  listContainer: {
    flex: 1,
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  achievementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  achievementName: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
  },
  achievementDesc: {
    fontSize: fontSizes.base,
    marginTop: 2,
  },
  overflowText: {
    fontSize: fontSizes.lg,
    fontWeight: "600",
    marginTop: spacing.xs,
    marginLeft: 72, // aligns with content after the 56px icon + 16px gap
  },
});
