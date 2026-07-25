/**
 * PacingCard — post-session pacing surface (BLD-1144).
 *
 * Renders a stacked horizontal bar (Working / Rest / Other) with mm:ss labels
 * and an ⓘ disclosure. Single tap on the card body opens PacingBreakdownSheet.
 *
 * Title is verbatim "Estimated pacing" — locked by source-contracts test.
 * Segment labels are verbatim "Working", "Rest", "Other" — locked by source-contracts.
 * Empty-state copy is "No completed sets to analyze" — locked by source-contracts.
 * Valenced words ("Idle", "Wasted", "Inactive", "Off-task", "Distraction") are FORBIDDEN
 * in this file — enforced by source-contracts-batch.test.ts.
 * ⓘ disclosure copy is verbatim per AC§147 — locked by source-contracts.
 *
 * CVD accessibility (BLD-1939, BLD-2713, BLD-2714, BLD-2725, BLD-3872):
 * All three pacing segments carry a distinct non-color structural cue so that
 * the bar and legend are mutually distinguishable under deuteranopia, protanopia,
 * tritanopia, and in pure grayscale — following the dual-channel encoding
 * pattern (BLD-65/BLD-732). Structural cues cover deut/prot/grey; the Rest
 * colour token (`colors.pacingRest`, BLD-3872) is separately CVD-tuned so the
 * bar segments themselves are also luminance-distinct under tritanopia.
 *
 *   "Working"  — horizontal-dash overlay (WorkingDashOverlay): short horizontal
 *                rectangles in a repeating tile pattern. Resolves BLD-2713/BLD-2714.
 *                Distinct from Other's circular dots (shape: dash ≠ dot) and from
 *                solid Rest (texture ≠ no texture) in any color mode.
 *   "Other"    — dot/stipple pattern overlay (HatchOverlay): repeating 6px circular dots.
 *                Replaces diagonal stripes (BLD-2725: stripes imply disabled state).
 *   "Rest"     — solid (petrol blue / pale cyan; tuned for tritanopia luminance
 *                separation vs Working — see BLD-3872).
 *
 * Both overlays are additive: full-colour sighted appearance is unchanged.
 * Both are purely decorative: aria-hidden (web) + accessibilityElementsHidden (native).
 * Both use distinct SVG Pattern IDs so they render distinct shapes (BLD-2714 requirement).
 */

import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { formatPacingTime, formatPacingTimeSpoken, type PacingBreakdown } from "@/lib/session-pacing";
import PacingBreakdownSheet from "./PacingBreakdownSheet";
import { spacing } from "@/constants/design-tokens";

// ─── ⓘ Disclosure copy (verbatim AC§147) ─────────────────────────────────────
export const PACING_DISCLOSURE_COPY =
  "Working time is estimated as roughly 2 seconds per rep (or recorded duration for time-based sets). Rest is the remaining gap between consecutive sets.";

// ─── Segment colours (CVD-safe: coral / petrol-blue / grey — distinct hue + luminance) ─
//
// Working / Rest / Other must be distinguishable across all four CVD modes
// (deuteranopia, protanopia, tritanopia) AND in pure grayscale.
//
//   • Working = colors.primary  (Electric Coral)
//   • Rest    = colors.pacingRest  (petrol blue / pale cyan in dark theme)
//     — Dedicated pacing token, NOT `heatmapLow` (BLD-3872). heatmapLow's
//       blue collapsed to near-identical luminance vs the coral under Machado
//       tritanopia (W/R ~1.08:1). pacingRest is tuned so Machado tritan W/R
//       is ≥ 1.5:1 in both themes while preserving CVD guarantees from
//       BLD-1939/2713/2714/2725 (deut/prot/grey). See
//       __tests__/theme/pacing-cvd-contrast.test.ts.
//   • Other   = colors.onSurfaceVariant  (mid grey)
function useSegmentColors() {
  const colors = useThemeColors();
  return {
    working: colors.primary,          // Electric Coral
    rest: colors.pacingRest,          // Petrol-blue (light) / pale cyan (dark) — CVD-safe (BLD-3872)
    other: colors.onSurfaceVariant,   // Mid grey — legible on card background
  };
}

