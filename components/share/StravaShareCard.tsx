import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { spacing, fontSizes } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ShareCardStats } from "./ShareCardStats";
import { StravaShareCardPromo } from "./StravaShareCardPromo";
import type { ShareCardExercise, ShareCardPR } from "../ShareCard";

export type StravaShareCardProps = {
  name: string;
  date: string;
  duration: string;
  sets: number;
  volume: string;
  unit: string;
  prs: ShareCardPR[];
  exercises: ShareCardExercise[];
  promoCaption: string;
  promoEnabled: boolean;
  interactive?: boolean;
  onCaptionChange?: (text: string) => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onCaptionBlur?: () => void;
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 675;

export default function StravaShareCard({
  name,
  date,
  duration,
  sets,
  volume,
  unit,
  prs,
  exercises,
  promoCaption,
  promoEnabled,
  interactive,
  onCaptionChange,
  onToggleEnabled,
  onCaptionBlur,
}: StravaShareCardProps) {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";

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
    >
      {/* Header row: brand left, date right */}
      <View style={styles.headerRow}>
        <View style={styles.brand}>
          <MaterialCommunityIcons
            name="dumbbell"
            size={28}
            color={colors.primary}
          />
          <Text style={[styles.brandText, { color: colors.primary }]}>
            CableSnap
          </Text>
        </View>
        <Text style={[styles.dateText, { color: colors.onSurfaceVariant }]}>
          {date}
        </Text>
      </View>

      {/* Session name */}
      <Text
        style={[styles.sessionName, { color: colors.onSurface }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {name}
      </Text>

      <View style={styles.divider} />

      {/* Stats */}
      <ShareCardStats
        duration={duration}
        sets={sets}
        volume={volume}
        unit={unit}
      />

      {/* PRs + Exercises side-by-side to fit height */}
      <View style={styles.bodyRow}>
        <View style={styles.leftCol}>
          {prs.length > 0 && (
            <View
              style={[
                styles.prSection,
                { backgroundColor: colors.primaryContainer },
              ]}
            >
              <Text
                style={[
                  styles.prTitle,
                  { color: colors.onPrimaryContainer },
                ]}
              >
                New PRs
              </Text>
              {prs.map((pr, i) => (
                <View key={i} style={styles.prRow}>
                  <Text
                    style={[
                      styles.prName,
                      { color: colors.onPrimaryContainer },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {pr.name}
                  </Text>
                  <Text
                    style={[
                      styles.prValue,
                      { color: colors.onPrimaryContainer },
                    ]}
                  >
                    {pr.value}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.rightCol}>
          {exercises.length > 0 && (
            <View>
              <Text
                style={[
                  styles.exerciseSectionTitle,
                  { color: colors.onSurfaceVariant },
                ]}
              >
                Exercises
              </Text>
              {exercises.slice(0, 5).map((ex, i) => (
                <View key={i} style={styles.exerciseRow}>
                  <Text
                    style={[
                      styles.exerciseName,
                      { color: colors.onSurface },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {ex.name}
                  </Text>
                  <Text
                    style={[
                      styles.exerciseDetail,
                      { color: colors.onSurfaceVariant },
                    ]}
                  >
                    {ex.weight
                      ? `${ex.sets}×${ex.reps} @ ${ex.weight}`
                      : `${ex.sets}×${ex.reps}`}
                  </Text>
                </View>
              ))}
              {exercises.length > 5 && (
                <Text
                  style={[
                    styles.moreText,
                    { color: colors.onSurfaceVariant },
                  ]}
                >
                  and {exercises.length - 5} more
                </Text>
              )}
            </View>
          )}
        </View>
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
  sessionName: {
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
  bodyRow: {
    flexDirection: "row",
    flex: 1,
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  leftCol: {
    flex: 1,
  },
  rightCol: {
    flex: 2,
  },
  prSection: {
    borderRadius: 16,
    padding: spacing.lg,
  },
  prTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  prRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  prName: {
    fontSize: fontSizes.base,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  prValue: {
    fontSize: fontSizes.base,
    fontWeight: "700",
  },
  exerciseSectionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  exerciseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
  },
  exerciseName: {
    fontSize: fontSizes.base,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  exerciseDetail: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
  },
  moreText: {
    fontSize: fontSizes.sm,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
});
