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
 * CVD accessibility (BLD-1939): The "Other" segment carries a diagonal hatch
 * overlay so it is distinguishable from "Working" under deuteranopia/protanopia.
 * The hatch is additive — full-colour appearance for sighted users is unchanged.
 */

import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { formatPacingTime, formatPacingTimeSpoken, type PacingBreakdown } from "@/lib/session-pacing";
import PacingBreakdownSheet from "./PacingBreakdownSheet";
import { spacing } from "@/constants/design-tokens";

// ─── ⓘ Disclosure copy (verbatim AC§147) ─────────────────────────────────────
export const PACING_DISCLOSURE_COPY =
  "Working time is estimated as roughly 2 seconds per rep (or recorded duration for time-based sets). Rest is the remaining gap between consecutive sets.";

// ─── Segment colours (CVD-safe: blue, coral, grey — distinct hue + luminance) ─
function useSegmentColors() {
  const colors = useThemeColors();
  return {
    working: colors.primary,          // Electric Coral
    rest: colors.heatmapLow,          // Blue (#1E88E5 / dark variant)
    other: colors.onSurfaceVariant,   // Mid grey — legible on card background
  };
}

// ─── Diagonal hatch overlay (BLD-1939 CVD fix) ───────────────────────────────
//
// Renders an SVG diagonal stripe pattern as an absolute-fill overlay.
// The overlay is purely decorative: aria-hidden + accessibilityElementsHidden
// so it does not pollute the a11y tree. pointerEvents="none" ensures taps
// pass through to the parent Pressable.
//
// The hatch stroke colour is semi-transparent white so it works on both
// light and dark themes without hardcoding a specific shade.

const HATCH_PATTERN_ID = "pacing-other-hatch";
const HATCH_SIZE = 6;          // tile size in px
const HATCH_STROKE_WIDTH = 1.5;
const HATCH_STROKE_COLOR = "rgba(255,255,255,0.55)"; // semi-white for theme-agnostic contrast

type HatchOverlayProps = {
  /** Width and height of the area to cover. Pass explicit values for the bar
   *  segment (determined by flex at runtime) or the legend dot (8×8). */
  width: number;
  height: number;
  testID?: string;
};

/**
 * HatchOverlay — decorative diagonal stripe fill.
 * Caller is responsible for positioning (absoluteFill or explicit dimensions).
 */
export function HatchOverlay({ width, height, testID }: HatchOverlayProps) {
  if (width <= 0 || height <= 0) return null;
  return (
    <Svg
      width={width}
      height={height}
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
          patternTransform="rotate(45)"
        >
          <Line
            x1="0"
            y1="0"
            x2="0"
            y2={HATCH_SIZE}
            stroke={HATCH_STROKE_COLOR}
            strokeWidth={HATCH_STROKE_WIDTH}
          />
        </Pattern>
      </Defs>
      <Rect
        x="0"
        y="0"
        width={width}
        height={height}
        fill={`url(#${HATCH_PATTERN_ID})`}
      />
    </Svg>
  );
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  const gross = pacing.gross > 0 ? pacing.gross : 1; // avoid division by zero
  const workingFrac = pacing.working / gross;
  const restFrac = pacing.rest / gross;
  const otherFrac = Math.max(0, 1 - workingFrac - restFrac);

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
              <Text style={{ color: colors.primary, fontSize: 16 }}>ⓘ</Text>
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
              {/* Stacked bar */}
              <View
                style={styles.barContainer}
                {...(Platform.OS !== 'web' ? { accessibilityElementsHidden: true } : {})}
              >
                <View
                  testID="pacing-seg-working"
                  style={[
                    styles.barSegment,
                    { flex: workingFrac, backgroundColor: segColors.working, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
                  ]}
                />
                <View
                  testID="pacing-seg-rest"
                  style={[
                    styles.barSegment,
                    { flex: restFrac, backgroundColor: segColors.rest },
                  ]}
                />
                {/* Other segment: hatch overlay for CVD (BLD-1939) */}
                <View
                  testID="pacing-seg-other"
                  style={[
                    styles.barSegment,
                    { flex: otherFrac, backgroundColor: segColors.other, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
                  ]}
                >
                  {otherFrac > 0 && (
                    <HatchOverlay
                      width={BAR_HEIGHT}
                      height={BAR_HEIGHT}
                      testID="pacing-seg-other-pattern"
                    />
                  )}
                </View>
              </View>

              {/* Labels */}
              <View style={styles.labelsRow}>
                <LabelChip label="Working" value={workingLabel} color={segColors.working} textColor={colors.onSurface} showHatch={false} />
                <LabelChip label="Rest" value={restLabel} color={segColors.rest} textColor={colors.onSurface} showHatch={false} />
                <LabelChip label="Other" value={otherLabel} color={segColors.other} textColor={colors.onSurface} showHatch />
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
}: {
  label: string;
  value: string;
  color: string;
  textColor: string;
  showHatch: boolean;
}) {
  return (
    <View style={styles.labelChip}>
      {/* Legend dot with optional hatch overlay (BLD-1939) */}
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
  barContainer: { height: BAR_HEIGHT, flexDirection: "row", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  barSegment: { height: "100%" },
  labelsRow: { flexDirection: "row", justifyContent: "space-around", flexWrap: "wrap", gap: 4 },
  labelChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot: { width: LEGEND_DOT_SIZE, height: LEGEND_DOT_SIZE, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.18)", overflow: "hidden" },
});
