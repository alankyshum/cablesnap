import { StyleSheet, View } from "react-native";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { SET_TYPE_LABELS } from "@/lib/types";
import { rpeColor, rpeText } from "@/lib/rpe";
import type { ExerciseGroup } from "@/hooks/useSessionDetail";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  group: ExerciseGroup;
  groups: ExerciseGroup[];
  linkIds: string[];
  palette: string[];
  colors: ThemeColors;
};

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
          .map((set) => (
            <View key={set.id}>
              <View style={[styles.setRow, (() => {
                const st = set.set_type ?? "normal";
                if (st === "warmup") return { borderLeftWidth: 3, borderLeftColor: colors.surfaceVariant, paddingLeft: 5 };
                if (st === "dropset") return { borderLeftWidth: 3, borderLeftColor: colors.tertiaryContainer, paddingLeft: 5 };
                if (st === "failure") return { borderLeftWidth: 3, borderLeftColor: colors.errorContainer, paddingLeft: 5 };
                return {};
              })()]}>
                {(() => {
                  const st = set.set_type ?? "normal";
                  const label = SET_TYPE_LABELS[st];
                  if (label.short) {
                    const chipColors = st === "warmup"
                      ? { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant }
                      : st === "dropset"
                      ? { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer }
                      : { bg: colors.errorContainer, fg: colors.onErrorContainer };
                    return (
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: chipColors.bg, justifyContent: "center", alignItems: "center", marginRight: 8 }}>
                        <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: chipColors.fg }}>{label.short}</Text>
                      </View>
                    );
                  }
                  return (
                    <Text variant="body" style={[styles.setNum, { color: colors.onSurface }]}>
                      {set.round ? `R${set.round}` : `Set ${set.set_number}`}
                    </Text>
                  );
                })()}
                <Text variant="body" style={{ color: colors.onSurface }}>
                  {set.weight ?? 0} × {set.reps ?? 0}
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
          ))}
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
