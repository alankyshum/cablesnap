import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  Button,
  Checkbox,
  IconButton,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addExerciseToTemplate,
  createExerciseLink,
  getTemplateById,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
  unlinkExerciseGroup,
  unlinkSingleExercise,
} from "../../lib/db";
import type { TemplateExercise, WorkoutTemplate } from "../../lib/types";

function linkLabel(exercises: TemplateExercise[], linkId: string, idx: number): string {
  const count = exercises.filter((e) => e.link_id === linkId).length;
  const custom = exercises.find((e) => e.link_id === linkId && e.link_label)?.link_label;
  if (custom) return custom;
  const letter = String.fromCharCode(65 + idx);
  return count >= 3 ? `Circuit ${letter}` : `Superset ${letter}`;
}

export default function EditTemplate() {
  const theme = useTheme();
  const router = useRouter();
  const { id, addExerciseId } = useLocalSearchParams<{
    id: string;
    addExerciseId?: string;
  }>();
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const handled = useRef<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState("");
  const [undo, setUndo] = useState<(() => Promise<void>) | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of exercises) {
      if (e.link_id && !ids.includes(e.link_id)) ids.push(e.link_id);
    }
    return ids;
  }, [exercises]);

  const palette = useMemo(
    () => [theme.colors.tertiary, theme.colors.secondary, theme.colors.primary, theme.colors.error, theme.colors.inversePrimary],
    [theme],
  );

  const load = useCallback(async () => {
    if (!id) return;
    const tpl = await getTemplateById(id);
    if (tpl) {
      setTemplate(tpl);
      setExercises(tpl.exercises ?? []);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  useEffect(() => {
    if (!addExerciseId || !id || handled.current === addExerciseId) return;
    handled.current = addExerciseId;
    addExerciseToTemplate(id, addExerciseId, exercises.length).then(() =>
      load()
    );
  }, [addExerciseId, id, exercises.length, load]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const remove = useCallback(async (teId: string) => {
    await removeExerciseFromTemplate(teId);
    await load();
  }, [load]);

  const move = useCallback(async (index: number, dir: -1 | 1) => {
    if (!id) return;
    const target = index + dir;
    if (target < 0 || target >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderTemplateExercises(id, ids);
    await load();
  }, [id, exercises, load]);

  const toggleSelect = (teId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teId)) next.delete(teId);
      else next.add(teId);
      return next;
    });
  };

  const startSelection = (preselect?: string) => {
    setSelecting(true);
    setSelected(preselect ? new Set([preselect]) : new Set());
  };

  const cancelSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const confirmLink = async () => {
    if (!id || selected.size < 2) return;
    const linkId = await createExerciseLink(id, [...selected]);
    setSelecting(false);
    setSelected(new Set());
    await load();
    setSnackbar("Exercises linked as superset");
    setUndo(() => async () => {
      await unlinkExerciseGroup(linkId);
      await load();
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setSnackbar("");
      setUndo(null);
    }, 5000);
  };

  const handleUnlink = async (linkId: string) => {
    await unlinkExerciseGroup(linkId);
    await load();
    const prev = exercises.filter((e) => e.link_id === linkId).map((e) => e.id);
    setSnackbar("Exercises unlinked");
    setUndo(() => async () => {
      if (id) {
        await createExerciseLink(id, prev);
        await load();
      }
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setSnackbar("");
      setUndo(null);
    }, 5000);
  };

  const handleUnlinkSingle = async (teId: string, linkId: string) => {
    await unlinkSingleExercise(teId, linkId);
    await load();
  };

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TemplateExercise>) => {
      const linkIdx = item.link_id ? linkIds.indexOf(item.link_id) : -1;
      const color = linkIdx >= 0 ? palette[linkIdx % palette.length] : undefined;
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
              <Text variant="labelMedium" style={{ color, flex: 1, fontWeight: "700" }}>
                {groupLabel}
              </Text>
              <IconButton
                icon="link-off"
                size={18}
                onPress={() => handleUnlink(item.link_id!)}
                accessibilityLabel={`Unlink ${groupLabel}`}
              />
            </View>
          )}

          <Pressable
            onLongPress={() => {
              if (!selecting) startSelection(item.id);
            }}
            style={[
              styles.row,
              {
                backgroundColor: theme.colors.surface,
                borderBottomColor: theme.colors.outlineVariant,
                borderLeftWidth: color ? 4 : 0,
                borderLeftColor: color ?? "transparent",
              },
            ]}
            accessibilityRole={selecting ? "checkbox" : "none"}
            accessibilityState={selecting ? { selected: selected.has(item.id) } : undefined}
            accessibilityLabel={selecting
              ? `Select ${item.exercise?.name ?? "exercise"} for superset`
              : undefined}
          >
            {selecting && (
              <Checkbox
                status={selected.has(item.id) ? "checked" : "unchecked"}
                onPress={() => toggleSelect(item.id)}
              />
            )}
            <View style={styles.info}>
              <Text
                variant="titleSmall"
                style={{
                  color: item.exercise?.deleted_at ? theme.colors.onSurfaceVariant : theme.colors.onSurface,
                  fontStyle: item.exercise?.deleted_at ? "italic" : "normal",
                }}
              >
                {item.exercise?.name ?? "Unknown"}{item.exercise?.deleted_at ? " (removed)" : ""}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {item.target_sets} × {item.target_reps} · {item.rest_seconds}s rest
              </Text>
              {item.exercise?.deleted_at && !selecting && (
                <Button
                  mode="text"
                  compact
                  onPress={() => router.push(`/template/${id}?replaceTeId=${item.id}`)}
                  style={{ alignSelf: "flex-start", minHeight: 48, minWidth: 48 }}
                  accessibilityLabel={`Replace ${item.exercise.name}`}
                  accessibilityRole="button"
                >
                  Replace
                </Button>
              )}
              {item.link_id && !selecting && !item.exercise?.deleted_at && (
                <Text variant="labelSmall" style={{ color, marginTop: 2 }}>
                  Linked — rotate in session
                </Text>
              )}
            </View>
            {!selecting && (
              <View style={styles.actions}>
                {item.link_id && (
                  <IconButton
                    icon="link-off"
                    size={16}
                    onPress={() => handleUnlinkSingle(item.id, item.link_id!)}
                    accessibilityLabel={`Remove ${item.exercise?.name ?? "exercise"} from superset`}
                  />
                )}
                <IconButton
                  icon="arrow-up"
                  size={18}
                  onPress={() => move(index, -1)}
                  disabled={index === 0}
                  accessibilityLabel={`Move ${item.exercise?.name ?? "exercise"} up`}
                />
                <IconButton
                  icon="arrow-down"
                  size={18}
                  onPress={() => move(index, 1)}
                  disabled={index === exercises.length - 1}
                  accessibilityLabel={`Move ${item.exercise?.name ?? "exercise"} down`}
                />
                <IconButton
                  icon="close"
                  size={18}
                  onPress={() => remove(item.id)}
                  accessibilityLabel={`Remove ${item.exercise?.name ?? "exercise"}`}
                />
              </View>
            )}
          </Pressable>

          {/* Bottom border for link group */}
          {isLast && item.link_id && (
            <View style={{ height: 4, backgroundColor: color, borderRadius: 2, marginBottom: 4 }} />
          )}
        </View>
      );
    },
    [theme, exercises, linkIds, palette, selecting, selected, move, remove]
  );

  if (!template) {
    return (
      <>
        <Stack.Screen options={{ title: "Template" }} />
        <View
          style={[
            styles.center,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            Loading...
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: template.name }} />
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.section}>
          <Text
            variant="titleMedium"
            style={{ color: theme.colors.onBackground }}
          >
            Exercises ({exercises.length})
          </Text>
        </View>

        {/* Selection mode toolbar */}
        {selecting && (
          <View style={[styles.selectionBar, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer, flex: 1 }}
              accessibilityLiveRegion="polite"
            >
              {selected.size} selected
            </Text>
            <Button
              mode="contained"
              compact
              onPress={confirmLink}
              disabled={selected.size < 2}
              style={{ marginRight: 8 }}
              accessibilityLabel="Link selected exercises"
            >
              Link
            </Button>
            <Button
              mode="text"
              compact
              onPress={cancelSelection}
              accessibilityLabel="Cancel selection"
            >
              Cancel
            </Button>
          </View>
        )}

        <FlatList
          data={exercises}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          extraData={[selecting, selected, linkIds]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                No exercises. Add some below.
              </Text>
            </View>
          }
          style={styles.list}
        />

        {!selecting && exercises.length >= 2 && (
          <Button
            mode="outlined"
            icon="link-variant"
            onPress={() => startSelection()}
            style={styles.addBtn}
            accessibilityLabel="Create superset"
            accessibilityRole="button"
          >
            Create Superset
          </Button>
        )}

        <Button
          mode="outlined"
          icon="plus"
          onPress={() =>
            router.push(`/template/pick-exercise?templateId=${id}&editId=${id}`)
          }
          style={styles.addBtn}
          accessibilityLabel="Add exercise to template"
        >
          Add Exercise
        </Button>
        <Button mode="contained" onPress={() => router.back()} style={styles.doneBtn} accessibilityLabel="Done editing template">
          Done
        </Button>
      </View>
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => {
          setSnackbar("");
          setUndo(null);
        }}
        duration={5000}
        accessibilityLiveRegion="polite"
        action={undo ? { label: "Undo", onPress: async () => {
          if (undo) await undo();
          setSnackbar("");
          setUndo(null);
        }} : undefined}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
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
  addBtn: {
    marginTop: 8,
  },
  doneBtn: {
    marginTop: 16,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  linkHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
});
