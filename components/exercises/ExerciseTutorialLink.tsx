import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ExternalLink } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import {
  buildTutorialSearchUrl,
  openTutorialForExercise,
} from "@/lib/exercise-tutorial-link";
import { t } from "@lingui/core/macro";

export interface ExerciseTutorialLinkProps {
  exerciseName: string;
  testID?: string;
}

/**
 * Renders a "Watch form tutorial ↗" Pressable + sibling disclaimer caption.
 *
 * Returns `null` (not an empty View) when the name is empty / whitespace
 * so no broken link affordance leaks into the UI.
 */
export function ExerciseTutorialLink({
  exerciseName,
  testID,
}: ExerciseTutorialLinkProps) {
  const colors = useThemeColors();

  const url = buildTutorialSearchUrl(exerciseName);
  if (!url) return null;

  const label = t({ id: "components.exercises.tutorial-link.label", message: `Watch form tutorial for ${exerciseName.trim()} — opens YouTube search in browser` });

  return (
    <View style={styles.container}>
      <Pressable
        testID={testID}
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint={t({ id: "components.exercises.tutorial-link.hint", message: "Opens external content outside the app" })}
        onPress={() => {
          void openTutorialForExercise(exerciseName);
        }}
        style={({ pressed }) => [
          styles.pressable,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text
          variant="body"
          style={{ color: colors.primary, fontWeight: "600" }}
        >
          {t({ id: "components.exercises.tutorial-link.cta", message: "Watch form tutorial ↗" })}
        </Text>
        <ExternalLink size={16} color={colors.primary} />
      </Pressable>
      <Text
        variant="body"
        style={{
          color: colors.onSurfaceVariant,
          fontSize: fontSizes.xs,
          marginTop: 4,
        }}
      >
        {t({ id: "components.exercises.tutorial-link.disclaimer", message: "Opens YouTube search in your browser. External content — not endorsed by CableSnap." })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  pressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    minWidth: 44,
    paddingVertical: 8,
  },
});
