/* eslint-disable complexity */
import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import SwipeToDelete from "@/components/SwipeToDelete";
import { linkLabel } from "@/hooks/useTemplateEditor";
import type { TemplateExercise } from "@/lib/types";
import type { ThemeColors } from "@/hooks/useThemeColors";

export type TemplateExerciseRowProps = {
  item: TemplateExercise;
  index: number;
  exercises: TemplateExercise[];
  linkIds: string[];
  palette: string[];
  selecting: boolean;
  selected: Set<string>;
  colors: ThemeColors;
  starter: boolean;
  templateId: string | undefined;
  onToggleSelect: (teId: string) => void;
  onEdit: (item: TemplateExercise) => void;
  onStartSelection: (preselect?: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (teId: string) => void;
  onUnlink: (linkId: string) => void;
  onUnlinkSingle: (teId: string, linkId: string) => void;
  onReplace: (teId: string) => void;
};

export function TemplateExerciseRow({
  item,
  index,
  exercises,
  linkIds,
  palette,
  selecting,
  selected,
  colors,
  starter,
  onToggleSelect,
  onEdit,
  onStartSelection,
  onMove,
  onRemove,
  onUnlink,
  onUnlinkSingle,
  onReplace,
}: TemplateExerciseRowProps) {
  const linkIdx = item.link_id ? linkIds.indexOf(item.link_id) : -1;
  const color = linkIdx >= 0 ? palette[linkIdx % palette.length] : undefined;

  if (starter) {
    return (
      <Pressable
        style={[
          styles.row,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.outlineVariant,
            borderLeftWidth: color ? 4 : 0,
            borderLeftColor: color ?? "transparent",
          },
        ]}
        accessibilityRole="none"
      >
        <View style={styles.info}>
          <Text
            variant="subtitle"
            style={{
              color: item.exercise?.deleted_at ? colors.onSurfaceVariant : colors.onSurface,
              fontStyle: item.exercise?.deleted_at ? "italic" : "normal",
            }}
          >
            {item.exercise?.name ?? "Unknown"}{item.exercise?.deleted_at ? " (removed)" : ""}
          </Text>
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant }}
          >
            {item.target_sets} × {item.target_reps} · {item.rest_seconds}s rest
          </Text>
        </View>
      </Pressable>
    );
  }

  const isFirst = item.link_id ? exercises.findIndex((e) => e.link_id === item.link_id) === index : false;
  const isLast = item.link_id ? exercises.findLastIndex((e) => e.link_id === item.link_id) === index : false;
  const groupLabel = item.link_id ? linkLabel(exercises, item.link_id, linkIdx) : "";

  return (
    <View>
      {/* Link group header */}
      {isFirst && item.link_id && (
        <View
          style={[styles.linkHeader, { borderLeftColor: color, borderLeftWidth: 4 }]}
          accessibilityRole="header"
          accessibilityLabel={`${groupLabel}: ${exercises
            .filter((e) => e.link_id === item.link_id)
            .map((e) => e.exercise?.name)
            .join(" and ")}, ${exercises.filter((e) => e.link_id === item.link_id).length} exercises linked`}
        >
          <Text variant="caption" style={{ color, flex: 1, fontWeight: "700" }}>
            {groupLabel}
          </Text>
          <TouchableOpacity onPress={() => onUnlink(item.link_id!)} accessibilityLabel={`Unlink ${groupLabel}`} hitSlop={8} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="link-off" size={18} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      )}

      <SwipeToDelete onDelete={() => onRemove(item.id)} enabled={!selecting} showHint={index === 0}>
        <Pressable
          onPress={() => {
            if (selecting) {
              onToggleSelect(item.id);
            } else {
              onEdit(item);
            }
          }}
          onLongPress={() => {
            if (!selecting) onStartSelection(item.id);
          }}
          style={[
            styles.row,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.outlineVariant,
              borderLeftWidth: color ? 4 : 0,
              borderLeftColor: color ?? "transparent",
            },
          ]}
          accessibilityRole={selecting ? "checkbox" : "button"}
          accessibilityState={selecting ? { selected: selected.has(item.id) } : undefined}
          accessibilityLabel={selecting
            ? `Select ${item.exercise?.name ?? "exercise"} for superset`
            : `Edit ${item.exercise?.name ?? "exercise"} settings`}
        >
          {selecting && (
            <Checkbox
              checked={selected.has(item.id)}
              onCheckedChange={() => onToggleSelect(item.id)}
            />
          )}
          <View style={styles.info}>
            <Text
              variant="subtitle"
              style={{
                color: item.exercise?.deleted_at ? colors.onSurfaceVariant : colors.onSurface,
                fontStyle: item.exercise?.deleted_at ? "italic" : "normal",
              }}
            >
              {item.exercise?.name ?? "Unknown"}{item.exercise?.deleted_at ? " (removed)" : ""}
            </Text>
            <Text
              variant="caption"
              style={{ color: colors.onSurfaceVariant }}
            >
              {item.target_sets} × {item.target_reps} · {item.rest_seconds}s rest
            </Text>
            {item.exercise?.deleted_at && !selecting && (
              <Button
                variant="ghost"
                onPress={() => onReplace(item.id)}
                style={{ alignSelf: "flex-start", minHeight: 48, minWidth: 48 }}
                accessibilityLabel={`Replace ${item.exercise.name}`}
                accessibilityRole="button"
                label="Replace"
              />
            )}
            {item.link_id && !selecting && !item.exercise?.deleted_at && (
              <Text variant="caption" style={{ color, marginTop: 2 }}>
                Linked — rotate in session
              </Text>
            )}
          </View>
          {!selecting && (
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => onEdit(item)} accessibilityLabel={`Edit ${item.exercise?.name ?? "exercise"} settings`} hitSlop={8} style={{ padding: 8 }}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.onSurface} />
              </TouchableOpacity>
              {item.link_id && (
                <TouchableOpacity onPress={() => onUnlinkSingle(item.id, item.link_id!)} accessibilityLabel={`Remove ${item.exercise?.name ?? "exercise"} from superset`} hitSlop={8} style={{ padding: 8 }}>
                  <MaterialCommunityIcons name="link-off" size={16} color={colors.onSurface} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => onMove(index, -1)} disabled={index === 0} accessibilityLabel={`Move ${item.exercise?.name ?? "exercise"} up`} hitSlop={8} style={{ padding: 8 }}>
                <MaterialCommunityIcons name="arrow-up" size={18} color={colors.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onMove(index, 1)} disabled={index === exercises.length - 1} accessibilityLabel={`Move ${item.exercise?.name ?? "exercise"} down`} hitSlop={8} style={{ padding: 8 }}>
                <MaterialCommunityIcons name="arrow-down" size={18} color={colors.onSurface} />
              </TouchableOpacity>

            </View>
          )}
        </Pressable>
      </SwipeToDelete>

      {/* Bottom border for link group */}
      {isLast && item.link_id && (
        <View style={{ height: 4, backgroundColor: color, borderRadius: 2, marginBottom: 4 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  info: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  linkHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
});
