/* eslint-disable max-lines-per-function */
/**
 * BLD-850 — Inline Last/Next row.
 *
 * Renders Last (left, faded) and Next (right, emphasized) side by side as
 * row 3 of GroupCardHeader. Replaces the old fat `SuggestionChip` pill +
 * the previous-performance label.
 *
 * Behavior:
 * - Tapping Last fires a confirm dialog → "Refill from last session?" →
 *   onPrefillLast (which fills empty sets only at the parent layer).
 * - Tapping Next fires a confirm dialog → "Apply suggested values?" with
 *   the count of empty sets and the values that will be applied.
 * - Trailing ⓘ on the Next half opens the SuggestionExplainerModal via
 *   onOpenExplainer; nested Pressable hit-target prevents the parent
 *   confirm from firing.
 * - When `emptyCount === 0` the apply confirm degrades to an "All sets are
 *   filled" notice with a single dismiss button.
 *
 * Confirms are RN's built-in `Alert.alert` per the approved plan. If
 * visual mismatch with the design system is reported, swap for the
 * existing in-app dialog pattern — the functional contract here stays.
 */
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "../../constants/design-tokens";
import type { SetWithMeta } from "./types";
import type { Suggestion } from "../../lib/rm";

export type LastNextRowProps = {
  previousPerformance: string | null | undefined;
  previousPerformanceA11y: string | null | undefined;
  suggestion: Suggestion | null | undefined;
  sets: SetWithMeta[];
  /** Step is part of the public surface so the parent can keep callbacks
   *  stable; not used here directly because the suggestion already carries
   *  the resolved next weight. */
  step: number;
  onPrefillLast: () => void;
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void;
  onOpenExplainer: () => void;
  exerciseName: string;
  /**
   * Test seam: by default we route through React Native's `Alert.alert`. Tests
   * inject a synchronous double via `jest.spyOn(Alert, "alert")`; this prop is
   * an additional escape hatch but is not currently exercised by tests.
   */
  alertImpl?: typeof Alert.alert;
};

function formatNextLabel(s: Suggestion): string {
  if (s.type === "rep_increase") return `${s.reps} reps`;
  return `${s.weight}`;
}

function formatNextA11y(s: Suggestion): string {
  if (s.type === "rep_increase") return `Suggested reps: ${s.reps}, ${s.reason}`;
  if (s.type === "increase") return `Suggested weight: ${s.weight}, ${s.reason}`;
  return `Suggested weight: ${s.weight}, maintain — ${s.reason}`;
}

function nextLeadingIconName(s: Suggestion): "arrow-up-bold" | "equal" {
  return s.type === "increase" || s.type === "rep_increase"
    ? "arrow-up-bold"
    : "equal";
}

function suggestedValueDescription(s: Suggestion): string {
  if (s.type === "rep_increase") return `reps: ${s.reps}`;
  return `weight: ${s.weight}`;
}

/** Apply the Next suggestion to empty sets only — verbatim translation of
 *  the previous SuggestionChip fill loop, kept here so the confirm gate
 *  can wrap it. */
