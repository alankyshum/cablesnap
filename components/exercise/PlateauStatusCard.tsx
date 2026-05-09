/**
 * BLD-1122: PlateauStatusCard — exercise detail screen card.
 *
 * Renders when classification is `stalled` or `regressing`. Hidden when:
 *   - classification is `progressing` or `maintaining`
 *   - insufficient data (< 3 sessions)
 *   - exercise is dismissed (dismissedUntil !== null)
 *
 * Three independently focusable controls:
 *   1. Primary CTA (apply suggestion)
 *   2. Secondary CTA (optional — only when a secondary suggestion exists)
 *   3. Dismiss ("Not now")
 *
 * Copy notes (psych binding changes):
 *   - "regressing" token never rendered — neutral form-check copy used.
 *   - Identity-affirming body copy for stall variants.
 *   - No loss-framing, FOMO, or guilt phrasing.
 */
import React, { useCallback } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { TrendingDown } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { PlateauResult, BreakThroughSuggestion } from "@/lib/plateau";
import { applyBreakThroughFill, REP_TARGET_DELTA } from "@/lib/plateau";
import { fontSizes } from "@/constants/design-tokens";
import type { SetWithMeta } from "@/components/session/types";

export type PlateauStatusCardProps = {
  result: PlateauResult;
  exerciseName: string;
  unit: "kg" | "lb";
  /** Sets for the active session (used for apply-during-session path). */
  activeSets?: SetWithMeta[];
  /** Apply the break-through suggestion atomically (in-session path). */
  onApplyBreakThrough?: (
    updates: { id: string; weight: number | null; reps: number | null }[],
  ) => Promise<void>;
  /** No active session — queue the suggestion for next session init. */
  onQueuePending?: (suggestion: BreakThroughSuggestion) => Promise<void>;
  /**
   * Navigate to the BLD-1108 form-clip recording flow (no auto-recording, per AC3).
   * Called when the "Record a quick form clip" CTA is tapped.
   */
  onNavigateToFormClip?: () => void;
  onDismiss: () => Promise<void>;
};

function formatWeight(w: number, unit: "kg" | "lb"): string {
  return unit === "lb" ? `${Math.round(w * 2.20462 * 10) / 10}` : `${w}`;
}

function primaryCtaLabel(suggestion: BreakThroughSuggestion, unit: "kg" | "lb"): string {
  switch (suggestion.kind) {
    case "deload":
      return `Try ${formatWeight(suggestion.weight, unit)} ${unit} × ${suggestion.reps} next session`;
    case "rep_target":
      return `Try ${formatWeight(suggestion.weight, unit)} ${unit} × ${suggestion.reps} next session`;
    case "rep_plus_one":
      return `Try ${suggestion.reps} reps next session`;
    case "form_check":
      return "Record a quick form clip";
  }
}

function secondaryCtaLabel(suggestion: BreakThroughSuggestion, unit: "kg" | "lb"): string {
  switch (suggestion.kind) {
    case "deload":
      return `or deload to ${formatWeight(suggestion.weight, unit)} ${unit} × ${suggestion.reps}`;
    case "rep_target":
      // REP_TARGET_DELTA is the delta added to reps in the suggestion construction
      return `or push for +${REP_TARGET_DELTA} reps at ${formatWeight(suggestion.weight, unit)} ${unit}`;
    default:
      return "";
  }
}

function getHeadline(result: PlateauResult): string {
  if (result.classification === "regressing") {
    return "Recent sessions felt heavier than usual";
  }
  const sessions = result.sessionsObserved;
  const count = Math.min(sessions, 4);
  if (result.topSetWeight != null && result.topSetWeight > 0 && result.topSetReps != null) {
    return `${count} sessions at ${result.topSetWeight} × ${result.topSetReps} — looks like a stall`;
  }
  if (result.topSetReps != null) {
    return `${count} sessions at ${result.topSetReps} reps — ready to push past it?`;
  }
  return "Looks like a stall";
}

function getBodyCopy(result: PlateauResult): string {
  if (result.classification === "regressing") {
    return "A quick form clip can help you spot what's drifting.";
  }
  const isBodyweight =
    result.topSetWeight == null || result.topSetWeight === 0;
  if (isBodyweight) {
    return "Plateaus are normal. Adding one rep is the smallest move that keeps progress real.";
  }
  return (
    "Plateaus are normal. Stalls happen to every lifter past the beginner phase — " +
    // \u002a renders as * (asterisk) — used instead of literal * to avoid markdown rendering
    "pushing through them is what intermediate training \u002ais\u002a."
  );
}

