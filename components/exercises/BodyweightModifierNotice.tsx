import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";

/**
 * BLD-541 AC-23: v1 user-trust microcopy.
 *
 * Rendered on bodyweight exercise detail views to explicitly disclose that
 * the weighted-bodyweight modifier contributes to PR tracking but not to
 * weekly/monthly volume totals in v1. This is the compensating control
 * for the deferred refactor of the 6 volume aggregates (session-stats,
 * exercise-history, achievements, weekly-summary, monthly-report) — the
 * plan chose schema-additive over weight-overload specifically so that
 * refactor could land in a follow-up, and this notice preserves user
 * trust during that interim.
 *
 * The exact wording is plan-locked; do not paraphrase.
 */
export const BW_MODIFIER_VOLUME_NOTICE =
  "Weighted-bodyweight modifier is tracked as a PR dimension but does not yet contribute to weekly/monthly volume totals.";

export function BodyweightModifierNotice({ colors }: { colors: ThemeColors }) {
  return (
    <View
      testID="bw-modifier-volume-notice"
      accessibilityLabel={BW_MODIFIER_VOLUME_NOTICE}
      accessibilityRole="text"
      style={[
        styles.notice,
        {
          backgroundColor: colors.surfaceVariant,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      <Text
        variant="body"
        style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm, lineHeight: 18 }}
      >
        {BW_MODIFIER_VOLUME_NOTICE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginTop: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
  },
});
