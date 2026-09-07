import React from "react";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { toDisplay } from "@/lib/units";
import VariantChip from "./VariantChip";
import type { AllTimeBest, VariantBest } from "@/lib/db/pr-dashboard";

type Props = {
  bests: AllTimeBest[];
  weightUnit: "kg" | "lb";
  onPressExercise: (exerciseId: string) => void;
};

function groupByCategory(bests: AllTimeBest[]): { category: string; data: AllTimeBest[] }[] {
  const map = new Map<string, AllTimeBest[]>();
  for (const b of bests) {
    const existing = map.get(b.category);
    if (existing) existing.push(b);
    else map.set(b.category, [b]);
  }
  return Array.from(map.entries()).map(([category, data]) => ({ category, data }));
}

type BestRowItem = {
  key: string;
  item: AllTimeBest;
  variant?: VariantBest;
};

/** Expand a single AllTimeBest into one-per-variant rows for cable exercises. */
function expandRows(best: AllTimeBest): BestRowItem[] {
  if (best.variants && best.variants.length > 0) {
    // Sort by e1rm DESC for All-Time Bests
    const sorted = [...best.variants].sort((a, b) => b.e1rm - a.e1rm);
    return sorted.map((v, i) => ({
      key: `${best.exercise_id}-v${i}`,
      item: best,
      variant: v,
    }));
  }
  return [{ key: best.exercise_id, item: best }];
}

function isAllNull(v: VariantBest): boolean {
  return v.attachment === null && v.mountPosition === null &&
    v.gripType === null && v.stackUnitAtLog === null;
}

type BestRowProps = {
  row: BestRowItem;
  showSeparator: boolean;
  weightUnit: "kg" | "lb";
  onPress: () => void;
};

function buildBestRowA11y(
  item: AllTimeBest,
  variant: VariantBest | undefined,
  displayWeight: number | null,
  displayE1rm: number | null,
  displayReps: number | null,
  sessionCount: number,
  isUnspecified: boolean,
  weightUnit: "kg" | "lb",
): string {
  if (!item.is_weighted) return i18n._({ id: "components.progress.records.bestBodyweightA11y", message: "{name}: {reps} reps, {sessions} sessions", values: { name: item.name, reps: displayReps ?? 0, sessions: sessionCount } });
  const variantPart = variant
    ? (isUnspecified ? "(unspecified variant)" : `variant: ${variant.attachment ?? "–"} ${variant.mountPosition ?? "–"}`)
    : "";
  const weightPart = displayWeight != null ? `${toDisplay(displayWeight, weightUnit)} ${weightUnit}` : "";
  const e1rmPart = displayE1rm ? `estimated one rep max ${Math.round(toDisplay(displayE1rm, weightUnit))} ${weightUnit}` : "";
  const sessionPart = `${sessionCount} session${sessionCount !== 1 ? "s" : ""}`;
  return i18n._({
    id: "components.progress.records.bestWeightedA11y",
    message: "{name}{variant}{weight}{e1rm}, {sessions}",
    values: {
      name: item.name,
      variant: variantPart ? `, ${variantPart}` : "",
      weight: weightPart ? `, ${weightPart}` : "",
      e1rm: e1rmPart ? `, ${e1rmPart}` : "",
      sessions: sessionPart,
    },
  });
}

function BestRowValueDisplay({ item, displayWeight, displayE1rm, displayReps, weightUnit, colors }: {
  item: AllTimeBest;
  displayWeight: number | null;
  displayE1rm: number | null;
  displayReps: number | null;
  weightUnit: "kg" | "lb";
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (!item.is_weighted) {
    return (
      <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
        {displayReps} reps
      </Text>
    );
  }
  return (
    <>
      <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
        {displayWeight != null ? toDisplay(displayWeight, weightUnit) : "-"} {weightUnit}
      </Text>
      {displayE1rm != null ? (
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          e1RM: {Math.round(toDisplay(displayE1rm, weightUnit))} {weightUnit}
        </Text>
      ) : null}
    </>
  );
}

function BestRow({ row, showSeparator, weightUnit, onPress }: BestRowProps) {
  const colors = useThemeColors();
  const { item, variant } = row;
  const displayWeight = variant ? variant.weight : item.max_weight;
  const displayE1rm = variant ? variant.e1rm : item.est_1rm;
  const displayReps = variant ? null : item.max_reps;
  const sessionCount = variant ? variant.sessionCount : item.session_count;
  const isUnspecified = variant ? isAllNull(variant) : false;

  const a11yLabel = buildBestRowA11y(item, variant, displayWeight, displayE1rm, displayReps, sessionCount, isUnspecified, weightUnit);

  return (
    <React.Fragment>
      <Pressable
        style={styles.bestRow}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        <View style={{ flex: 1, overflow: "hidden" }}>
          <Text style={{ color: colors.onSurface }}>{item.name}</Text>
          {variant ? (
            isUnspecified ? (
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                (unspecified)
              </Text>
            ) : (
              <VariantChip variant={variant} />
            )
          ) : null}
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {sessionCount} session{sessionCount !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.valueCol}>
          <BestRowValueDisplay
            item={item}
            displayWeight={displayWeight}
            displayE1rm={displayE1rm}
            displayReps={displayReps}
            weightUnit={weightUnit}
            colors={colors}
          />
        </View>
      </Pressable>
      {showSeparator && <Separator style={{ marginVertical: 2 }} />}
    </React.Fragment>
  );
}

export default function AllTimeBestsSection({ bests, weightUnit, onPressExercise }: Props) {
  const colors = useThemeColors();

  if (bests.length === 0) return null;

  const sections = groupByCategory(bests);

  return (
    <View style={styles.container}>
      <Text
        variant="subtitle"
        style={[styles.sectionTitle, { color: colors.onSurface }]}
        accessibilityRole="header"
      >
        {t({ id: "components.progress.records.allTimeBests", message: "All-Time Bests" })}
      </Text>
      {sections.map((section) => (
        <View key={section.category} style={styles.categorySection}>
          <Text
            variant="caption"
            style={[styles.categoryHeader, { color: colors.onSurfaceVariant }]}
            accessibilityRole="header"
          >
            {section.category}
          </Text>
          {section.data.flatMap((item) => expandRows(item)).map((row, i, arr) => (
            <BestRow
              key={row.key}
              row={row}
              showSeparator={i < arr.length - 1}
              weightUnit={weightUnit}
              onPress={() => onPressExercise(row.item.exercise_id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  categorySection: {
    marginBottom: 12,
  },
  categoryHeader: {
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: "600",
  },
  bestRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 48,
  },
  valueCol: {
    alignItems: "flex-end",
  },
});
