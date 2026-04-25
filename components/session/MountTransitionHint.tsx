import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { spacing } from "@/constants/design-tokens";
import { MOUNT_POSITION_LABELS, type MountPosition } from "../../lib/types";

export type MountTransitionHintProps = {
  prevMount: MountPosition;
  nextMount: MountPosition;
};

/**
 * BLD-596 gating helper. Returns true iff a transition hint should render
 * between `prev` and `curr` groups. Pure function — used by both the session
 * renderer (`app/session/[id].tsx:renderExerciseGroup`) AND its tests so the
 * swap / move-up / move-down acceptance criteria can exercise the formula
 * directly without mounting the full session screen.
 *
 * Suppression rules (from the approved plan):
 *  - Either neighbour lacks `mount_position` (undefined or DB-loaded null) →
 *    no hint.
 *  - Both neighbours share the same value → no hint.
 *  - `prev` is undefined (single-group session, or first card) → no hint.
 */
export function shouldShowMountTransition(
  prev: { mount_position?: MountPosition | null } | undefined,
  curr: { mount_position?: MountPosition | null } | undefined,
): boolean {
  if (!prev || !curr) return false;
  if (!prev.mount_position || !curr.mount_position) return false;
  return prev.mount_position !== curr.mount_position;
}

/**
 * BLD-596: declarative cable-switch transition hint between two consecutive
 * Voltra exercise groups whose mount positions differ.
 *
 * Caller MUST gate rendering on:
 *   index > 0 && prev.mount_position && curr.mount_position && prev !== curr
 *
 * Accepts ONLY primitive props (`prevMount`, `nextMount` strings) so the
 * default React.memo shallow-compare is correct.
 *
 * Copy is **declarative noun-phrase** ("Mount: Low → High") — never imperative
 * "Switch …". This keeps the Behavior-Design Classification = NO defence
 * airtight (per BLD-595 plan §UX Design).
 *
 * a11y: `accessibilityLabel="Mount changes: <Prev> to <Next>"` on a
 * non-interactive node. No `accessibilityRole="text"` (Android warning).
 */
function MountTransitionHintInner({ prevMount, nextMount }: MountTransitionHintProps) {
  const colors = useThemeColors();
  const prevLabel = MOUNT_POSITION_LABELS[prevMount];
  const nextLabel = MOUNT_POSITION_LABELS[nextMount];
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Mount changes: ${prevLabel} to ${nextLabel}`}
    >
      <MaterialCommunityIcons
        name="swap-horizontal-bold"
        size={14}
        color={colors.onSurfaceVariant}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[styles.text, { color: colors.onSurfaceVariant }]}>
        {`Mount: ${prevLabel} → ${nextLabel}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
});

export const MountTransitionHint = React.memo(MountTransitionHintInner);
