import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/bna-toast";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useLayout } from "../../lib/layout";
import {
  addExerciseToTemplate,
  createTemplate,
  getTemplateById,
  getTemplateExerciseCount,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
  updateTemplateName,
  updateTemplateExercise,
} from "../../lib/db";
import type { Exercise, TemplateExercise, WorkoutTemplate } from "../../lib/types";
import ExercisePickerSheet from "../../components/ExercisePickerSheet";
import EditExerciseSheet from "../../components/EditExerciseSheet";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function CreateTemplate() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const params = useLocalSearchParams<{ templateId?: string }>();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateExercise | null>(null);
  const { error: showError } = useToast();

  useFocusEffect(
    useCallback(() => {
      if (template) {
        getTemplateById(template.id).then((tpl) => {
          if (tpl) setExercises(tpl.exercises ?? []);
        });
      } else if (params.templateId) {
        getTemplateById(params.templateId).then((tpl) => {
          if (tpl) {
            setTemplate(tpl);
            setName(tpl.name);
            setExercises(tpl.exercises ?? []);
          }
        });
      }
    }, [template, params.templateId])
  );

  const load = useCallback(async () => {
    if (!template) return;
    const tpl = await getTemplateById(template.id);
    if (tpl) setExercises(tpl.exercises ?? []);
  }, [template]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Template name is required.");
      return;
    }
    setSaving(true);
    try {
      if (!template) {
        const tpl = await createTemplate(trimmed);
        setTemplate(tpl);
        Alert.alert("Template Created", "Now add exercises to your template.");
      } else {
        if (exercises.length === 0) {
          Alert.alert("Validation", "Add at least 1 exercise to your template.");
          setSaving(false);
          return;
        }
        if (trimmed !== template.name) {
          await updateTemplateName(template.id, trimmed);
        }
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = useCallback(async (eid: string) => {
    await removeExerciseFromTemplate(eid);
    await load();
  }, [load]);

  const handlePickExercise = useCallback(async (exercise: Exercise) => {
    if (!template) return;
    setPickerOpen(false);
    const count = await getTemplateExerciseCount(template.id);
    await addExerciseToTemplate(template.id, exercise.id, count);
    await load();
  }, [template, load]);

  const move = useCallback(async (index: number, dir: -1 | 1) => {
    if (!template) return;
    const target = index + dir;
    if (target < 0 || target >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderTemplateExercises(template.id, ids);
    await load();
  }, [template, exercises, load]);

  const handleEditSave = useCallback(async (sets: number, reps: string, rest: number) => {
    if (!editing || !template) return;
    try {
      await updateTemplateExercise(editing.id, template.id, sets, reps, rest);
      setEditing(null);
      await load();
    } catch {
      showError("Failed to update exercise settings");
    }
  }, [editing, template, load, showError]);

  const renderItem = useCallback(
    ({ item, index }: { item: TemplateExercise; index: number }) => {
      const exName = item.exercise?.name ?? "exercise";
      return (
      <Pressable
        onPress={() => setEditing(item)}
        style={[styles.exerciseRow, { backgroundColor: colors.surface, borderBottomColor: colors.outlineVariant }]}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${exName} settings`}
      >
        <View style={styles.exerciseInfo}>
          <Text variant="subtitle" style={{ color: colors.onSurface }}>
            {item.exercise?.name ?? "Unknown Exercise"}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {item.target_sets} × {item.target_reps} · {item.rest_seconds}s rest
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => setEditing(item)} accessibilityLabel={`Edit ${exName} settings`} hitSlop={8} style={styles.iconBtn}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} accessibilityLabel={`Move ${exName} up`} hitSlop={8} style={styles.iconBtn}>
            <MaterialCommunityIcons name="arrow-up" size={18} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(index, 1)} disabled={index === exercises.length - 1} accessibilityLabel={`Move ${exName} down`} hitSlop={8} style={styles.iconBtn}>
            <MaterialCommunityIcons name="arrow-down" size={18} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(item.id)} accessibilityLabel={`Remove ${exName}`} hitSlop={8} style={styles.iconBtn}>
            <MaterialCommunityIcons name="close" size={18} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </Pressable>
      );
    },
    [colors, exercises.length, move, remove]
  );

  return (
    <>
      <Stack.Screen options={{ title: template ? "Edit Template" : "New Template" }} />
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding }]}
      >
        <Input
          placeholder="Template Name"
          value={name}
          onChangeText={setName}
          style={styles.input}
          accessibilityLabel="Template Name"
        />
        {template && (
          <>
            <View style={styles.section}>
              <Text variant="title" style={{ color: colors.onBackground }}>
                Exercises ({exercises.length})
              </Text>
            </View>
            <FlashList
              data={exercises}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
                    No exercises yet. Add some below.
                  </Text>
                </View>
              }
              style={styles.list}
            />
            <Button
              variant="outline"
              onPress={() => setPickerOpen(true)}
              style={styles.addBtn}
              accessibilityLabel="Add exercise to template"
              label="Add Exercise"
            />
          </>
        )}
        <Button
          variant="default"
          onPress={save}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
          accessibilityLabel={template ? "Done editing template" : "Create template"}
          label={template ? "Done" : "Create Template"}
        />
      </View>
      <ExercisePickerSheet visible={pickerOpen} onDismiss={() => setPickerOpen(false)} onPick={handlePickExercise} />
      <EditExerciseSheet visible={!!editing} exercise={editing} onSave={handleEditSave} onDismiss={() => setEditing(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 16,
  },
  input: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exerciseInfo: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    padding: 8,
  },
  addBtn: {
    marginTop: 8,
  },
  saveBtn: {
    marginTop: 16,
  },

  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
});
