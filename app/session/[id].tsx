import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Checkbox,
  Chip,
  Divider,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  addSet,
  cancelSession,
  completeSession,
  completeSet,
  getMaxWeightByExercise,
  getSessionById,
  getSessionSets,
  getTemplateById,
  getPreviousSets,
  getRestSecondsForExercise,
  uncompleteSet,
  updateSet,
} from "../../lib/db";
import type { WorkoutSession, WorkoutSet } from "../../lib/types";

type SetWithMeta = WorkoutSet & {
  exercise_name?: string;
  previous?: string;
};

type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithMeta[];
};

export default function ActiveSession() {
  const theme = useTheme();
  const router = useRouter();
  const { id, templateId } = useLocalSearchParams<{
    id: string;
    templateId?: string;
  }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialized = useRef(false);
  const [rest, setRest] = useState(0);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [maxes, setMaxes] = useState<Record<string, number>>({});
  const prevExerciseIds = useRef<string>("");
  const prHapticFired = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    const sess = await getSessionById(id);
    if (!sess) return;
    setSession(sess);

    if (sess.completed_at) {
      router.replace(`/session/detail/${id}`);
      return;
    }

    const sets = await getSessionSets(id);

    // Build previous data
    const prevCache: Record<string, { set_number: number; weight: number | null; reps: number | null }[]> = {};
    const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
    for (const eid of exerciseIds) {
      prevCache[eid] = await getPreviousSets(eid, id);
    }

    // Fetch historical maxes for PR detection (only when exercise list changes)
    const key = exerciseIds.sort().join(",");
    if (key !== prevExerciseIds.current) {
      prevExerciseIds.current = key;
      const m = await getMaxWeightByExercise(exerciseIds, id);
      setMaxes(m);
    }

    // Group by exercise
    const map = new Map<string, ExerciseGroup>();
    for (const s of sets) {
      if (!map.has(s.exercise_id)) {
        map.set(s.exercise_id, {
          exercise_id: s.exercise_id,
          name: s.exercise_name ?? "Unknown",
          sets: [],
        });
      }
      const prev = prevCache[s.exercise_id]?.find(
        (p) => p.set_number === s.set_number
      );
      map.get(s.exercise_id)!.sets.push({
        ...s,
        previous:
          prev && prev.weight != null && prev.reps != null
            ? `${prev.weight}×${prev.reps}`
            : "-",
      });
    }
    setGroups([...map.values()]);
  }, [id, router]);

  // Initialize session from template
  useEffect(() => {
    if (initialized.current || !id) return;
    initialized.current = true;

    (async () => {
      const sets = await getSessionSets(id);
      if (sets.length > 0) {
        await load();
        return;
      }

      if (templateId) {
        const tpl = await getTemplateById(templateId);
        if (tpl?.exercises) {
          for (const te of tpl.exercises) {
            for (let i = 1; i <= te.target_sets; i++) {
              await addSet(id, te.exercise_id, i);
            }
          }
        }
      }
      await load();
    })();
  }, [id, templateId, load]);

  // Timer
  useEffect(() => {
    if (!session) return;
    const update = () => {
      setElapsed(Math.floor((Date.now() - session.started_at) / 1000));
    };
    update();
    timer.current = setInterval(update, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [session]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    if (h > 0) return `${h}:${mm}:${ss}`;
    return `${mm}:${ss}`;
  };

  const handleUpdate = async (
    setId: string,
    field: "weight" | "reps",
    val: string
  ) => {
    const group = groups.find((g) => g.sets.some((s) => s.id === setId));
    const set = group?.sets.find((s) => s.id === setId);
    if (!set) return;

    const num = val === "" ? null : parseFloat(val);
    if (field === "weight") {
      await updateSet(setId, num, set.reps);
    } else {
      await updateSet(setId, set.weight, num !== null ? Math.round(num) : null);
    }
    await load();
  };

  const startRest = useCallback(async (exerciseId: string) => {
    if (restRef.current) clearInterval(restRef.current);
    const secs = await getRestSecondsForExercise(id!, exerciseId);
    setRest(secs);
    restRef.current = setInterval(() => {
      setRest((prev) => {
        if (prev <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          restRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [id]);

  const dismissRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    setRest(0);
  };

  const prevRest = useRef(0);
  useEffect(() => {
    if (prevRest.current > 0 && rest === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevRest.current = rest;
  }, [rest]);

  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
    };
  }, []);

  const handleCheck = async (set: SetWithMeta) => {
    if (set.completed) {
      await uncompleteSet(set.id);
    } else {
      await completeSet(set.id);
      startRest(set.exercise_id);
    }
    await load();
  };

  const handleAddSet = async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    const num = (group?.sets.length ?? 0) + 1;
    await addSet(id!, exerciseId, num);
    await load();
  };

  const handleAddExercise = () => {
    router.push(`/template/pick-exercise?sessionId=${id}`);
  };

  const isPR = (set: SetWithMeta) => {
    if (!set.completed || !set.weight || set.weight <= 0) return false;
    const max = maxes[set.exercise_id];
    if (max === undefined) return false;
    return set.weight > max;
  };

  // Haptic feedback on new PR detection
  useEffect(() => {
    for (const g of groups) {
      for (const s of g.sets) {
        if (isPR(s) && !prHapticFired.current.has(s.id)) {
          prHapticFired.current.add(s.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        if (!isPR(s) && prHapticFired.current.has(s.id)) {
          prHapticFired.current.delete(s.id);
        }
      }
    }
  }, [groups, maxes]);

  const finish = () => {
    Alert.alert(
      "Complete Workout?",
      `Duration: ${formatTime(elapsed)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            await completeSession(id!);
            router.replace(`/session/detail/${id}`);
          },
        },
      ]
    );
  };

  const cancel = () => {
    Alert.alert(
      "Discard Workout?",
      "All logged sets will be lost.",
      [
        { text: "Keep Going", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            await cancelSession(id!);
            router.back();
          },
        },
      ]
    );
  };

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Workout" }} />
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
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: () => (
            <Text
              variant="labelLarge"
              style={{ color: theme.colors.primary, marginRight: 8 }}
            >
              {formatTime(elapsed)}
            </Text>
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        {rest > 0 && (
          <View style={[styles.restBanner, { backgroundColor: theme.colors.primaryContainer }]} accessibilityLiveRegion="polite">
            <Text variant="headlineLarge" style={{ color: theme.colors.onPrimaryContainer, fontWeight: "700" }} accessibilityLabel={`Rest timer: ${Math.floor(rest / 60)} minutes ${rest % 60} seconds`}>
              {String(Math.floor(rest / 60)).padStart(2, "0")}:{String(rest % 60).padStart(2, "0")}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, marginTop: 4 }}>
              Rest Timer
            </Text>
            <Button
              mode="text"
              compact
              onPress={dismissRest}
              textColor={theme.colors.onPrimaryContainer}
              style={{ marginTop: 4 }}
              accessibilityLabel="Skip rest timer"
            >
              Skip
            </Button>
          </View>
        )}

        {groups.map((group) => (
          <View key={group.exercise_id} style={styles.group}>
            <Text
              variant="titleMedium"
              style={[styles.groupTitle, { color: theme.colors.primary }]}
            >
              {group.name}
            </Text>

            {/* Header row */}
            <View style={styles.headerRow}>
              <Text
                variant="labelSmall"
                style={[styles.colSet, { color: theme.colors.onSurfaceVariant }]}
              >
                SET
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.colPrev, { color: theme.colors.onSurfaceVariant }]}
              >
                PREV
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.colInput, { color: theme.colors.onSurfaceVariant }]}
              >
                WEIGHT
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.colInput, { color: theme.colors.onSurfaceVariant }]}
              >
                REPS
              </Text>
              <View style={styles.colCheck} />
            </View>

            {group.sets.map((set) => (
              <View
                key={set.id}
                style={[
                  styles.setRow,
                  set.completed && {
                    backgroundColor: theme.colors.primaryContainer + "40",
                  },
                ]}
              >
                <Text
                  variant="bodyMedium"
                  style={[styles.colSet, { color: theme.colors.onSurface }]}
                >
                  {set.set_number}
                </Text>
                <Text
                  variant="bodySmall"
                  style={[
                    styles.colPrev,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {set.previous}
                </Text>
                <TextInput
                  mode="outlined"
                  dense
                  keyboardType="numeric"
                  style={styles.colInput}
                  value={set.weight != null ? String(set.weight) : ""}
                  onChangeText={(v) => handleUpdate(set.id, "weight", v)}
                  placeholder="-"
                  accessibilityLabel={`Set ${set.set_number} weight`}
                />
                <TextInput
                  mode="outlined"
                  dense
                  keyboardType="numeric"
                  style={styles.colInput}
                  value={set.reps != null ? String(set.reps) : ""}
                  onChangeText={(v) => handleUpdate(set.id, "reps", v)}
                  placeholder="-"
                  accessibilityLabel={`Set ${set.set_number} reps`}
                />
                <View style={styles.colCheck} accessible accessibilityLabel={`Mark set ${set.set_number} ${set.completed ? "incomplete" : "complete"}`} accessibilityRole="checkbox" accessibilityState={{ checked: set.completed }}>
                  <Checkbox
                    status={set.completed ? "checked" : "unchecked"}
                    onPress={() => handleCheck(set)}
                  />
                </View>
                {isPR(set) && (
                  <Chip
                    compact
                    icon="trophy"
                    style={{ backgroundColor: theme.colors.tertiaryContainer }}
                    textStyle={styles.prChipText}
                    accessibilityLabel="New personal record"
                    accessibilityRole="text"
                  >
                    PR
                  </Chip>
                )}
              </View>
            ))}

            <Button
              mode="text"
              compact
              icon="plus"
              onPress={() => handleAddSet(group.exercise_id)}
              style={styles.addSetBtn}
              accessibilityLabel={`Add set to ${group.name}`}
            >
              Add Set
            </Button>
            <Divider style={styles.divider} />
          </View>
        ))}

        <Button
          mode="outlined"
          icon="plus"
          onPress={handleAddExercise}
          style={styles.addExercise}
          accessibilityLabel="Add exercise to workout"
        >
          Add Exercise
        </Button>

        <Button
          mode="contained"
          onPress={finish}
          style={styles.finishBtn}
          contentStyle={styles.finishContent}
          accessibilityLabel="Finish workout"
        >
          Finish Workout
        </Button>

        <Button
          mode="text"
          onPress={cancel}
          textColor={theme.colors.error}
          style={styles.cancelBtn}
          accessibilityLabel="Cancel workout"
        >
          Cancel Workout
        </Button>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  group: {
    marginBottom: 8,
  },
  groupTitle: {
    marginBottom: 8,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginBottom: 2,
  },
  colSet: {
    width: 36,
    textAlign: "center",
  },
  colPrev: {
    width: 64,
    textAlign: "center",
  },
  colInput: {
    flex: 1,
    marginHorizontal: 4,
    height: 36,
    fontSize: 14,
  },
  colCheck: {
    width: 40,
    alignItems: "center",
  },
  prChipText: {
    fontSize: 12,
  },
  addSetBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  divider: {
    marginTop: 8,
    marginBottom: 12,
  },
  addExercise: {
    marginTop: 8,
  },
  finishBtn: {
    marginTop: 24,
  },
  finishContent: {
    paddingVertical: 8,
  },
  cancelBtn: {
    marginTop: 8,
  },
  restBanner: {
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
});
