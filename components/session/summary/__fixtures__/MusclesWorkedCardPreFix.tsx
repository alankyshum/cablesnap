/**
 * BLD-480 PRE-FIX REPRODUCER FIXTURE — DO NOT MODIFY.
 *
 * This component intentionally re-creates the visual defect that PR #292
 * fixed (BLD-480: "remove maxHeight crop on workout summary muscle heatmap").
 *
 * It wraps the modern `MusclesWorkedCard` in a `View` that re-imposes the
 * regressed `maxHeight: 200` clamp and `overflow: hidden`, faithfully
 * reproducing the cropping bug where the lower body of the body-figure SVG
 * is cut off on the post-workout summary screen.
 *
 * Why a wrapper instead of a vendored copy of the buggy component?
 *   - The bug is purely a layout clamp (`maxHeight: 200`); it is fully
 *     re-creatable from outside the component without touching the modern
 *     source of truth.
 *   - Using the modern `MusclesWorkedCard` underneath means future refactors
 *     (theme tokens, MuscleMap rendering, gender hook) carry forward; we
 *     only freeze the *defect*, not the entire pre-fix rendering path.
 *   - This keeps the pre-fix fixture and the modern component in lockstep
 *     for everything except the regressed style — exactly what the
 *     ux-designer vision pipeline needs to detect a *crop*.
 *
 * Used by:
 *   - `app/__fixtures__/bld-480-prefix.tsx`  — dev-only harness route
 *   - `e2e/scenarios/completed-workout-prefix.spec.ts`  — daily-audit scenario
 *
 * Acceptance gate (QD#2): rendering this fixture must produce a screenshot
 * that the ux-designer agent flags with at least one finding whose
 * description matches (case-insensitive):
 *   crop | truncat | clip | maxHeight | cut off | MusclesWorkedCard | body-figure
 *
 * If a refactor of `MusclesWorkedCard` ever makes this clamp no longer
 * visible (e.g. the underlying MuscleMap is now intrinsically <= 200px
 * tall), this file MUST be tightened — either by lowering the clamp or by
 * vendoring the pre-fix component verbatim — so the visual defect remains
 * unambiguous to the vision pipeline.
 *
 * Refs: BLD-480 (original bug), BLD-924 / BLD-941 / BLD-943 (audit blocks
 * that motivated the fixture), BLD-951 (this fixture).
 */
import { StyleSheet, View } from "react-native";
import MusclesWorkedCard from "@/components/session/summary/MusclesWorkedCard";
import type { MuscleGroup } from "@/lib/types";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  colors: ThemeColors;
};

/**
 * The exact regression: pre-PR-#292 the `MuscleMap` container was clamped to
 * `maxHeight: 200` with `overflow: hidden`, cropping the bottom of the
 * body-figure SVG (legs/glutes were cut off on most viewports).
 */
const PRE_FIX_CLAMP = StyleSheet.create({
  // DO NOT CHANGE these values without re-validating QD#2 (see file header).
  clamp: { maxHeight: 200, overflow: "hidden" },
});

export default function MusclesWorkedCardPreFix(props: Props) {
  return (
    <View
      style={PRE_FIX_CLAMP.clamp}
      testID="bld-480-prefix-clamp"
      // Embed the BLD-480 marker directly in the DOM so the vision pipeline
      // and any text-based debug paths can see the fixture's intent.
      accessibilityLabel="BLD-480 pre-fix MusclesWorkedCard reproducer (intentionally cropped via maxHeight:200)"
    >
      <MusclesWorkedCard {...props} />
    </View>
  );
}
