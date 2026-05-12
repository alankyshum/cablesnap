import { StyleSheet, View } from "react-native";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { SET_TYPE_LABELS } from "@/lib/types";
import type { SetType } from "@/lib/types";
import { rpeColor, rpeText } from "@/lib/rpe";
import type { ExerciseGroup } from "@/hooks/useSessionDetail";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { normalizeSetType, ADVANCED_SET_TYPES } from "@/lib/db/sets";
import { formatMiniSetReps, formatAdvancedSetAccessibilityLabel } from "@/lib/format";

type Props = {
  group: ExerciseGroup;
  groups: ExerciseGroup[];
  linkIds: string[];
  palette: string[];
  colors: ThemeColors;
};

function getSetChipColors(st: SetType, colors: ThemeColors): { bg: string; fg: string } | null {
  switch (st) {
    case "warmup": return { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant };
    case "dropset": return { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer };
    case "failure": return { bg: colors.errorContainer, fg: colors.onErrorContainer };
    case "rest_pause": return { bg: colors.primaryContainer, fg: colors.onPrimaryContainer };
    case "cluster": return { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer };
    case "myo_reps": return { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer };
    default: return null;
  }
}

function getSetBorderColor(st: SetType, colors: ThemeColors): string | undefined {
  switch (st) {
    case "warmup": return colors.surfaceVariant;
    case "dropset": return colors.tertiaryContainer;
    case "failure": return colors.errorContainer;
    case "rest_pause": return colors.primaryContainer;
    case "cluster": return colors.secondaryContainer;
    case "myo_reps": return colors.tertiaryContainer;
    default: return undefined;
  }
}

export function ExerciseGroupRow({ group, groups, linkIds, palette, colors }: Props) {
  const linked = group.link_id ? groups.filter((g) => g.link_id === group.link_id) : [];
  const isFirst = group.link_id ? linked[0]?.exercise_id === group.exercise_id : false;
  const isLast = group.link_id ? linked[linked.length - 1]?.exercise_id === group.exercise_id : false;
  const tag = group.link_id
    ? linked.length >= 3 ? "Circuit" : "Superset"
    : "";
  const groupColorIdx = group.link_id ? linkIds.indexOf(group.link_id) : -1;
  const groupColor = groupColorIdx >= 0 ? palette[groupColorIdx % palette.length] : undefined;

  return (
    <View style={styles.group}>
      {isFirst && group.link_id && (
        <View
          style={[styles.linkHeader, { borderLeftColor: groupColor }]}
          accessibilityLabel={`${tag}: ${linked.map((g) => g.name).join(" and ")}`}
        >
          <Text variant="caption" style={{ color: groupColor, fontWeight: "700" }}>
            {tag}
          </Text>
        </View>
      )}
      <View style={group.link_id ? { borderLeftWidth: 4, borderLeftColor: groupColor, paddingLeft: 8 } : undefined}>
        <Text variant="title" style={[styles.groupTitle, { color: colors.primary }]}>
          {group.name}
        </Text>
        {group.swapped_from_name && (
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, fontStyle: "italic", marginBottom: 4, marginTop: -2 }}
            accessibilityLabel={`Swapped from ${group.swapped_from_name}`}
          >
            Swapped from {group.swapped_from_name}
          </Text>
        )}
        {group.sets
          .filter((s) => s.completed)
          .map((set) => {
            const st = normalizeSetType(set.set_type) as SetType;
            const label = SET_TYPE_LABELS[st];
            const isAdvanced = ADVANCED_SET_TYPES.has(st);
            const segments = set.segments ?? [];
            const repsDisplay = isAdvanced
              ? formatMiniSetReps(segments)
              : String(set.reps ?? 0);
            const a11yLabel = isAdvanced
              ? `${formatAdvancedSetAccessibilityLabel(label.label, segments.length)}, ${set.weight ?? 0} × ${repsDisplay}`
              : undefined;

            const chipColors = getSetChipColors(st, colors);
            const borderColor = getSetBorderColor(st, colors);

            return (
              <View
                key={set.id}
                accessibilityLabel={a11yLabel}
                accessibilityRole={isAdvanced ? "text" : undefined}
              >
                <View style={[
                  styles.setRow,
                  borderColor ? { borderLeftWidth: 3, borderLeftColor: borderColor, paddingLeft: 5 } : undefined,
                ]}>
                  {label.short ? (
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: chipColors!.bg, justifyContent: "center", alignItems: "center", marginRight: 8 }}>
                      <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: chipColors!.fg }}>{label.short}</Text>
                    </View>
                  ) : (
                    <Text variant="body" style={[styles.setNum, { color: colors.onSurface }]}>
                      {set.round ? `R${set.round}` : `Set ${set.set_number}`}
                    </Text>
                  )}
                  <Text variant="body" style={{ color: colors.onSurface }}>
                    {set.weight ?? 0} × {repsDisplay}
                  </Text>
                  {set.tempo && (
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}>
                      ♩ {set.tempo}
                    </Text>
                  )}
                  {set.rpe != null && (
                    <View style={[styles.rpeBadge, { backgroundColor: rpeColor(set.rpe) }]}>
                      <Text style={{ color: rpeText(set.rpe), fontSize: fontSizes.xs, fontWeight: "600" }}>
                        RPE {set.rpe}
                      </Text>
                    </View>
                  )}
                </View>
                {set.notes ? (
                  <Text variant="caption" style={[styles.setNote, { color: colors.onSurfaceVariant }]}>
                    {set.notes}
                  </Text>
                ) : null}
              </View>
            );
          })}
      </View>
      {isLast && group.link_id && (
        <View style={{ height: 4, backgroundColor: groupColor, borderRadius: 2 }} />
      )}
      <Separator style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: 8,
  },
  groupTitle: {
    marginBottom: 8,
    fontWeight: "700",
  },
  setRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  setNum: {
    width: 60,
  },
  rpeBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  setNote: {
    fontStyle: "italic",
    paddingHorizontal: 8,
    paddingBottom: 4,
    fontSize: fontSizes.xs,
  },
  divider: {
    marginTop: 8,
    marginBottom: 12,
  },
  linkHeader: {
    borderLeftWidth: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
});
