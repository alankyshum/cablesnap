/**
 * PacingBreakdownSheet — per-exercise pacing table (BLD-1144).
 *
 * Bottom sheet showing Working / Rest / Other per exercise, sortable by header tap.
 * Snap points: 50% / 90%.
 * Auto-dismisses if sheet data is gone (session deleted while open).
 *
 * Valenced words ("Idle", "Wasted", "Inactive", "Off-task", "Distraction") are
 * FORBIDDEN in this file — enforced by source-contracts-batch.test.ts.
 */

import { useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { BottomSheet, useBottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { formatPacingTime, type PacingBreakdown, type ExercisePacing } from "@/lib/session-pacing";
import { spacing } from "@/constants/design-tokens";
import { useEffect } from "react";

type SortKey = "working" | "rest" | "other";
type SortDir = "desc" | "asc";

type Props = {
  pacing: PacingBreakdown;
  exerciseNames: Record<string, string>;
  onClose: () => void;
};

export default function PacingBreakdownSheet({ pacing, exerciseNames, onClose }: Props) {
  const colors = useThemeColors();
  const sheet = useBottomSheet();
  const [sortKey, setSortKey] = useState<SortKey>("working");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Open sheet on mount; auto-close when pacing data disappears
  useEffect(() => {
    sheet.open();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  useEffect(() => {
    if (!pacing) sheet.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sheet ref is stable
  }, [pacing]);

  const handleClose = () => {
    sheet.close();
    onClose();
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...pacing.perExercise].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  const arrowFor = (key: SortKey) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  return (
    <BottomSheet
      isVisible={sheet.isVisible}
      onClose={handleClose}
      title="Pacing by exercise"
      snapPoints={[0.5, 0.9]}
      enableBackdropDismiss
    >
      <View style={styles.tableContainer}>
        {/* Table header */}
        <View style={[styles.headerRow, { borderBottomColor: colors.outline }]}>
          <Text
            variant="caption"
            style={[styles.nameCell, { color: colors.onSurfaceVariant }]}
          >
            Exercise
          </Text>
          {(["working", "rest", "other"] as SortKey[]).map((col) => (
            <TouchableOpacity
              key={col}
              onPress={() => handleSort(col)}
              style={styles.valueCell}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${col}`}
            >
              <Text
                variant="caption"
                style={{
                  color: sortKey === col ? colors.primary : colors.onSurfaceVariant,
                  fontWeight: sortKey === col ? "700" : "400",
                }}
              >
                {col === "working" ? "Working" : col === "rest" ? "Rest" : "Other"}
                {arrowFor(col)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Table rows */}
        <ScrollView showsVerticalScrollIndicator={false} testID="pacing-breakdown-row-scroll">
          {sorted.map((row) => (
            <ExerciseRow
              key={row.exercise_id}
              row={row}
              name={exerciseNames[row.exercise_id] ?? row.exercise_id}
              colors={colors}
            />
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

function ExerciseRow({
  row,
  name,
  colors,
}: {
  row: ExercisePacing;
  name: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[styles.dataRow, { borderBottomColor: colors.outlineVariant }]}
      accessible
      accessibilityLabel={`${name}: Working ${formatPacingTime(row.working)}, Rest ${formatPacingTime(row.rest)}, Other ${formatPacingTime(row.other)}`}
    >
      <Text variant="body" numberOfLines={2} style={[styles.nameCell, { color: colors.onSurface }]}>
        {name}
      </Text>
      <Text variant="caption" style={[styles.valueCell, { color: colors.onSurface }]}>
        {formatPacingTime(row.working)}
      </Text>
      <Text variant="caption" style={[styles.valueCell, { color: colors.onSurface }]}>
        {formatPacingTime(row.rest)}
      </Text>
      <Text variant="caption" style={[styles.valueCell, { color: colors.onSurface }]}>
        {formatPacingTime(row.other)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tableContainer: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameCell: { flex: 2, paddingRight: spacing.xs },
  valueCell: { flex: 1, textAlign: "right" },
});
