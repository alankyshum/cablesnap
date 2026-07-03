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
 *   the count of sets and the values that will be applied. On confirm the
 *   suggestion is applied to ALL non-completed sets, OVERWRITING any existing
 *   weight/reps (a 0 or blank value is not special-cased — the user already
 *   consented via the confirm dialog).
 * - Trailing ⓘ on the Next half opens the SuggestionExplainerModal via
 *   onOpenExplainer; nested Pressable hit-target prevents the parent
 *   confirm from firing.
 * - When every set is already completed the apply confirm degrades to a
 *   "Nothing to apply" notice with a single dismiss button.
 *
 * Confirms are RN's built-in `Alert.alert` per the approved plan. If
 * visual mismatch with the design system is reported, swap for the
 * existing in-app dialog pattern — the functional contract here stays.
 */
import React, { useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { TrendingDown } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "../../constants/design-tokens";
import type { SetWithMeta } from "./types";
import type { Suggestion } from "../../lib/rm";
import { type BreakThroughSuggestion } from "../../lib/plateau";
import { toDisplay } from "../../lib/units";

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
  /** BLD-1114: Previous session setup photo URI (16x16 thumbnail in Last half). */
  previousSetupPhotoUri?: string | null;
  /** BLD-1122: Per-exercise plateau hint. When set, renders TrendingDown icon on the Next pill. */
  plateauHint?: BreakThroughSuggestion | null;
  /** BLD-1122: Atomic break-through apply callback (from useSessionActions). */
  onApplyBreakThrough?: (updates: { id: string; weight: number | null; reps: number | null }[]) => Promise<void>;
  /** Weight unit for display (BLD-1122). */
  unit?: "kg" | "lb";
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

/** Apply the Next suggestion to ALL non-completed sets, OVERWRITING any
 *  existing value. The user has already consented via the confirm dialog, so
 *  0/blank sets are not special-cased and populated sets are overridden too.
 *  Completed sets are always left untouched (logged history is immutable). */
function applyNextFill(
  s: Suggestion,
  sets: SetWithMeta[],
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void,
): void {
  const field: "weight" | "reps" = s.type === "rep_increase" ? "reps" : "weight";
  const value = String(s.type === "rep_increase" ? s.reps : s.weight);
  for (const set of sets) {
    if (!set.completed) {
      onUpdate(set.id, field, value);
    }
  }
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Count sets eligible for a suggestion apply: every non-completed set.
 *  Completed sets are immutable (logged history); everything else is a valid
 *  override target regardless of its current weight/reps value. */
function countIncomplete(sets: SetWithMeta[]): number {
  return sets.filter((x) => !x.completed).length;
}

/** Build override updates for the break-through path: apply the hint to ALL
 *  non-completed sets, overwriting existing values. rep_plus_one preserves the
 *  existing per-set weight (only the rep target changes). */
function buildBreakThroughOverride(
  suggestion: BreakThroughSuggestion,
  sets: SetWithMeta[],
): { id: string; weight: number | null; reps: number | null }[] {
  if (suggestion.kind === "form_check") return [];
  return sets
    .filter((set) => !set.completed)
    .map((set) =>
      suggestion.kind === "rep_plus_one"
        ? { id: set.id, weight: set.weight, reps: suggestion.reps }
        : { id: set.id, weight: suggestion.weight, reps: suggestion.reps },
    );
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
  previousSetupPhotoUri,
  plateauHint,
  onApplyBreakThrough,
  unit = "kg",
}: LastNextRowProps) {
  const colors = useThemeColors();
  const alertFn = alertImpl ?? Alert.alert;
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);

  const hasLast = previousPerformance != null && previousPerformance !== "";
  const hasNext = suggestion != null;
  if (!hasLast && !hasNext) return null;

  // BLD-2386 Item B: removed Alert.alert wrapper — call onPrefillLast() directly.
  // Safety is proven at the data layer: computePrefillSets (lib/format.ts:228)
  // skips completed sets (:251) and any already-filled set (:259). Non-destructive.
  const confirmAndPrefillLast = () => {
    onPrefillLast();
  };

  const confirmAndApplyNext = () => {
    // BLD-1122: if a plateau hint exists and we have an atomic apply callback,
    // use the break-through atomic path.
    if (plateauHint && onApplyBreakThrough && plateauHint.kind !== "form_check") {
      const updates = buildBreakThroughOverride(plateauHint, sets);
      if (updates.length === 0) {
        alertFn(
          "Nothing to apply",
          "Every set is already completed.",
          [{ text: "OK", style: "cancel" }],
        );
        return;
      }
      const weightDesc =
        plateauHint.kind === "rep_plus_one"
          ? `reps: ${plateauHint.reps}`
          : `weight: ${toDisplay(plateauHint.weight, unit)} ${unit} × ${plateauHint.reps}`;
      alertFn(
        "Apply break-through suggestion?",
        `Will apply ${weightDesc} to ${updates.length} set${updates.length === 1 ? "" : "s"}, overwriting existing values.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Apply", onPress: () => { onApplyBreakThrough(updates); } },
        ],
      );
      return;
    }

    if (!suggestion) return;
    const targetCount = countIncomplete(sets);
    if (targetCount === 0) {
      alertFn(
        "Nothing to apply",
        "Every set is already completed.",
        [{ text: "OK", style: "cancel" }],
      );
      return;
    }
    const valueDesc = suggestedValueDescription(suggestion);
    alertFn(
      "Apply suggested values?",
      `Will apply ${valueDesc} to ${targetCount} set${targetCount === 1 ? "" : "s"}, overwriting existing values.`,
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
          {previousSetupPhotoUri ? (
            <Pressable
              onLongPress={() => setPhotoPreviewVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="imagebutton"
              accessibilityLabel="Previous session setup photo - long press to preview"
            >
              <Image
                source={{ uri: previousSetupPhotoUri }}
                style={styles.setupPhotoThumb}
                resizeMode="cover"
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </Pressable>
          ) : null}
        </Pressable>
      )}

      {previousSetupPhotoUri ? (
        <Modal
          visible={photoPreviewVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoPreviewVisible(false)}
          accessibilityViewIsModal
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPhotoPreviewVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close setup photo preview"
          >
            <Image
              source={{ uri: previousSetupPhotoUri }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </Pressable>
        </Modal>
      ) : null}

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
          {plateauHint && plateauHint.kind !== "form_check" ? (
            <TrendingDown
              size={14}
              color={colors.primary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : (
            <MaterialCommunityIcons
              name={nextLeadingIconName(suggestion)}
              size={14}
              color={colors.primary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
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
              e?.stopPropagation?.();
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
  setupPhotoThumb: {
    width: 16,
    height: 16,
    borderRadius: 3,
    flexShrink: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: "90%",
    height: "70%",
  },
});
