import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { spacing } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";

export type ShareCardExercise = {
  name: string;
  sets: number;
  reps: string;
  weight?: string;
};

export type ShareCardPR = {
  name: string;
  value: string;
};

export type ShareCardProps = {
  name: string;
  date: string;
  duration: string;
  sets: number;
  volume: string;
  unit: string;
  rating: number | null;
  prs: ShareCardPR[];
  exercises: ShareCardExercise[];
};

const MAX_EXERCISES = 6;
const CARD_WIDTH = 1080;

function StarRow({ rating }: { rating: number }) {
  const colors = useThemeColors();
  return (
    <View style={cardStyles.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= rating ? "star" : "star-outline"}
          size={28}
          color={i <= rating ? colors.primary : colors.onSurfaceVariant}
        />
      ))}
    </View>
  );
}

export default function ShareCard(props: ShareCardProps) {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";
  const { name, date, duration, sets, volume, unit, rating, prs, exercises } =
    props;

  const displayExercises = exercises.slice(0, MAX_EXERCISES);
  const remaining = exercises.length - MAX_EXERCISES;

  return (
    <View
      style={[
        cardStyles.card,
        {
          width: CARD_WIDTH,
          backgroundColor: colors.surface,
          borderColor: isDark ? colors.outline : "transparent",
          borderWidth: isDark ? 1 : 0,
        },
      ]}
    >
      {/* Header */}
      <View style={cardStyles.header}>
        <MaterialCommunityIcons
          name="dumbbell"
          size={32}
          color={colors.primary}
        />
        <Text
          style={[cardStyles.brandText, { color: colors.primary }]}
        >
          FitForge
        </Text>
      </View>

      {/* Session name & date */}
      <View style={cardStyles.titleSection}>
        <Text
          style={[cardStyles.sessionName, { color: colors.onSurface }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {name}
        </Text>
        <Text
          style={[cardStyles.dateText, { color: colors.onSurfaceVariant }]}
        >
          {date}
        </Text>
      </View>

      {/* Stats row */}
      <View
        style={[
          cardStyles.statsContainer,
          { backgroundColor: colors.surfaceVariant },
        ]}
      >
        <View style={cardStyles.statItem}>
          <Text style={[cardStyles.statValue, { color: colors.onSurface }]}>
            {duration}
          </Text>
          <Text
            style={[cardStyles.statLabel, { color: colors.onSurfaceVariant }]}
          >
            Duration
          </Text>
        </View>
        <View style={[cardStyles.statDivider, { backgroundColor: colors.outline }]} />
        <View style={cardStyles.statItem}>
          <Text style={[cardStyles.statValue, { color: colors.onSurface }]}>
            {sets}
          </Text>
          <Text
            style={[cardStyles.statLabel, { color: colors.onSurfaceVariant }]}
          >
            Sets
          </Text>
        </View>
        <View style={[cardStyles.statDivider, { backgroundColor: colors.outline }]} />
        <View style={cardStyles.statItem}>
          <Text style={[cardStyles.statValue, { color: colors.onSurface }]}>
            {volume}
          </Text>
          <Text
            style={[cardStyles.statLabel, { color: colors.onSurfaceVariant }]}
          >
            Volume ({unit})
          </Text>
        </View>
      </View>

      {/* Rating */}
      {rating != null && rating >= 1 && (
        <View style={cardStyles.ratingSection}>
          <StarRow rating={rating} />
        </View>
      )}

      {/* PRs */}
      {prs.length > 0 && (
        <View
          style={[
            cardStyles.prSection,
            { backgroundColor: colors.primaryContainer },
          ]}
        >
          <View style={cardStyles.prHeader}>
            <Text style={[cardStyles.prTitle, { color: colors.onPrimaryContainer }]}>
              🏆 New PRs
            </Text>
          </View>
          {prs.map((pr, i) => (
            <View key={i} style={cardStyles.prRow}>
              <Text
                style={[cardStyles.prName, { color: colors.onPrimaryContainer }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {pr.name}
              </Text>
              <Text
                style={[cardStyles.prValue, { color: colors.onPrimaryContainer }]}
              >
                {pr.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Exercises */}
      {displayExercises.length > 0 && (
        <View style={cardStyles.exerciseSection}>
          <Text
            style={[
              cardStyles.exerciseSectionTitle,
              { color: colors.onSurfaceVariant },
            ]}
          >
            Exercises
          </Text>
          {displayExercises.map((ex, i) => (
            <View key={i} style={cardStyles.exerciseRow}>
              <Text
                style={[
                  cardStyles.exerciseName,
                  { color: colors.onSurface },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {ex.name}
              </Text>
              <Text
                style={[
                  cardStyles.exerciseDetail,
                  { color: colors.onSurfaceVariant },
                ]}
              >
                {ex.weight
                  ? `${ex.sets}×${ex.reps} @ ${ex.weight}`
                  : `${ex.sets}×${ex.reps}`}
              </Text>
            </View>
          ))}
          {remaining > 0 && (
            <Text
              style={[
                cardStyles.moreText,
                { color: colors.onSurfaceVariant },
              ]}
            >
              and {remaining} more
            </Text>
          )}
        </View>
      )}

      {/* Footer */}
      <View
        style={[
          cardStyles.footer,
          { borderTopColor: colors.outlineVariant },
        ]}
      >
        <Text
          style={[cardStyles.footerText, { color: colors.onSurfaceVariant }]}
        >
          fitforge.app
        </Text>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    borderRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  brandText: {
    fontSize: 24,
    fontWeight: "700",
  },
  titleSection: {
    marginBottom: spacing.xl,
  },
  sessionName: {
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 44,
    marginBottom: spacing.xs,
  },
  dateText: {
    fontSize: 18,
    lineHeight: 24,
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    ...Platform.select({
      ios: { fontVariant: ["tabular-nums"] },
      android: { fontVariant: ["tabular-nums"] },
      default: {},
    }),
  },
  statLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: spacing.sm,
  },
  ratingSection: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  starRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  prSection: {
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  prHeader: {
    marginBottom: spacing.sm,
  },
  prTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  prRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  prName: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  prValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  exerciseSection: {
    marginBottom: spacing.lg,
  },
  exerciseSectionTitle: {
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  exerciseDetail: {
    fontSize: 15,
    fontWeight: "500",
  },
  moreText: {
    fontSize: 14,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