// ─── Shared overlay colour ────────────────────────────────────────────────────
// Semi-transparent white works on both light and dark themes without
// hardcoding a specific shade. Used by both overlay types for visual consistency.
const OVERLAY_COLOR = "rgba(255,255,255,0.55)";

// ─── Dot/stipple overlay — "Other" segment (BLD-1939 CVD fix, BLD-2725 UX fix) ─
//
// Renders an SVG dot/stipple pattern as an absolute-fill overlay.
// Replaced diagonal stripes (BLD-2725): stripes carry a 'disabled/unavailable'
// visual connotation. Dots provide the same non-hue texture for CVD without
// implying a disabled state.
// The overlay is purely decorative: aria-hidden + accessibilityElementsHidden
// so it does not pollute the a11y tree. pointerEvents="none" ensures taps
// pass through to the parent Pressable.

const HATCH_PATTERN_ID = "pacing-other-hatch";
const HATCH_SIZE = 6;          // tile size in px (dot spacing)
const HATCH_DOT_RADIUS = 1.1;  // dot radius in px — subtle but visible
const HATCH_STROKE_COLOR = OVERLAY_COLOR;

// ─── Horizontal-dash overlay — "Working" segment (BLD-2713/BLD-2714 CVD fix) ─
//
// Renders short horizontal rectangle dashes in a repeating tile pattern as an
// absolute-fill overlay on the Working bar segment and legend dot.
//
// Chosen as the Working cue because it is structurally distinct from Other's
// circular dots (shape: dash ≠ dot) and from solid Rest (texture ≠ no texture).
// The distinction holds in pure grayscale AND under red-green CVD, relying solely
// on luminance (semi-white dashes) and shape, not hue.
//
// Uses a different PATTERN_ID from the Other dot pattern so both render distinct
// shapes when present in the same SVG tree.
//
// Does NOT imply "disabled/unavailable" (BLD-2725 lesson): short horizontal lines
// read as a textured fill, not as a "strikethrough" or diagonal-disabled cue.

const DASH_PATTERN_ID = "pacing-working-dash";
const DASH_TILE_W = 8;    // tile width — wider than dot tile for distinct horizontal rhythm
const DASH_TILE_H = 6;    // tile height — same as dot tile height
const DASH_W = 4;         // dash width: noticeably longer than the 2.2px dot diameter
// BLD-3880: dash height raised 1.5 → 2.0 and dash alpha raised 0.55 → 0.85 so the
// Working texture is clearly distinct from solid Rest under protanopia emulation.
// Under protanopia the coral (#FF6038) desaturates toward dark yellow and its
// luminance separation from blue collapses; the strengthened dash restores a
// crisp hue-independent structural cue on the Working segment alone (the Other
// dot pattern is intentionally left at the softer OVERLAY_COLOR / smaller
// footprint so the two textures stay visually distinct from each other).
export const DASH_H = 2.0;
export const DASH_COLOR = "rgba(255,255,255,0.85)";

