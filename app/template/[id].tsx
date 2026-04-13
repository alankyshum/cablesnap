import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  Button,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addExerciseToTemplate,
  getTemplateById,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
} from "../../lib/db";
import type { TemplateExercise, WorkoutTemplate } from "../../lib/types";

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

  const load = useCallback(async () => {
    if (!id) return;
    const tpl = await getTemplateById(id);
    if (tpl) {
      setTemplate(tpl);
      setExercises(tpl.exercises ?? []);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      getTemplateById(id).then((tpl) => {
        if (tpl) {
          setTemplate(tpl);
          setExercises(tpl.exercises ?? []);
        }
      });
    }
  }, [id]);

  useEffect(() => {
    if (!addExerciseId || !id || handled.current === addExerciseId) return;
    handled.current = addExerciseId;
    addExerciseToTemplate(id, addExerciseId, exercises.length).then(() =>
      load()
    );
  }, [addExerciseId, id, exercises.length, load]);

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

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TemplateExercise>) => (
      <View
        style={[
          styles.row,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.info}>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
            {item.exercise?.name ?? "Unknown"}
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
                No exercises. Add some below.
              </Text>
            </View>
          }
          style={styles.list}
        />
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
});
