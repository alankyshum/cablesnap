import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import {
  addSet,
  cancelSession,
  completeSession,
  completeSet,
  getBodySettings,
  getMaxWeightByExercise,
  getRecentExerciseSets,
  getSessionById,
  getSessionSets,
  getTemplateById,
  getPreviousSets,
  getRestSecondsForExercise,
  getRestSecondsForLink,
  uncompleteSet,
  updateSet,
  updateSetRPE,
  updateSetNotes,
  getExerciseById,
} from "../../lib/db";
import {
  getSessionProgramDayId,
  getProgramDayById,
  advanceProgram,
} from "../../lib/programs";
import type { WorkoutSession, WorkoutSet } from "../../lib/types";
import { rpeColor, rpeText } from "../../lib/rpe";
import { suggest, type Suggestion } from "../../lib/rm";

type SetWithMeta = WorkoutSet & {
  exercise_name?: string;
  previous?: string;
};

type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithMeta[];
  link_id: string | null;
};

const RPE_CHIPS = [6, 7, 8, 9, 10] as const;

const RPE_LABELS: Record<number, string> = {
  6: "Easy", 7: "Easy", 8: "Mod", 9: "Hard", 10: "Max",
};

export default function ActiveSession() {
  useKeepAwake();
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
  const [snackbar, setSnackbar] = useState("");
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [halfStep, setHalfStep] = useState<{ setId: string; base: number } | null>(null);
  const [nextHint, setNextHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [step, setStep] = useState(2.5);
  const restFlash = useRef(new Animated.Value(0)).current;
  const restHapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion | null>>({});

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.link_id && !ids.includes(g.link_id)) ids.push(g.link_id);
    }
    return ids;
  }, [groups]);

  const palette = useMemo(
    () => [theme.colors.tertiary, theme.colors.secondary, theme.colors.primary, theme.colors.error, theme.colors.inversePrimary],
    [theme],
  );

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

    // Fetch weight step from body settings
    const body = await getBodySettings();
    setStep(body.weight_unit === "lb" ? 5 : 2.5);

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
          link_id: s.link_id ?? null,
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

    // Compute progressive overload suggestions
    const weightStep = body.weight_unit === "lb" ? 5 : 2.5;
    const sugg: Record<string, Suggestion | null> = {};
    for (const eid of exerciseIds) {
      try {
        const recent = await getRecentExerciseSets(eid, 2);
        if (recent.length === 0) { sugg[eid] = null; continue; }
        // Check if exercise is time-based (all reps=1, weight=0) — suppress
        const timeBased = recent.every((r) => r.reps === 1 && (r.weight === 0 || r.weight === null));
        if (timeBased) { sugg[eid] = null; continue; }
        const ex = await getExerciseById(eid);
        const bw = ex ? ex.equipment === "bodyweight" : false;
        sugg[eid] = suggest(recent, weightStep, bw);
      } catch {
        sugg[eid] = null;
      }
    }
    setSuggestions(sugg);
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
            if (te.link_id) {
              for (let i = 1; i <= te.target_sets; i++) {
                await addSet(id, te.exercise_id, i, te.link_id, i);
              }
            } else {
              for (let i = 1; i <= te.target_sets; i++) {
                await addSet(id, te.exercise_id, i);
              }
            }
          }

          // Auto-fill weight from previous session
          const created = await getSessionSets(id);
          const exerciseIds = [...new Set(created.map((s) => s.exercise_id))];
          const prevCache: Record<string, { set_number: number; weight: number | null; reps: number | null }[]> = {};
          for (const eid of exerciseIds) {
            prevCache[eid] = await getPreviousSets(eid, id);
          }
          for (const s of created) {
            const prev = prevCache[s.exercise_id]?.find((p) => p.set_number === s.set_number);
            if (prev && prev.weight != null) {
              await updateSet(s.id, prev.weight, null);
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

  const startRestWithDuration = useCallback((secs: number) => {
    if (restRef.current) clearInterval(restRef.current);
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
  }, []);

  const dismissRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    setRest(0);
  };

  const prevRest = useRef(0);
  useEffect(() => {
    if (prevRest.current > 0 && rest === 0) {
      // Triple-burst haptic pattern
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const t1 = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 300);
      const t2 = setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }, 600);
      restHapticTimers.current = [t1, t2];

      // Flash animation on rest timer card
      restFlash.setValue(1);
      Animated.timing(restFlash, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
    prevRest.current = rest;
  }, [rest]);

  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      for (const t of restHapticTimers.current) clearTimeout(t);
    };
  }, []);

  const handleStep = (set: SetWithMeta, dir: 1 | -1) => {
    const current = set.weight != null ? set.weight : 0;
    const val = Math.max(0, current + dir * step);
    handleUpdate(set.id, "weight", String(val));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCheck = async (set: SetWithMeta) => {
    if (set.completed) {
      await uncompleteSet(set.id);
    } else {
      await completeSet(set.id);

      if (set.link_id) {
        // Find linked group exercises
        const linked = groups.filter((g) => g.link_id === set.link_id);
        const idx = linked.findIndex((g) => g.exercise_id === set.exercise_id);
        const next = idx >= 0 && idx < linked.length - 1 ? linked[idx + 1] : null;

        if (next) {
          // Mid-round: show "Next" hint, no rest timer
          setNextHint(`Next: ${next.name}`);
          AccessibilityInfo.announceForAccessibility(`Next: ${next.name}`);
          if (hintTimer.current) clearTimeout(hintTimer.current);
          hintTimer.current = setTimeout(() => setNextHint(null), 1500);
        } else {
          // End of round: start rest timer with MAX(rest_seconds)
          setNextHint(null);
          const secs = await getRestSecondsForLink(id!, set.link_id);
          startRestWithDuration(secs);
        }
      } else {
        startRest(set.exercise_id);
      }
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

  const handleRPE = async (set: SetWithMeta, val: number) => {
    const next = set.rpe === val ? null : val;
    await updateSetRPE(set.id, next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
  };

  const handleHalfStep = async (setId: string, val: number) => {
    await updateSetRPE(setId, val);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHalfStep(null);
    await load();
  };

  const handleNotes = async (setId: string, text: string) => {
    await updateSetNotes(setId, text);
    setNotesDraft((prev) => { const next = { ...prev }; delete next[setId]; return next; });
    await load();
  };

  const toggleNotes = (setId: string) => {
    setNotesOpen((prev) => ({ ...prev, [setId]: !prev[setId] }));
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

            // Auto-advance program if this session was started from a program
            try {
              const dayId = await getSessionProgramDayId(id!);
              if (dayId) {
                const day = await getProgramDayById(dayId);
                if (day) {
                  const result = await advanceProgram(day.program_id, dayId, id!);
                  if (result.wrapped) {
                    setSnackbar(`Cycle ${result.cycle} complete!`);
                    AccessibilityInfo.announceForAccessibility(
                      `Cycle ${result.cycle} complete! Program wrapping to day 1.`
                    );
                    await new Promise((r) => setTimeout(r, 1500));
                  } else {
                    AccessibilityInfo.announceForAccessibility(
                      "Workout complete. Program advanced to next day."
                    );
                  }
                }
              }
            } catch {
              // Program advance failed — session is already saved, navigate normally
            }

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
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconButton
                icon="calculator-variant"
                size={22}
                onPress={() => router.push("/tools/plates")}
                accessibilityLabel="Open plate calculator"
                accessibilityRole="button"
                iconColor={theme.colors.onSurface}
                style={{ marginRight: 0 }}
              />
              <Text
                variant="labelLarge"
                style={{ color: theme.colors.primary, marginRight: 8 }}
              >
                {formatTime(elapsed)}
              </Text>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
      >
        {rest > 0 && (
          <Animated.View
            style={[
              styles.restBanner,
              {
                backgroundColor: restFlash.interpolate({
                  inputRange: [0, 1],
                  outputRange: [theme.colors.primaryContainer, theme.colors.primary],
                }),
              },
            ]}
            accessibilityLiveRegion="polite"
          >
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
          </Animated.View>
        )}

        {/* Next exercise hint for supersets */}
        {nextHint && (
          <View style={[styles.nextBanner, { backgroundColor: theme.colors.secondaryContainer }]} accessibilityLiveRegion="polite">
            <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer, fontWeight: "700" }}>
              {nextHint}
            </Text>
          </View>
        )}

        {groups.map((group) => {
          const linked = group.link_id ? groups.filter((g) => g.link_id === group.link_id) : [];
          const linkIdx = group.link_id ? linked.findIndex((g) => g.exercise_id === group.exercise_id) : -1;
          const isFirstInLink = linkIdx === 0;
          const totalRounds = group.link_id ? Math.max(...linked.map((g) => g.sets.length)) : 0;
          const completedRounds = group.link_id
            ? Math.min(...linked.map((g) => g.sets.filter((s) => s.completed).length))
            : 0;
          const groupColorIdx = group.link_id ? linkIds.indexOf(group.link_id) : -1;
          const groupColor = groupColorIdx >= 0 ? palette[groupColorIdx % palette.length] : undefined;

          return (
          <View key={group.exercise_id} style={styles.group}>
            {/* Linked group header */}
            {isFirstInLink && group.link_id && (
              <View
                style={[styles.linkGroupHeader, { borderLeftColor: groupColor, borderLeftWidth: 4 }]}
                accessibilityRole="header"
                accessibilityLabel={`Round ${completedRounds + 1} of ${totalRounds}`}
              >
                <Text variant="labelMedium" style={{ color: groupColor, fontWeight: "700" }}>
                  {linked.length >= 3 ? "Circuit" : "Superset"} — Round {completedRounds + 1}/{totalRounds}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                  Rest after round
                </Text>
              </View>
            )}

            <View style={group.link_id ? { borderLeftWidth: 4, borderLeftColor: groupColor, paddingLeft: 8 } : undefined}>
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

            {/* Suggestion chip */}
            {suggestions[group.exercise_id] && (() => {
              const s = suggestions[group.exercise_id]!;
              const isIncrease = s.type === "increase" || s.type === "rep_increase";
              const label = s.type === "rep_increase"
                ? `${s.reps} reps ▲`
                : s.type === "increase"
                  ? `${s.weight} ▲`
                  : `${s.weight} =`;
              const hint = s.type === "rep_increase"
                ? `Suggested reps: ${s.reps}, ${s.reason}`
                : s.type === "increase"
                  ? `Suggested weight: ${s.weight}, increase by ${step}`
                  : `Suggested weight: ${s.weight}, maintain`;
              return (
                <Pressable
                  onPress={() => {
                    if (s.type === "rep_increase") return;
                    for (const set of group.sets) {
                      if (!set.completed && (set.weight == null || set.weight === 0)) {
                        handleUpdate(set.id, "weight", String(s.weight));
                      }
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={[
                    styles.suggestionChip,
                    {
                      backgroundColor: isIncrease
                        ? theme.colors.primaryContainer
                        : theme.colors.surfaceVariant,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={hint}
                  accessibilityHint="Double tap to fill suggested weight"
                >
                  <Text
                    variant="labelSmall"
                    style={{
                      color: isIncrease
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onSurfaceVariant,
                      fontWeight: "600",
                    }}
                  >
                    Suggested: {label}
                  </Text>
                </Pressable>
              );
            })()}

            {group.sets.map((set) => (
              <View key={set.id}>
                <View
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
                    {set.round ? `R${set.round}` : set.set_number}
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
                  <View style={styles.weightCol}>
                    <IconButton
                      icon="minus"
                      size={24}
                      onPress={() => handleStep(set, -1)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityLabel={`Decrease weight by ${step}`}
                      accessibilityRole="button"
                      style={styles.stepBtn}
                    />
                    <TextInput
                      mode="outlined"
                      dense
                      keyboardType="numeric"
                      style={styles.weightInput}
                      value={set.weight != null ? String(set.weight) : ""}
                      onChangeText={(v) => handleUpdate(set.id, "weight", v)}
                      placeholder="-"
                      accessibilityLabel={`Set ${set.set_number} weight`}
                    />
                    <IconButton
                      icon="plus"
                      size={24}
                      onPress={() => handleStep(set, 1)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityLabel={`Increase weight by ${step}`}
                      accessibilityRole="button"
                      style={styles.stepBtn}
                    />
                  </View>
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
                  <IconButton
                    icon={set.notes ? "note-text" : "note-text-outline"}
                    size={18}
                    onPress={() => toggleNotes(set.id)}
                    accessibilityLabel="Set notes"
                  />
                </View>

                {/* RPE chips — visible only for completed sets */}
                {set.completed && (
                  <View
                    style={styles.rpeRow}
                    accessibilityLabel="Rate of perceived exertion"
                    accessibilityRole="radiogroup"
                  >
                    {RPE_CHIPS.map((val) => {
                      const selected = set.rpe === val;
                      return (
                        <Pressable
                          key={val}
                          onPress={() => handleRPE(set, val)}
                          onLongPress={() => setHalfStep({ setId: set.id, base: val })}
                          style={[
                            styles.rpeChip,
                            { borderColor: rpeColor(val) },
                            selected && { backgroundColor: rpeColor(val) },
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`RPE ${val} ${RPE_LABELS[val]}`}
                        >
                          <Text style={[
                            styles.rpeChipText,
                            { color: selected ? rpeText(val) : rpeColor(val) },
                          ]}>
                            {val} {RPE_LABELS[val]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Half-step picker overlay */}
                {halfStep && halfStep.setId === set.id && (
                  <View style={[styles.halfStepRow, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginRight: 8, fontSize: 12 }}>
                      Half-step:
                    </Text>
                    {halfStep.base > 6 && (
                      <Pressable
                        onPress={() => handleHalfStep(set.id, halfStep.base - 0.5)}
                        style={[styles.halfChip, { borderColor: rpeColor(halfStep.base - 0.5) }]}
                        accessibilityLabel={`RPE ${halfStep.base - 0.5}`}
                      >
                        <Text style={[styles.rpeChipText, { color: rpeColor(halfStep.base - 0.5) }]}>
                          {halfStep.base - 0.5}
                        </Text>
                      </Pressable>
                    )}
                    {halfStep.base < 10 && (
                      <Pressable
                        onPress={() => handleHalfStep(set.id, halfStep.base + 0.5)}
                        style={[styles.halfChip, { borderColor: rpeColor(halfStep.base + 0.5) }]}
                        accessibilityLabel={`RPE ${halfStep.base + 0.5}`}
                      >
                        <Text style={[styles.rpeChipText, { color: rpeColor(halfStep.base + 0.5) }]}>
                          {halfStep.base + 0.5}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => setHalfStep(null)}
                      style={[styles.halfChip, { borderColor: theme.colors.outline }]}
                      accessibilityLabel="Cancel half-step picker"
                    >
                      <Text style={[styles.rpeChipText, { color: theme.colors.onSurfaceVariant }]}>✕</Text>
                    </Pressable>
                  </View>
                )}

                {/* RPE badge for half-step values */}
                {set.completed && set.rpe != null && !Number.isInteger(set.rpe) && (
                  <View style={styles.rpeBadgeRow}>
                    <View style={[styles.rpeBadge, { backgroundColor: rpeColor(set.rpe) }]}>
                      <Text style={{ color: rpeText(set.rpe), fontSize: 12, fontWeight: "600" }}>
                        RPE {set.rpe}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Notes input */}
                {notesOpen[set.id] && (
                  <View style={styles.notesContainer}>
                    <TextInput
                      mode="outlined"
                      dense
                      placeholder="Add notes..."
                      value={notesDraft[set.id] ?? set.notes}
                      onChangeText={(v) => setNotesDraft((prev) => ({ ...prev, [set.id]: v }))}
                      onBlur={() => handleNotes(set.id, notesDraft[set.id] ?? set.notes)}
                      maxLength={200}
                      multiline
                      style={styles.notesInput}
                      accessibilityLabel="Set notes"
                    />
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "right", fontSize: 12 }}>
                      {(notesDraft[set.id] ?? set.notes).length}/200
                    </Text>
                  </View>
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
            </View>
            <Divider style={styles.divider} />
          </View>
          );
        })}

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
      </KeyboardAvoidingView>
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        accessibilityLiveRegion="polite"
      >
        {snackbar}
      </Snackbar>
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
  nextBanner: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  linkGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
    borderRadius: 4,
  },
  rpeRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 6,
    flexWrap: "wrap",
  },
  rpeChip: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 14,
    minWidth: 56,
    alignItems: "center",
  },
  rpeChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  halfStepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 4,
    marginBottom: 4,
    gap: 8,
  },
  halfChip: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  rpeBadgeRow: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  rpeBadge: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  notesContainer: {
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  notesInput: {
    fontSize: 13,
  },
  weightCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 2,
  },
  weightInput: {
    flex: 1,
    height: 36,
    fontSize: 14,
  },
  stepBtn: {
    margin: 0,
    padding: 0,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginLeft: 4,
    marginBottom: 6,
    minHeight: 48,
    justifyContent: "center",
  },
});
