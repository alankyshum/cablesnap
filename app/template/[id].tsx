import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/bna-toast";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useLayout } from "../../lib/layout";
import {
  addExerciseToTemplate,
  createExerciseLink,
  duplicateTemplate,
  getTemplateById,
  getTemplateExerciseCount,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
  unlinkExerciseGroup,
  unlinkSingleExercise,
  updateTemplateExercise,
} from "../../lib/db";
import type { Exercise, TemplateExercise, WorkoutTemplate } from "../../lib/types";
import SwipeToDelete from "../../components/SwipeToDelete";
import ExercisePickerSheet from "../../components/ExercisePickerSheet";
import EditExerciseSheet from "../../components/EditExerciseSheet";
import { useThemeColors } from "@/hooks/useThemeColors";

function linkLabel(exercises: TemplateExercise[], linkId: string, idx: number): string {
  const count = exercises.filter((e) => e.link_id === linkId).length;
  const custom = exercises.find((e) => e.link_id === linkId && e.link_label)?.link_label;
  if (custom) return custom;
  const letter = String.fromCharCode(65 + idx);
  return count >= 3 ? `Circuit ${letter}` : `Superset ${letter}`;
}

export default function EditTemplate() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, setUndo] = useState<(() => Promise<void>) | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateExercise | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { success, error: showError } = useToast();

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of exercises) {
      if (e.link_id && !ids.includes(e.link_id)) ids.push(e.link_id);
    }
    return ids;
  }, [exercises]);

  const palette = useMemo(
    () => [colors.tertiary, colors.secondary, colors.primary, colors.error, colors.inversePrimary],
    [colors],
  );

  const load = useCallback(async () => {
    if (!id) return;
    const tpl = await getTemplateById(id);
    if (tpl) {
      setTemplate(tpl);
      setExercises(tpl.exercises ?? []);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (id) load();
    }, [id, load])
  );

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
    const undoFn = async () => {
      await unlinkExerciseGroup(linkId);
      await load();
    };
    setUndo(() => undoFn);
    success("Exercises linked as superset", {
      action: {
        label: "Undo",
        onPress: async () => {
          await undoFn();
          setUndo(null);
        },
      },
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
    }, 5000);
  };

  const handleUnlink = useCallback(async (linkId: string) => {
    await unlinkExerciseGroup(linkId);
    await load();
    const prev = exercises.filter((e) => e.link_id === linkId).map((e) => e.id);
    const undoFn = async () => {
      if (id) {
        await createExerciseLink(id, prev);
        await load();
      }
    };
    setUndo(() => undoFn);
    success("Exercises unlinked", {
      action: {
        label: "Undo",
        onPress: async () => {
          await undoFn();
          setUndo(null);
        },
      },
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
    }, 5000);
  }, [exercises, id, load, success]);

  const handleUnlinkSingle = useCallback(async (teId: string, linkId: string) => {
    await unlinkSingleExercise(teId, linkId);
    await load();
  }, [load]);

  const handlePickExercise = useCallback(async (exercise: Exercise) => {
    if (!id) return;
    setPickerOpen(false);
    const count = await getTemplateExerciseCount(id);
    await addExerciseToTemplate(id, exercise.id, count);
    await load();
  }, [id, load]);

  const handleEditSave = useCallback(async (sets: number, reps: string, rest: number) => {
    if (!editing || !id) return;
    try {
      await updateTemplateExercise(editing.id, id, sets, reps, rest);
      setEditing(null);
      await load();
    } catch {
      showError("Failed to update exercise settings");
    }
  }, [editing, id, load, showError]);

  const renderItem = useCallback(
    ({ item, index }: { item: TemplateExercise; index: number }) => {
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
              <Text variant="caption" style={{ color, flex: 1, fontWeight: "700" }}>
                {groupLabel}
              </Text>
              <TouchableOpacity onPress={() => handleUnlink(item.link_id!)} accessibilityLabel={`Unlink ${groupLabel}`} hitSlop={8} style={{ padding: 8 }}>
                <MaterialCommunityIcons name="link-off" size={18} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
          )}

          <SwipeToDelete onDelete={() => remove(item.id)} enabled={!selecting}>
            <Pressable
              onPress={() => {
                if (selecting) {
                  toggleSelect(item.id);
                } else {
                  setEditing(item);
                }
              }}
              onLongPress={() => {
                if (!selecting) startSelection(item.id);
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
                  onCheckedChange={() => toggleSelect(item.id)}
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
                    onPress={() => router.push(`/template/${id}?replaceTeId=${item.id}`)}
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
                  <TouchableOpacity onPress={() => setEditing(item)} accessibilityLabel={`Edit ${item.exercise?.name ?? "exercise"} settings`} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.onSurface} />
                  </TouchableOpacity>
                  {item.link_id && (
                    <TouchableOpacity onPress={() => handleUnlinkSingle(item.id, item.link_id!)} accessibilityLabel={`Remove ${item.exercise?.name ?? "exercise"} from superset`} hitSlop={8} style={{ padding: 8 }}>
                      <MaterialCommunityIcons name="link-off" size={16} color={colors.onSurface} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} accessibilityLabel={`Move ${item.exercise?.name ?? "exercise"} up`} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-up" size={18} color={colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(index, 1)} disabled={index === exercises.length - 1} accessibilityLabel={`Move ${item.exercise?.name ?? "exercise"} down`} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-down" size={18} color={colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(item.id)} accessibilityLabel={`Remove ${item.exercise?.name ?? "exercise"}`} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.onSurface} />
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
    },
    [colors, exercises, linkIds, palette, selecting, selected, move, remove, handleUnlink, handleUnlinkSingle, id, router]
  );

  if (!template) {
    return (
      <>
        <Stack.Screen options={{ title: "Template" }} />
        <View
          style={[
            styles.center,
            { backgroundColor: colors.background },
          ]}
        >
          <Text style={{ color: colors.onSurfaceVariant }}>
            Loading...
          </Text>
        </View>
      </>
    );
  }

  const starter = template.is_starter;

  const handleDuplicate = async () => {
    const newId = await duplicateTemplate(template.id);
    router.replace(`/template/${newId}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: template.name }} />
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding }]}
      >
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text
              variant="title"
              style={{ color: colors.onBackground }}
            >
              Exercises ({exercises.length})
            </Text>
            {starter && (
              <Chip
                accessibilityLabel="Starter template, read-only. Duplicate to edit."
              >
                STARTER
              </Chip>
            )}
          </View>
        </View>

        {/* Selection mode toolbar */}
        {selecting && !starter && (
          <View style={[styles.selectionBar, { backgroundColor: colors.primaryContainer }]}>
            <Text variant="body" style={{ color: colors.onPrimaryContainer, flex: 1 }}
              accessibilityLiveRegion="polite"
            >
              {selected.size} selected
            </Text>
            <Button
              variant="default"
              onPress={confirmLink}
              disabled={selected.size < 2}
              style={{ marginRight: 8 }}
              accessibilityLabel="Link selected exercises"
              label="Link"
            />
            <Button
              variant="ghost"
              onPress={cancelSelection}
              accessibilityLabel="Cancel selection"
              label="Cancel"
            />
          </View>
        )}

        <FlashList
          data={exercises}
          renderItem={starter ? ({ item }: { item: TemplateExercise }) => {
            const linkIdx = item.link_id ? linkIds.indexOf(item.link_id) : -1;
            const color = linkIdx >= 0 ? palette[linkIdx % palette.length] : undefined;
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
          } : renderItem}
          keyExtractor={(item) => item.id}
          extraData={[selecting, selected, linkIds]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text
                variant="body"
                style={{ color: colors.onSurfaceVariant }}
              >
                No exercises. Add some below.
              </Text>
            </View>
          }
          style={styles.list}
        />

        {starter ? (
          <Button
            variant="default"
            onPress={handleDuplicate}
            style={styles.doneBtn}
            accessibilityLabel="Duplicate to edit"
            label="Duplicate to Edit"
          />
        ) : (
          <>
            {!selecting && exercises.length >= 2 && (
              <Button
                variant="outline"
                onPress={() => startSelection()}
                style={styles.addBtn}
                accessibilityLabel="Create superset"
                accessibilityRole="button"
                label="Create Superset"
              />
            )}

            <Button
              variant="outline"
              onPress={() => setPickerOpen(true)}
              style={styles.addBtn}
              accessibilityLabel="Add exercise to template"
              label="Add Exercise"
            />
            <Button variant="default" onPress={() => router.back()} style={styles.doneBtn} accessibilityLabel="Done editing template" label="Done" />
          </>
        )}
      </View>
      <ExercisePickerSheet
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        onPick={handlePickExercise}
      />
      <EditExerciseSheet
        visible={!!editing}
        exercise={editing}
        onSave={handleEditSave}
        onDismiss={() => setEditing(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
