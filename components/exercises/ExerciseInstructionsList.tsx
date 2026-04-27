import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

export interface ExerciseInstructionsListProps {
  instructions: string | null | undefined;
  colors: ThemeColors;
  /** Optional: render the "Instructions" section heading. Default: true. */
  showHeading?: boolean;
  /** Optional: testID prefix for each step row (suffix `-step-{i}` is appended). */
  testIDPrefix?: string;
}

export function parseInstructionSteps(instructions: string | null | undefined): string[] {
  return (
    instructions
      ?.split("\n")
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * Renders exercise instructions as numbered steps ("1. Step text") so that
 * narrow phone and wide tablet layouts share the same bullet formatting.
 * Pre-existing leading "<n>. " prefixes in the source string are stripped to
 * avoid double-numbering.
 */
export function ExerciseInstructionsList({
  instructions,
  colors,
  showHeading = true,
  testIDPrefix,
}: ExerciseInstructionsListProps) {
  const steps = parseInstructionSteps(instructions);
  if (steps.length === 0) return null;

  return (
    <View>
      {showHeading && (
        <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 16, fontSize: fontSizes.xs }}>
          Instructions
        </Text>
      )}
      {steps.map((step, i) => {
        const text = step.replace(/^\d+\.\s*/, "");
        return (
          <View
            key={i}
            style={styles.stepRow}
            testID={testIDPrefix ? `${testIDPrefix}-step-${i}` : undefined}
          >
            <Text variant="body" style={{ color: colors.onSurfaceVariant, lineHeight: 22, minWidth: 20 }}>
              {i + 1}.
            </Text>
            <Text variant="body" style={{ color: colors.onSurface, lineHeight: 22, flex: 1 }}>
              {text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: "row",
    marginTop: 6,
    gap: 4,
  },
});
