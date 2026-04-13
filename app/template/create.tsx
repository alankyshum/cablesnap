import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  Button,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addExerciseToTemplate,
  createTemplate,
  getTemplateById,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
} from "../../lib/db";
import type { TemplateExercise, WorkoutTemplate } from "../../lib/types";

export default function CreateTemplate() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    templateId?: string;
    addExerciseId?: string;
  }>();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const handled = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!template) return;
    const tpl = await getTemplateById(template.id);
    if (tpl) setExercises(tpl.exercises ?? []);
  }, [template]);

  useEffect(() => {
    load();
  }, [load]);

  // Hydrate template from templateId param (returning from picker)
  useEffect(() => {
    if (!params.templateId || template) return;
    getTemplateById(params.templateId).then((tpl) => {
      if (tpl) {
        setTemplate(tpl);
        setName(tpl.name);
        setExercises(tpl.exercises ?? []);
      }
    });
  }, [params.templateId, template]);

  // Handle exercise added from picker
  useEffect(() => {
    if (!params.addExerciseId || !template || handled.current === params.addExerciseId) return;
    handled.current = params.addExerciseId;
    addExerciseToTemplate(
      template.id,
      params.addExerciseId,
      exercises.length
    ).then(() => load());
  }, [params.addExerciseId, template, exercises.length, load]);

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
        Alert.alert(
          "Template Created",
          "Now add exercises to your template.",
        );
      } else {
        if (exercises.length === 0) {
          Alert.alert("Validation", "Add at least 1 exercise to your template.");
          setSaving(false);
          return;
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

  const move = useCallback(async (index: number, dir: -1 | 1) => {
    if (!template) return;
    const target = index + dir;
    if (target < 0 || target >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderTemplateExercises(template.id, ids);
    await load();
  }, [template, exercises, load]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TemplateExercise>) => (
      <View
        style={[
          styles.exerciseRow,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <View style={styles.exerciseInfo}>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
            {item.exercise?.name ?? "Unknown Exercise"}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {item.target_sets} × {item.target_reps} · {item.rest_seconds}s rest
          </Text>
        </View>
        <View style={styles.actions}>
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
      </View>
    ),
    [theme, exercises.length, move, remove]
  );

  return (
    <>
      <Stack.Screen
        options={{ title: template ? "Edit Template" : "New Template" }}
      />
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <TextInput
          label="Template Name"
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={styles.input}
          placeholder="e.g. Push Day, Full Body A"
        />
        {template && (
          <>
            <View style={styles.section}>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onBackground }}
              >
                Exercises ({exercises.length})
              </Text>
            </View>
            <FlatList
              data={exercises}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    No exercises yet. Add some below.
                  </Text>
                </View>
              }
              style={styles.list}
            />
            <Button
              mode="outlined"
              icon="plus"
              onPress={() =>
                router.push(
                  `/template/pick-exercise?templateId=${template.id}`
                )
              }
              style={styles.addBtn}
              accessibilityLabel="Add exercise to template"
            >
              Add Exercise
            </Button>
          </>
        )}
        <Button
          mode="contained"
          onPress={save}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
          accessibilityLabel={template ? "Done editing template" : "Create template"}
        >
          {template ? "Done" : "Create Template"}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