function applyNextFill(
  s: Suggestion,
  sets: SetWithMeta[],
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void,
): void {
  if (s.type === "rep_increase") {
    for (const set of sets) {
      if (!set.completed && (set.reps == null || set.reps === 0)) {
        onUpdate(set.id, "reps", String(s.reps));
      }
    }
  } else {
    for (const set of sets) {
      if (!set.completed && (set.weight == null || set.weight === 0)) {
        onUpdate(set.id, "weight", String(s.weight));
      }
    }
  }
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function countEmpty(s: Suggestion, sets: SetWithMeta[]): number {
  if (s.type === "rep_increase") {
    return sets.filter((x) => !x.completed && (x.reps == null || x.reps === 0)).length;
  }
  return sets.filter((x) => !x.completed && (x.weight == null || x.weight === 0)).length;
}

export function LastNextRow({
  previousPerformance,
  previousPerformanceA11y,
  suggestion,
  sets,
  onPrefillLast,
  onUpdate,
  onOpenExplainer,
  exerciseName,
  alertImpl,
}: LastNextRowProps) {
  const colors = useThemeColors();
  const alertFn = alertImpl ?? Alert.alert;

  const hasLast = previousPerformance != null && previousPerformance !== "";
  const hasNext = suggestion != null;
  if (!hasLast && !hasNext) return null;

  const confirmAndPrefillLast = () => {
    alertFn(
      "Refill from last session?",
      "Empty sets will be filled with values from your previous session. Existing values won't be overwritten.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Refill", onPress: () => onPrefillLast() },
      ],
    );
  };

  const confirmAndApplyNext = () => {
    if (!suggestion) return;
    const emptyCount = countEmpty(suggestion, sets);
    if (emptyCount === 0) {
      alertFn(
        "All sets are filled",
        "There are no empty sets to apply the suggestion to. Existing values won't be overwritten.",
        [{ text: "OK", style: "cancel" }],
      );
      return;
    }
    const valueDesc = suggestedValueDescription(suggestion);
    alertFn(
      "Apply suggested values?",
      `Will fill ${emptyCount} empty set${emptyCount === 1 ? "" : "s"} with ${valueDesc}. Existing values won't be overwritten.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Apply", onPress: () => applyNextFill(suggestion, sets, onUpdate) },
      ],
    );
  };

  const showDivider = hasLast && hasNext;

  return (
    <View style={styles.row}>
      {hasLast && (
        <Pressable
          onPress={confirmAndPrefillLast}
          style={({ pressed }) => [
            styles.half,
            hasNext ? styles.halfFlex : styles.halfFull,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={previousPerformanceA11y ?? `Last: ${previousPerformance}`}
          accessibilityHint={`Tap to refill empty sets from previous session for ${exerciseName}`}
          testID="last-half"
        >
          <MaterialCommunityIcons
            name="refresh"
            size={14}
            color={colors.onSurfaceVariant}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            numberOfLines={2}
            style={[
              styles.label,
              { color: colors.onSurfaceVariant, fontWeight: "400" },
            ]}
          >
            <Text style={[styles.labelTag, { color: colors.onSurfaceVariant }]}>Last:</Text>{" "}
            {previousPerformance}
          </Text>
        </Pressable>
      )}

      {showDivider && (
        <View
          style={[styles.divider, { backgroundColor: colors.outlineVariant }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}

      {hasNext && suggestion && (
        <Pressable
          onPress={confirmAndApplyNext}
          style={({ pressed }) => [
            styles.half,
            hasLast ? styles.halfFlex : styles.halfFull,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={formatNextA11y(suggestion)}
          accessibilityHint={`Tap to apply suggested values to empty sets for ${exerciseName}`}
          testID="next-half"
        >
          <MaterialCommunityIcons
            name={nextLeadingIconName(suggestion)}
            size={14}
            color={colors.primary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            numberOfLines={2}
            style={[
              styles.label,
              { color: colors.primary, fontWeight: "600" },
            ]}
          >
            <Text style={[styles.labelTag, { color: colors.primary, fontWeight: "600" }]}>
              Next:
            </Text>{" "}
            {formatNextLabel(suggestion)}
          </Text>
          <Pressable
            onPress={(e) => {
              // Stop the parent Pressable from firing its confirm dialog when
              // the user taps the trailing info icon.
              e.stopPropagation?.();
              onOpenExplainer();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="How is Next calculated?"
            testID="next-info-icon"
            style={styles.infoBtn}
          >
            <MaterialCommunityIcons
              name="information-outline"
              size={16}
              color={colors.primary}
            />
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 44,
  },
  half: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    minHeight: 44,
  },
  halfFlex: { flex: 1, flexShrink: 1 },
  halfFull: { flex: 1 },
  pressed: { opacity: 0.7 },
  label: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
    flexShrink: 1,
    flex: 1,
  },
  labelTag: { fontSize: fontSizes.xs, lineHeight: 16 },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: 4,
  },
  infoBtn: {
    padding: 4,
  },
});