// ─── Inter-segment divider — protanopia safety net (BLD-3880) ────────────────
//
// A thin high-contrast gap rendered BETWEEN adjacent non-zero segments in the
// pacing bar. Reads visually as a "gutter" and gives a crisp boundary that
// does not depend on hue perception, so the Working|Rest and Rest|Other
// transitions stay visible under protanopia (and every other CVD mode +
// grayscale).
//
// Colour choice: pure white on light theme, pure black on dark theme.
//   Rationale: the divider must clear WCAG ≥ 3:1 contrast against BOTH
//   neighbouring fills. Coral #FF6038 (L≈0.30) and petrol blue #08415C
//   (L≈0.045) sit on OPPOSITE sides of the luminance range — a mid-grey or
//   card-surface (#F3F4F6, L≈0.90) fails the 3:1 gate against coral
//   (~2.7:1). Only a pure extreme (L=1.0 white on light theme, L=0 black on
//   dark theme) beats 3:1 against BOTH fills on the correct theme.
//   Verified in `bar divider contrast` tests below.
//
// Width = 2px fixed (audit spec). Wider than a hairline (which visually
// disappears on mobile Retina under protanopia) and thin enough to remain
// unobtrusive against the full-colour sighted design.
//
// Placement: only between two visible (non-zero) segments — a divider next
// to a zero-width segment would appear orphaned at the bar edge.
//
// Decorative: pointerEvents="none" + a11y-hidden. The parent barContainer
// is already accessibilityElementsHidden on native; web a11y uses aria-hidden.
export const SEGMENT_DIVIDER_WIDTH = 2;
export const SEGMENT_DIVIDER_COLOR_LIGHT = "#FFFFFF";
export const SEGMENT_DIVIDER_COLOR_DARK = "#000000";

/**
 * SegmentDivider — decorative inter-segment gap (BLD-3880).
 * Extracted to keep PacingCard's render complexity manageable and to centralise
 * the a11y/pointer-events wiring so each of the three possible divider slots
 * (Working|Rest, Rest|Other, Working|Other-when-Rest-zero) is identical.
 */
function SegmentDivider({ color, testID }: { color: string; testID: string }) {
  return (
    <View
      testID={testID}
      style={[styles.segmentDivider, { backgroundColor: color }]}
      pointerEvents="none"
      aria-hidden
      {...(Platform.OS !== 'web' ? { accessibilityElementsHidden: true } : {})}
      {...(Platform.OS !== 'web' ? { importantForAccessibility: 'no-hide-descendants' as const } : {})}
    />
  );
}

/**
 * PacingBar — the stacked Working/Rest/Other bar with CVD overlays and
 * BLD-3880 protanopia dividers. Extracted from PacingCard so that
 * PacingCard's render function stays under the project ESLint complexity
 * ceiling (each conditional divider/overlay adds a branch).
 */
