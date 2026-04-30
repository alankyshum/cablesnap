import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { spacing, radii, fontSizes } from "@/constants/design-tokens";
import type { ProgressionChainExercise, ProgressionSuggestion } from "@/lib/db";

type Props = {
  exerciseId: string;
  chain: ProgressionChainExercise[];
  suggestion: ProgressionSuggestion | null;
};

const NODE_SIZE = 20;
const LINE_HEIGHT_PX = 2;

/**
 * BLD-913: Progression Path card for exercise detail screen.
 * Shows a horizontal chain of exercises with the current one highlighted.
 */
export default function ProgressionPathCard({ exerciseId, chain, suggestion }: Props) {
  const colors = useThemeColors();
  const router = useRouter();

  const currentIndex = useMemo(
    () => chain.findIndex((e) => e.id === exerciseId),
    [chain, exerciseId]
  );

  if (chain.length === 0) return null;

  const suggestionText = getSuggestionText(suggestion);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surfaceVariant }]}
      accessibilityRole="summary"
    >
      <Text
        variant="title"
        style={[styles.title, { color: colors.onSurface }]}
      >
        Progression Path
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chainContainer}
        accessibilityRole="list"
      >
        {chain.map((exercise, index) => {
          const isCurrent = exercise.id === exerciseId;
          const nodeType = isCurrent
            ? "current"
            : exercise.has_been_logged
              ? "completed"
              : "future";

          return (
            <View key={exercise.id} style={styles.nodeWrapper}>
              {/* Connecting line (before node, except first) */}
              {index > 0 && (
                <View
                  style={[
                    styles.line,
                    {
                      backgroundColor:
                        index <= currentIndex
                          ? colors.primary
                          : colors.outlineVariant,
                    },
                  ]}
                />
              )}

              <Pressable
                onPress={() => {
                  if (!isCurrent) router.push(`/exercise/${exercise.id}`);
                }}
                disabled={isCurrent}
                accessibilityLabel={`${exercise.name}, step ${index + 1} of ${chain.length}${isCurrent ? ", current" : exercise.has_been_logged ? ", completed" : ""}`}
                accessibilityRole="button"
                hitSlop={8}
              >
                <View
                  style={[
                    styles.node,
                    nodeType === "current" && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                    nodeType === "completed" && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                      opacity: 0.6,
                    },
                    nodeType === "future" && {
                      backgroundColor: "transparent",
                      borderColor: colors.outlineVariant,
                      borderWidth: 2,
                    },
                  ]}
                />
                <Text
                  variant="caption"
                  numberOfLines={2}
                  style={[
                    styles.nodeLabel,
                    {
                      color: isCurrent
                        ? colors.primary
                        : colors.onSurfaceVariant,
                      fontWeight: isCurrent ? "700" : "400",
                    },
                  ]}
                >
                  {exercise.name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {suggestionText && (
        <Text
          variant="body"
          style={[styles.suggestion, { color: colors.onSurfaceVariant }]}
          accessibilityLiveRegion="polite"
        >
          {suggestionText}
        </Text>
      )}
    </View>
  );
}

function getSuggestionText(suggestion: ProgressionSuggestion | null): string | null {
  if (!suggestion) return null;
  if (suggestion.isTerminal) {
    return "You\u2019ve reached the most advanced variation in this chain. Keep building strength here, or explore other progression paths.";
  }
  if (suggestion.shouldSuggest && suggestion.nextExercise) {
    return `You\u2019ve been consistent and your sets look strong. When you feel ready, ${suggestion.nextExercise.name} is the next step.`;
  }
  return null;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: spacing.base,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  chainContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  nodeWrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 64,
  },
  line: {
    width: 24,
    height: LINE_HEIGHT_PX,
    marginTop: NODE_SIZE / 2 - LINE_HEIGHT_PX / 2,
    marginRight: -2,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignSelf: "center",
  },
  nodeLabel: {
    fontSize: fontSizes.xxs,
    textAlign: "center",
    marginTop: spacing.xs,
    maxWidth: 64,
  },
  suggestion: {
    fontSize: fontSizes.xs,
    marginTop: spacing.md,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
