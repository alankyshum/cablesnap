import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { formatDateShort } from "@/lib/format";
import { toDisplay } from "@/lib/units";
import VariantChip from "./VariantChip";
import type { RecentPR } from "@/lib/db/pr-dashboard";

type Props = {
  prs: RecentPR[];
  weightUnit: "kg" | "lb";
  onPressExercise: (exerciseId: string) => void;
};

function formatDelta(pr: RecentPR, unit: "kg" | "lb"): string {
  if (pr.is_weighted && pr.weight != null && pr.previous_best != null) {
    const delta = toDisplay(pr.weight - pr.previous_best, unit);
    return `+${delta} ${unit}`;
  }
  if (!pr.is_weighted && pr.reps != null && pr.previous_best != null) {
    const delta = pr.reps - pr.previous_best;
    return `+${delta} reps`;
  }
  return "";
}

function formatValue(pr: RecentPR, unit: "kg" | "lb"): string {
  if (pr.is_weighted && pr.weight != null) {
    return `${toDisplay(pr.weight, unit)} ${unit}`;
  }
  if (!pr.is_weighted && pr.reps != null) {
    return `${pr.reps} reps`;
  }
  return "-";
}

type PrRowProps = {
  pr: RecentPR;
  showSeparator: boolean;
  weightUnit: "kg" | "lb";
  onPress: () => void;
};

function PrRow({ pr, showSeparator, weightUnit, onPress }: PrRowProps) {
  const colors = useThemeColors();
  const variant = pr.variants?.[0];
  const isUnspecified = variant
    ? (variant.attachment === null && variant.mountPosition === null &&
       variant.gripType === null && variant.stackUnitAtLog === null)
    : false;
  const value = formatValue(pr, weightUnit);
  const delta = formatDelta(pr, weightUnit);
  const variantLabel = variant && !isUnspecified
    ? `, variant: ${variant.attachment ?? "unspecified"}`
    : "";
  const a11yLabel = `${pr.name}${variantLabel}: ${value}, ${delta}, ${formatDateShort(pr.date)}`;

  return (
    <React.Fragment>
      <Pressable
        style={styles.prRow}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        <View style={[styles.nameCol, { overflow: "hidden" }]}>
          <Text style={{ color: colors.onSurface }}>{pr.name}</Text>
          {variant && !isUnspecified ? (
            <VariantChip variant={{
              attachment: variant.attachment,
              mountPosition: variant.mountPosition,
              gripType: variant.gripType,
              stackUnitAtLog: variant.stackUnitAtLog,
            }} />
          ) : variant && isUnspecified ? (
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              (unspecified)
            </Text>
          ) : null}
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {formatDateShort(pr.date)}
          </Text>
        </View>
        <View style={styles.valueCol}>
          <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
            {value}
          </Text>
          {delta ? (
            <Text variant="caption" style={{ color: colors.primary, fontWeight: "600" }}>
              {delta}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {showSeparator && <Separator style={{ marginVertical: 2 }} />}
    </React.Fragment>
  );
}

export default function RecentPRList({ prs, weightUnit, onPressExercise }: Props) {
  if (prs.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text
        variant="subtitle"
        style={[styles.sectionTitle]}
        accessibilityRole="header"
      >
        Recent PRs
      </Text>
      {prs.map((pr, i) => (
        <PrRow
          key={`${pr.exercise_id}-${pr.date}-${pr.variants?.[0]?.attachment ?? ""}`}
          pr={pr}
          showSeparator={i < prs.length - 1}
          weightUnit={weightUnit}
          onPress={() => onPressExercise(pr.exercise_id)}
        />
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
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 48,
  },
  nameCol: {
    flex: 1,
  },
  valueCol: {
    alignItems: "flex-end",
  },
});