export function PlateauStatusCard({
  result,
  exerciseName,
  unit,
  activeSets,
  onApplyBreakThrough,
  onQueuePending,
  onNavigateToFormClip,
  onDismiss,
}: PlateauStatusCardProps) {
  const colors = useThemeColors();

  // useCallback must be called unconditionally (rules-of-hooks).
  // The early returns below happen AFTER all hook calls.
  const handleApply = useCallback(
    async (suggestion: BreakThroughSuggestion) => {
      if (suggestion.kind === "form_check") {
        // Navigate to form-clip flow — no auto-recording (per AC3 / BLD-1108).
        // Caller provides navigation handler; we do NOT auto-dismiss (user stays until they navigate).
        onNavigateToFormClip?.();
        return;
      }

      if (activeSets && onApplyBreakThrough) {
        // In-session path: apply atomically
        const updates = applyBreakThroughFill(suggestion, activeSets);
        const weightDesc =
          suggestion.kind === "rep_plus_one"
            ? `reps: ${suggestion.reps}`
            : `${formatWeight(suggestion.weight!, unit)} ${unit} × ${suggestion.reps}`;

        Alert.alert(
          "Apply break-through suggestion?",
          updates.length === 0
            ? "No empty sets to fill."
            : `Will fill ${updates.length} empty set${updates.length === 1 ? "" : "s"} with ${weightDesc}.`,
          updates.length === 0
            ? [{ text: "OK", style: "cancel" }]
            : [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Apply",
                  onPress: () => onApplyBreakThrough(updates),
                },
              ],
        );
      } else if (onQueuePending) {
        // No active session: queue for next session init
        await onQueuePending(suggestion);
        Alert.alert(
          "Queued for next session",
          "Values will be prefilled when you start your next session for this exercise.",
          [{ text: "OK" }],
        );
      }
    },
    [activeSets, onApplyBreakThrough, onQueuePending, onNavigateToFormClip, unit],
  );

  // Derived state — placed after all hooks to satisfy rules-of-hooks.
  const primary = result.primarySuggestion;
  const secondary = result.secondarySuggestion;

  if (result.classification === "progressing" || result.classification === "maintaining") {
    return null;
  }
  if (!primary) return null;

  const headline = getHeadline(result);
  const bodyCopy = getBodyCopy(result);

  const primaryA11yLabel =
    primary.kind === "form_check"
      ? "Record a quick form clip"
      : primary.kind === "rep_plus_one"
        ? `Try ${primary.reps} reps next session`
        : `Try ${formatWeight(primary.weight!, unit)} ${unit} by ${primary.reps} reps next session`;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}
      accessibilityRole="none"
      accessibilityLabel={`Plateau detected on ${exerciseName}. ${headline}. ${bodyCopy}`}
    >
      <View style={styles.iconRow}>
        <TrendingDown
          size={20}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          style={[styles.headline, { color: colors.onSurface }]}
          numberOfLines={2}
        >
          {headline}
        </Text>
      </View>

      <Text style={[styles.body, { color: colors.onSurfaceVariant }]}>
        {bodyCopy}
      </Text>

      {/* Primary CTA */}
      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={() => handleApply(primary)}
        accessibilityRole="button"
        accessibilityLabel={primaryA11yLabel}
        accessibilityHint="Applies the suggestion to your next session for this exercise"
        testID="plateau-primary-cta"
      >
        <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
          {primaryCtaLabel(primary, unit)}
        </Text>
      </Pressable>

      {/* Secondary CTA (when computable) */}
      {secondary && (
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => handleApply(secondary)}
          accessibilityRole="button"
          accessibilityLabel={
            secondary.kind === "deload"
              ? `Or deload to ${formatWeight((secondary as { weight: number }).weight, unit)} ${unit} by ${secondary.reps} reps`
              : secondary.kind === "rep_target"
              ? `Or push for target reps at ${formatWeight((secondary as { weight: number }).weight, unit)} ${unit}`
              : "Try alternative approach"
          }
          accessibilityHint="Applies the alternative suggestion instead"
          testID="plateau-secondary-cta"
        >
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
            {secondaryCtaLabel(secondary, unit)}
          </Text>
        </Pressable>
      )}

      {/* Dismiss */}
      <Pressable
        style={({ pressed }) => [styles.dismissBtn, { opacity: pressed ? 0.7 : 1 }]}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        accessibilityHint="Hides this card for 14 days"
        testID="plateau-dismiss"
      >
        <Text style={[styles.dismissText, { color: colors.onSurfaceVariant }]}>
          Not now
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginVertical: 8,
    gap: 10,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headline: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    flex: 1,
    lineHeight: 20,
  },
  body: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  primaryBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  secondaryBtn: {
    paddingVertical: 4,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontSize: fontSizes.sm,
  },
  dismissBtn: {
    paddingVertical: 6,
    alignItems: "center",
  },
  dismissText: {
    fontSize: fontSizes.xs,
  },
});
