import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { spacing } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ShareCardStats } from "./share/ShareCardStats";
import { ShareCardExercises } from "./share/ShareCardExercises";
import { fontSizes } from "@/constants/design-tokens";

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

      <ShareCardStats
        duration={duration}
        sets={sets}
        volume={volume}
        unit={unit}
      />

      {/* Rating */}
      {rating != null && rating >= 1 && (
        <View style={cardStyles.ratingSection}>
          <StarRow rating={rating} />
        </View>
      )}

      <ShareCardExercises exercises={exercises} prs={prs} />

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
    fontSize: fontSizes.xxl,
    fontWeight: "700",
  },
  titleSection: {
    marginBottom: spacing.xl,
  },
  sessionName: {
    fontSize: fontSizes.stat,
    fontWeight: "800",
    lineHeight: 44,
    marginBottom: spacing.xs,
  },
  dateText: {
    fontSize: fontSizes.lg,
    lineHeight: 24,
  },
  ratingSection: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  starRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    alignItems: "center",
  },
  footerText: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
