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
 */

import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";
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
                accessibilityElementsHidden
              >
                <View
                  style={[
                    styles.barSegment,
                    { flex: workingFrac, backgroundColor: segColors.working, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
                  ]}
                />
                <View
                  style={[
                    styles.barSegment,
                    { flex: restFrac, backgroundColor: segColors.rest },
                  ]}
                />
                <View
                  style={[
                    styles.barSegment,
                    { flex: otherFrac, backgroundColor: segColors.other, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
                  ]}
                />
              </View>

              {/* Labels */}
              <View style={styles.labelsRow}>
                <LabelChip label="Working" value={workingLabel} color={segColors.working} textColor={colors.onSurface} />
                <LabelChip label="Rest" value={restLabel} color={segColors.rest} textColor={colors.onSurface} />
                <LabelChip label="Other" value={otherLabel} color={segColors.other} textColor={colors.onSurface} />
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

function LabelChip({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: string;
  color: string;
  textColor: string;
}) {
  return (
    <View style={styles.labelChip}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text variant="caption" style={{ color: textColor, fontWeight: "600" }}>
        {label}
      </Text>
      <Text variant="caption" style={{ color: textColor }}>
        {" "}{value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  infoButton: { padding: 4 },
  disclosure: { marginBottom: 8, lineHeight: 18 },
  barContainer: { height: 18, flexDirection: "row", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  barSegment: { height: "100%" },
  labelsRow: { flexDirection: "row", justifyContent: "space-around", flexWrap: "wrap", gap: 4 },
  labelChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.18)" },
});
