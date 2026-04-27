import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  /** Unix-ms timestamp at which the session was last edited. */
  editedAt: number | null | undefined;
  colors: ThemeColors;
  /** "compact" = inline (history list row); "default" = header chip. */
  size?: "compact" | "default";
};

/**
 * BLD-690 — Single shared "Edited" pill rendered on the session detail header,
 * the summary header, and the history list row. Surfacing this in one
 * component prevents style drift between the three call sites.
 *
 * The pill is intentionally neutral copy — no streak/gamification framing —
 * because edits are a passive corrective action, not behavior-shaping.
 */
export function EditedPill({ editedAt, colors, size = "default" }: Props) {
  if (!editedAt) return null;
  const a11yDate = new Date(editedAt).toLocaleString();
  const compact = size === "compact";
  return (
    <View
      accessibilityLabel={`This workout was edited on ${a11yDate}`}
      style={[
        styles.pill,
        {
          backgroundColor: colors.surfaceVariant,
          borderColor: colors.outline,
          paddingVertical: compact ? 1 : 2,
          paddingHorizontal: compact ? 6 : 8,
          borderRadius: compact ? 8 : 10,
        },
      ]}
    >
      <Text
        style={{
          color: colors.onSurfaceVariant,
          fontSize: compact ? fontSizes.xs : fontSizes.sm,
          fontWeight: "600",
        }}
      >
        Edited
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
  },
});