type PacingBarProps = {
  workingFrac: number;
  restFrac: number;
  otherFrac: number;
  segColors: { working: string; rest: string; other: string };
  dividerColor: string;
};
function PacingBar({ workingFrac, restFrac, otherFrac, segColors, dividerColor }: PacingBarProps) {
  // BLD-3880: which of the three possible divider slots to render. Only render
  // a divider between two adjacent NON-ZERO segments (an orphan divider next to
  // a zero-width segment would sit at the bar edge and look like a stray line).
  const showDividerWorkingRest = workingFrac > 0 && restFrac > 0;
  const showDividerRestOther = restFrac > 0 && otherFrac > 0;
  const showDividerWorkingOther = workingFrac > 0 && restFrac === 0 && otherFrac > 0;

  return (
    <View
      style={styles.barContainer}
      {...(Platform.OS !== 'web' ? { accessibilityElementsHidden: true } : {})}
    >
      {/* Working segment: horizontal-dash overlay for CVD (BLD-2713/BLD-2714) */}
      <View
        testID="pacing-seg-working"
        style={[
          styles.barSegment,
          { flex: workingFrac, backgroundColor: segColors.working, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
        ]}
      >
        {workingFrac > 0 && (
          <WorkingDashOverlay fill testID="pacing-seg-working-pattern" />
        )}
      </View>
      {/* Working|Rest divider — protanopia safety net (BLD-3880). Only rendered
          when BOTH neighbours are visible; suppressing avoids an orphaned
          divider at the bar edge when a segment is zero. */}
      {showDividerWorkingRest && (
        <SegmentDivider color={dividerColor} testID="pacing-divider-working-rest" />
      )}
      <View
        testID="pacing-seg-rest"
        style={[
          styles.barSegment,
          { flex: restFrac, backgroundColor: segColors.rest },
        ]}
      />
      {/* Rest|Other divider — protanopia safety net (BLD-3880). */}
      {showDividerRestOther && (
        <SegmentDivider color={dividerColor} testID="pacing-divider-rest-other" />
      )}
      {/* Working|Other divider — needed when Rest is zero (edge case). */}
      {showDividerWorkingOther && (
        <SegmentDivider color={dividerColor} testID="pacing-divider-working-other" />
      )}
      {/* Other segment: dot/stipple overlay for CVD (BLD-1939, BLD-2725) */}
      <View
        testID="pacing-seg-other"
        style={[
          styles.barSegment,
          { flex: otherFrac, backgroundColor: segColors.other, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
        ]}
      >
        {otherFrac > 0 && (
          <HatchOverlay fill testID="pacing-seg-other-pattern" />
        )}
      </View>
    </View>
  );
}

type HatchOverlayProps =
  | {
      /** Fill mode: SVG and Rect use "100%" to cover the full flex-sized parent.
       *  Use for the bar Other segment where width is determined by flex at runtime. */
      fill: true;
      width?: never;
      height?: never;
      testID?: string;
    }
  | {
      /** Explicit-size mode: pass exact pixel dimensions for fixed-size elements
       *  such as the legend dot (8×8). */
      fill?: false;
      width: number;
      height: number;
      testID?: string;
    };

/**
 * HatchOverlay — decorative dot/stipple fill (BLD-2725: replaced diagonal stripes).
 * Used for the "Other" segment. Caller is responsible for positioning (absoluteFill
 * or explicit dimensions).
 *
 * Two modes:
 *   fill=true  — SVG canvas is "100%×100%" so it fills any flex-sized parent
 *                without needing runtime width measurement. Use for the bar
 *                Other segment (BLD-2205 fix: prevents 18px-only coverage).
 *   fill=false — Pass explicit width/height for fixed-size elements (legend dot).
 */
export function HatchOverlay({ fill, width, height, testID }: HatchOverlayProps) {
  // In explicit-size mode, guard against non-positive dimensions.
  if (!fill && (width <= 0 || height <= 0)) return null;

  const svgWidth = fill ? "100%" : width;
  const svgHeight = fill ? "100%" : height;

  return (
    <Svg
      width={svgWidth}
      height={svgHeight}
      style={StyleSheet.absoluteFillObject}
      // Decorative overlay — must NOT be announced by screen readers.
      // RN-only a11y props are gated to native: react-native-svg's WebShape
      // does not strip them before DOM render, causing React prop warnings
      // on web (BLD-1872 pattern). aria-hidden handles web a11y correctly.
      // Spread-omit pattern: false value still reaches the DOM and warns;
      // spreading an empty object omits the prop entirely on web (BLD-2004).
      {...(Platform.OS !== 'web' ? { accessibilityElementsHidden: true } : {})}
      {...(Platform.OS !== 'web' ? { importantForAccessibility: 'no-hide-descendants' } : {})}
      aria-hidden
      pointerEvents="none"
      testID={testID}
    >
      <Defs>
        <Pattern
          id={HATCH_PATTERN_ID}
          x="0"
          y="0"
          width={HATCH_SIZE}
          height={HATCH_SIZE}
          patternUnits="userSpaceOnUse"
        >
          <Circle
            cx={HATCH_SIZE / 2}
            cy={HATCH_SIZE / 2}
            r={HATCH_DOT_RADIUS}
            fill={HATCH_STROKE_COLOR}
          />
        </Pattern>
      </Defs>
      <Rect
        x="0"
        y="0"
        width={svgWidth}
        height={svgHeight}
        fill={`url(#${HATCH_PATTERN_ID})`}
      />
    </Svg>
  );
}

type WorkingDashOverlayProps =
  | {
      /** Fill mode: SVG canvas is "100%×100%" to cover the flex-sized bar segment. */
      fill: true;
      width?: never;
      height?: never;
      testID?: string;
    }
  | {
      /** Explicit-size mode: pass exact pixel dimensions (e.g. legend dot 8×8). */
      fill?: false;
      width: number;
      height: number;
      testID?: string;
    };

/**
 * WorkingDashOverlay — decorative horizontal-dash fill for the "Working" segment.
 * Resolves BLD-2713 (deuteranopia) and BLD-2714 (protanopia).
 *
 * Short horizontal rectangles spaced at regular vertical intervals provide a
 * distinct texture from Other's circular dots (shape: dash vs circle) and from
 * solid Rest. The cue is hue-independent: works in pure grayscale and under any
 * CVD type. Uses DASH_PATTERN_ID (distinct from HATCH_PATTERN_ID) so both patterns
 * render their own shapes in the same SVG tree.
 *
 * Shares the same two modes as HatchOverlay (fill / explicit-size).
 */
export function WorkingDashOverlay({ fill, width, height, testID }: WorkingDashOverlayProps) {
  // In explicit-size mode, guard against non-positive dimensions.
  if (!fill && (width <= 0 || height <= 0)) return null;

  const svgWidth = fill ? "100%" : width;
  const svgHeight = fill ? "100%" : height;

  return (
    <Svg
      width={svgWidth}
      height={svgHeight}
      style={StyleSheet.absoluteFillObject}
      {...(Platform.OS !== 'web' ? { accessibilityElementsHidden: true } : {})}
      {...(Platform.OS !== 'web' ? { importantForAccessibility: 'no-hide-descendants' } : {})}
      aria-hidden
      pointerEvents="none"
      testID={testID}
    >
      <Defs>
        <Pattern
          id={DASH_PATTERN_ID}
          x="0"
          y="0"
          width={DASH_TILE_W}
          height={DASH_TILE_H}
          patternUnits="userSpaceOnUse"
        >
          {/* Centered horizontal dash within the tile */}
          <Rect
            x={(DASH_TILE_W - DASH_W) / 2}
            y={(DASH_TILE_H - DASH_H) / 2}
            width={DASH_W}
            height={DASH_H}
            fill={DASH_COLOR}
          />
        </Pattern>
      </Defs>
      <Rect
        x="0"
        y="0"
        width={svgWidth}
        height={svgHeight}
        fill={`url(#${DASH_PATTERN_ID})`}
      />
    </Svg>
  );
}

// ─── Min-segment fraction helper (BLD-2712) ──────────────────────────────────
//
// Ensures every non-zero segment is wide enough to be perceptible at mobile
// viewport widths. The bar inner width is ~330–350px at 390px viewport; 8px
// corresponds to ~0.023. We use MIN_FRAC = 0.03 (~10px at 340px) to give a
// comfortable margin.
//
// Segments that are exactly 0 stay 0 — a truly-absent segment must NOT appear
// (e.g. working=0 must render nothing). Only non-zero raw fractions are raised.
//
// After flooring, the three fractions are re-normalised so they still sum to
// 1.0 ± floating tolerance: the surplus (total of raises) is subtracted
// proportionally from the segments that exceed MIN_FRAC.
//
// Edge cases handled:
//   • Degenerate surplus-donor set empty (all non-zero segments are at or below
//     MIN_FRAC after flooring) — fall back to returning the raw fractions.
//   • All three segments zero — returns {0, 0, 0}.
//   • Floating-point drift — result sums within 1e-6 of 1.0.

/** Minimum display fraction for any non-zero pacing bar segment (~10px at 340px bar). */
export const MIN_SEGMENT_FRAC = 0.03;

export type SegmentFractions = {
  working: number;
  rest: number;
  other: number;
};

/**
 * Apply a minimum visible fraction to non-zero pacing bar segments and
 * re-normalise so the three fractions still sum to 1.0.
 *
 * Pure function — no side effects, fully unit-testable.
 */
export function applyMinSegmentFraction(raw: SegmentFractions): SegmentFractions {
  const keys: (keyof SegmentFractions)[] = ["working", "rest", "other"];

  // Step 1: floor each non-zero segment to MIN_SEGMENT_FRAC and track total surplus raised.
  const floored: SegmentFractions = { working: raw.working, rest: raw.rest, other: raw.other };
  let surplus = 0;
  for (const k of keys) {
    if (raw[k] > 0 && raw[k] < MIN_SEGMENT_FRAC) {
      surplus += MIN_SEGMENT_FRAC - raw[k];
      floored[k] = MIN_SEGMENT_FRAC;
    }
  }

  if (surplus === 0) {
    // Nothing needed flooring — return as-is (no-op for normal data).
    return floored;
  }

  // Step 2: find donor segments — those strictly above MIN_SEGMENT_FRAC (they can give).
  const donors = keys.filter((k) => floored[k] > MIN_SEGMENT_FRAC);
  if (donors.length === 0) {
    // Degenerate: no segment has room to donate — fall back to raw fractions unchanged.
    return raw;
  }

  // Step 3: subtract surplus proportionally from donors.
  const donorTotal = donors.reduce((sum, k) => sum + floored[k], 0);
  let remaining = surplus;
  for (let i = 0; i < donors.length; i++) {
    const k = donors[i];
    if (i === donors.length - 1) {
      // Last donor absorbs the remainder to prevent floating-point accumulation.
      floored[k] = Math.max(MIN_SEGMENT_FRAC, floored[k] - remaining);
    } else {
      const share = (floored[k] / donorTotal) * surplus;
      const reduced = Math.max(MIN_SEGMENT_FRAC, floored[k] - share);
      remaining -= floored[k] - reduced;
      floored[k] = reduced;
    }
  }

  return floored;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  pacing: PacingBreakdown;
  exerciseNames?: Record<string, string>; // exerciseId → display name
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PacingCard({ pacing, exerciseNames = {} }: Props) {
  const colors = useThemeColors();
  const segColors = useSegmentColors();
  const scheme = useColorScheme();
  // BLD-3880: high-luminance-contrast divider colour, theme-derived. White on
  // light theme, black on dark theme — the ONLY choice that clears WCAG 3:1
  // against BOTH the coral Working fill and the petrol-blue/pale-cyan Rest fill
  // on the correct theme. See SEGMENT_DIVIDER_COLOR_* declarations above.
  const dividerColor =
    scheme === "dark" ? SEGMENT_DIVIDER_COLOR_DARK : SEGMENT_DIVIDER_COLOR_LIGHT;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  const gross = pacing.gross > 0 ? pacing.gross : 1; // avoid division by zero
  const rawWorkingFrac = pacing.working / gross;
  const rawRestFrac = pacing.rest / gross;
  const rawOtherFrac = Math.max(0, 1 - rawWorkingFrac - rawRestFrac);

  // Apply minimum visible fraction to non-zero segments (BLD-2712).
  // Gate on raw fraction > 0 so segments with zero working/rest/other stay at 0
  // (a floored-up segment remains non-zero, which also correctly shows its texture).
  const { working: workingFrac, rest: restFrac, other: otherFrac } = applyMinSegmentFraction({
    working: rawWorkingFrac,
    rest: rawRestFrac,
    other: rawOtherFrac,
  });

  const workingLabel = formatPacingTime(pacing.working);
  const restLabel = formatPacingTime(pacing.rest);
  const otherLabel = formatPacingTime(pacing.other);

  const a11yLabel = pacing.isEmpty
    ? "Estimated pacing: No completed sets to analyze"
    : `Estimated pacing: Working ${formatPacingTimeSpoken(pacing.working)}, Rest ${formatPacingTimeSpoken(pacing.rest)}, Other ${formatPacingTimeSpoken(pacing.other)}`;

  return (
    <>
      <Card
        style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}
        testID="pacing-card"
      >
        <CardContent>
          {/* Header row */}
          <View style={styles.headerRow}>
            <Text variant="title" style={{ color: colors.onSurface, fontWeight: "700" }}>
              {"Estimated pacing"}
            </Text>
            <Pressable
              onPress={() => setDisclosureOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Show how pacing is calculated"
              accessibilityHint="Opens a brief explanation of how working time and rest are estimated"
              hitSlop={8}
              style={styles.infoButton}
            >
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
            </Pressable>
          </View>

          {/* Disclosure */}
          {disclosureOpen && (
            <Text
              variant="caption"
              style={[styles.disclosure, { color: colors.onSurfaceVariant }]}
            >
              {PACING_DISCLOSURE_COPY}
            </Text>
          )}

          {pacing.isEmpty ? (
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant, marginTop: spacing.xs }}
            >
              {"No completed sets to analyze"}
            </Text>
          ) : (
            <Pressable
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={a11yLabel}
              accessibilityHint="Double tap to open per-exercise breakdown"
            >
              {/* Stacked bar — extracted to PacingBar to keep PacingCard's
                  cyclomatic complexity under the ESLint ceiling. */}
              <PacingBar
                workingFrac={workingFrac}
                restFrac={restFrac}
                otherFrac={otherFrac}
                segColors={segColors}
                dividerColor={dividerColor}
              />

              {/* Labels */}
              <View style={styles.labelsRow}>
                <LabelChip label="Working" value={workingLabel} color={segColors.working} textColor={colors.onSurface} showHatch={false} showDash />
                <LabelChip label="Rest" value={restLabel} color={segColors.rest} textColor={colors.onSurface} showHatch={false} showDash={false} />
                <LabelChip label="Other" value={otherLabel} color={segColors.other} textColor={colors.onSurface} showHatch showDash={false} />
              </View>

              <Text
                variant="caption"
                style={{ color: colors.onSurfaceVariant, marginTop: spacing.xs, textAlign: "center" }}
              >
                Tap for per-exercise breakdown
              </Text>
            </Pressable>
          )}
        </CardContent>
      </Card>

      {sheetOpen && (
        <PacingBreakdownSheet
          pacing={pacing}
          exerciseNames={exerciseNames}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

// ─── LabelChip ────────────────────────────────────────────────────────────────

const LEGEND_DOT_SIZE = 8;

function LabelChip({
  label,
  value,
  color,
  textColor,
  showHatch,
  showDash,
}: {
  label: string;
  value: string;
  color: string;
  textColor: string;
  showHatch: boolean;
  showDash: boolean;
}) {
  return (
    <View style={styles.labelChip}>
      {/* Legend dot with optional CVD overlay (BLD-1939, BLD-2713/2714, BLD-2725) */}
      <View
        testID={`pacing-dot-${label.toLowerCase()}`}
        style={[styles.legendDot, { backgroundColor: color }]}
      >
        {showHatch && (
          <HatchOverlay
            width={LEGEND_DOT_SIZE}
            height={LEGEND_DOT_SIZE}
            testID={`pacing-dot-${label.toLowerCase()}-pattern`}
          />
        )}
        {showDash && (
          <WorkingDashOverlay
            width={LEGEND_DOT_SIZE}
            height={LEGEND_DOT_SIZE}
            testID={`pacing-dot-${label.toLowerCase()}-pattern`}
          />
        )}
      </View>
      <Text variant="caption" style={{ color: textColor, fontWeight: "600" }}>
        {label}
      </Text>
      <Text variant="caption" style={{ color: textColor }}>
        {" "}{value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BAR_HEIGHT = 18;

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  infoButton: { padding: 4 },
  disclosure: { marginBottom: 8, lineHeight: 18 },
  barContainer: { height: BAR_HEIGHT, flexDirection: "row", borderRadius: 4, overflow: "hidden", marginBottom: spacing.md },
  barSegment: { height: "100%" },
  // BLD-3880: fixed-width surface-coloured gap between adjacent pacing segments.
  // Fixed pixel width (not flex) so bar segment fractions are unaffected.
  segmentDivider: { width: SEGMENT_DIVIDER_WIDTH, height: "100%" },
  labelsRow: { flexDirection: "row", justifyContent: "space-around", flexWrap: "wrap", gap: spacing.sm },
  labelChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: LEGEND_DOT_SIZE, height: LEGEND_DOT_SIZE, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.18)", overflow: "hidden" },
});
