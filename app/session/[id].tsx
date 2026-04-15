import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  AccessibilityInfo,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
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
import { activateKeepAwakeAsync } from "expo-keep-awake";
import { play as playAudio, setEnabled as setAudioEnabled } from "../../lib/audio";
import {
  addSet,
  addSetsBatch,
  cancelSession,
  deleteSet,
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
  updateSetsBatch,
  updateSetRPE,
  updateSetNotes,
  updateSetTrainingMode,
  updateSetTempo,
  getExerciseById,
  getAppSetting,
} from "../../lib/db";
import {
  getSessionProgramDayId,
  getProgramDayById,
  advanceProgram,
} from "../../lib/programs";
import type { WorkoutSession, WorkoutSet, TrainingMode, Exercise } from "../../lib/types";
import { TRAINING_MODE_LABELS } from "../../lib/types";
import { rpeColor, rpeText } from "../../lib/rpe";
import { suggest, type Suggestion } from "../../lib/rm";
import TrainingModeSelector from "../../components/TrainingModeSelector";
import SwipeToDelete from "../../components/SwipeToDelete";
import { formatTime } from "../../lib/format";
import { useLayout } from "../../lib/layout";
import { confirmAction } from "../../lib/confirm";
import WeightPicker from "../../components/WeightPicker";

type SetWithMeta = WorkoutSet & {
  exercise_name?: string;
  exercise_deleted?: boolean;
  previous?: string;
};

type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithMeta[];
  link_id: string | null;
  training_modes: TrainingMode[];
  is_voltra: boolean;
};

const RPE_CHIPS = [6, 7, 8, 9, 10] as const;

const RPE_LABELS: Record<number, string> = {
  6: "Easy", 7: "Easy", 8: "Mod", 9: "Hard", 10: "Max",
};

type SetRowProps = {
  set: SetWithMeta;
  step: number;
  unit: "kg" | "lb";
  maxWeight: number | undefined;
  notesOpen: boolean;
  notesDraft: string | undefined;
  halfStep: { setId: string; base: number } | null;
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onRPE: (set: SetWithMeta, val: number) => void;
  onHalfStep: (setId: string, val: number) => void;
  onHalfStepClear: () => void;
  onHalfStepOpen: (setId: string, base: number) => void;
  onNotes: (setId: string, text: string) => void;
  onNotesDraftChange: (setId: string, text: string) => void;
  onToggleNotes: (setId: string) => void;
};

const SetRow = memo(function SetRow({
  set, step, unit, maxWeight, notesOpen, notesDraft, halfStep,
  onUpdate, onCheck, onDelete, onRPE, onHalfStep, onHalfStepClear,
  onHalfStepOpen, onNotes, onNotesDraftChange, onToggleNotes,
}: SetRowProps) {
  const theme = useTheme();

  const isPR = set.completed && set.weight != null && set.weight > 0 &&
    maxWeight !== undefined && set.weight > maxWeight;

  const onWeightChange = useCallback((v: number) => onUpdate(set.id, "weight", String(v)), [set.id, onUpdate]);
  const onRepsChange = useCallback((v: string) => onUpdate(set.id, "reps", v), [set.id, onUpdate]);

  return (
    <View>
      <SwipeToDelete onDelete={() => onDelete(set.id)}>
        <View
          style={[
            styles.setRow,
            set.completed && { backgroundColor: theme.colors.primaryContainer + "40" },
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Text variant="bodyMedium" style={[styles.colSet, { color: theme.colors.onSurface }]}>
            {set.round ? `R${set.round}` : set.set_number}
          </Text>
          <Text variant="bodySmall" style={[styles.colPrev, { color: theme.colors.onSurfaceVariant }]}>
            {set.previous}
          </Text>
          <View style={styles.weightCol}>
            <WeightPicker
              value={set.weight}
              step={step}
              unit={unit}
              onValueChange={onWeightChange}
              accessibilityLabel={`Set ${set.set_number} weight`}
            />
          </View>
          <TextInput
            mode="outlined"
            dense
            keyboardType="numeric"
            style={styles.colInput}
            value={set.reps != null ? String(set.reps) : ""}
            onChangeText={onRepsChange}
            placeholder="-"
            accessibilityLabel={`Set ${set.set_number} reps`}
          />
          <View style={styles.colCheck} accessible accessibilityLabel={`Mark set ${set.set_number} ${set.completed ? "incomplete" : "complete"}`} accessibilityRole="checkbox" accessibilityState={{ checked: set.completed }}>
            <Checkbox
              status={set.completed ? "checked" : "unchecked"}
              onPress={() => onCheck(set)}
            />
          </View>
          {isPR && (
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
          {set.completed && set.training_mode && set.training_mode !== "weight" && (
            <View style={[styles.modeBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
              <Text style={{ color: theme.colors.onSecondaryContainer, fontSize: 12, fontWeight: "700" }}>
                {TRAINING_MODE_LABELS[set.training_mode]?.short ?? set.training_mode}
              </Text>
            </View>
          )}
          <IconButton
            icon={set.notes ? "note-text" : "note-text-outline"}
            size={18}
            onPress={() => onToggleNotes(set.id)}
            accessibilityLabel="Set notes"
          />
        </View>
      </SwipeToDelete>

      {set.completed && (
        <View style={styles.rpeRow} accessibilityLabel="Rate of perceived exertion" accessibilityRole="radiogroup">
          {RPE_CHIPS.map((val) => {
            const selected = set.rpe === val;
            return (
              <Pressable
                key={val}
                onPress={() => onRPE(set, val)}
                onLongPress={() => onHalfStepOpen(set.id, val)}
                style={[
                  styles.rpeChip,
                  { borderColor: rpeColor(val) },
                  selected && { backgroundColor: rpeColor(val) },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`RPE ${val} ${RPE_LABELS[val]}`}
              >
                <Text style={[styles.rpeChipText, { color: selected ? rpeText(val) : rpeColor(val) }]}>
                  {val} {RPE_LABELS[val]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {halfStep && halfStep.setId === set.id && (
        <View style={[styles.halfStepRow, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginRight: 8, fontSize: 12 }}>
            Half-step:
          </Text>
          {halfStep.base > 6 && (
            <Pressable
              onPress={() => onHalfStep(set.id, halfStep.base - 0.5)}
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
              onPress={() => onHalfStep(set.id, halfStep.base + 0.5)}
              style={[styles.halfChip, { borderColor: rpeColor(halfStep.base + 0.5) }]}
              accessibilityLabel={`RPE ${halfStep.base + 0.5}`}
            >
              <Text style={[styles.rpeChipText, { color: rpeColor(halfStep.base + 0.5) }]}>
                {halfStep.base + 0.5}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onHalfStepClear}
            style={[styles.halfChip, { borderColor: theme.colors.outline }]}
            accessibilityLabel="Cancel half-step picker"
          >
            <Text style={[styles.rpeChipText, { color: theme.colors.onSurfaceVariant }]}>✕</Text>
          </Pressable>
        </View>
      )}

      {set.completed && set.rpe != null && !Number.isInteger(set.rpe) && (
        <View style={styles.rpeBadgeRow}>
          <View style={[styles.rpeBadge, { backgroundColor: rpeColor(set.rpe) }]}>
            <Text style={{ color: rpeText(set.rpe), fontSize: 12, fontWeight: "600" }}>
              RPE {set.rpe}
            </Text>
          </View>
        </View>
      )}

      {notesOpen && (
        <View style={styles.notesContainer}>
          <TextInput
            mode="outlined"
            dense
            placeholder="Add notes..."
            value={notesDraft ?? set.notes}
            onChangeText={(v) => onNotesDraftChange(set.id, v)}
            onBlur={() => onNotes(set.id, notesDraft ?? set.notes)}
            maxLength={200}
            multiline
            style={styles.notesInput}
            accessibilityLabel="Set notes"
          />
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "right", fontSize: 12 }}>
            {(notesDraft ?? set.notes).length}/200
          </Text>
        </View>
      )}
    </View>
  );
});

type GroupCardProps = {
  group: ExerciseGroup;
  step: number;
  unit: "kg" | "lb";
  maxes: Record<string, number>;
  suggestions: Record<string, Suggestion | null>;
  modes: Record<string, TrainingMode>;
  tempoDraft: Record<string, string>;
  notesOpenMap: Record<string, boolean>;
  notesDraftMap: Record<string, string>;
  halfStep: { setId: string; base: number } | null;
  linkIds: string[];
  groups: ExerciseGroup[];
  palette: string[];
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onAddSet: (exerciseId: string) => void;
  onModeChange: (exerciseId: string, mode: TrainingMode) => void;
  onTempoChange: (exerciseId: string, val: string) => void;
  onTempoBlur: (exerciseId: string, val: string) => void;
  onRPE: (set: SetWithMeta, val: number) => void;
  onHalfStep: (setId: string, val: number) => void;
  onHalfStepClear: () => void;
  onHalfStepOpen: (setId: string, base: number) => void;
  onNotes: (setId: string, text: string) => void;
  onNotesDraftChange: (setId: string, text: string) => void;
  onToggleNotes: (setId: string) => void;
};

const ExerciseGroupCard = memo(function ExerciseGroupCard({
  group, step, unit, maxes, suggestions, modes, tempoDraft,
  notesOpenMap, notesDraftMap, halfStep, linkIds, groups, palette,
  onUpdate, onCheck, onDelete, onAddSet, onModeChange,
  onTempoChange, onTempoBlur, onRPE, onHalfStep, onHalfStepClear,
  onHalfStepOpen, onNotes, onNotesDraftChange, onToggleNotes,
}: GroupCardProps) {
  const theme = useTheme();

  const linked = group.link_id ? groups.filter((g) => g.link_id === group.link_id) : [];
  const linkIdx = group.link_id ? linked.findIndex((g) => g.exercise_id === group.exercise_id) : -1;
  const isFirstInLink = linkIdx === 0;
  const totalRounds = group.link_id ? Math.max(...linked.map((g) => g.sets.length)) : 0;
  const completedRounds = group.link_id
    ? Math.min(...linked.map((g) => g.sets.filter((s) => s.completed).length))
    : 0;
  const groupColorIdx = group.link_id ? linkIds.indexOf(group.link_id) : -1;
  const groupColor = groupColorIdx >= 0 ? palette[groupColorIdx % palette.length] : undefined;

  const suggestion = suggestions[group.exercise_id];

  return (
    <View style={styles.group}>
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
        <View style={styles.groupHeader}>
          <Text variant="titleMedium" style={[styles.groupTitle, { color: theme.colors.primary }]}>
            {group.name}
          </Text>
          {group.is_voltra && group.training_modes.length > 1 && (
            <TrainingModeSelector
              modes={group.training_modes}
              selected={modes[group.exercise_id] ?? group.training_modes[0]}
              exercise={group.name}
              tempo={tempoDraft[group.exercise_id] ?? ""}
              onSelect={(m) => onModeChange(group.exercise_id, m)}
              onTempoChange={(v) => onTempoChange(group.exercise_id, v)}
              onTempoBlur={() => onTempoBlur(group.exercise_id, tempoDraft[group.exercise_id] ?? "")}
            />
          )}
        </View>

        <View style={styles.headerRow}>
          <Text variant="labelSmall" style={[styles.colSet, { color: theme.colors.onSurfaceVariant }]}>SET</Text>
          <Text variant="labelSmall" style={[styles.colPrev, { color: theme.colors.onSurfaceVariant }]}>PREV</Text>
          <Text variant="labelSmall" style={[styles.colLabel, { color: theme.colors.onSurfaceVariant }]}>{unit === "lb" ? "LB" : "KG"}</Text>
          <Text variant="labelSmall" style={[styles.colLabel, { color: theme.colors.onSurfaceVariant }]}>REPS</Text>
          <View style={styles.colCheck} />
        </View>

        {suggestion && (() => {
          const s = suggestion;
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
                if (s.type === "rep_increase") {
                  for (const set of group.sets) {
                    if (!set.completed && (set.reps == null || set.reps === 0)) {
                      onUpdate(set.id, "reps", String(s.reps));
                    }
                  }
                } else {
                  for (const set of group.sets) {
                    if (!set.completed && (set.weight == null || set.weight === 0)) {
                      onUpdate(set.id, "weight", String(s.weight));
                    }
                  }
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[
                styles.suggestionChip,
                { backgroundColor: isIncrease ? theme.colors.primaryContainer : theme.colors.surfaceVariant },
              ]}
              accessibilityRole="button"
              accessibilityLabel={hint}
              accessibilityHint={s.type === "rep_increase" ? "Double tap to fill suggested reps" : "Double tap to fill suggested weight"}
            >
              <Text
                variant="labelSmall"
                style={{
                  color: isIncrease ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
                  fontWeight: "600",
                }}
              >
                Suggested: {label}
              </Text>
            </Pressable>
          );
        })()}

        {group.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            step={step}
            unit={unit}
            maxWeight={maxes[set.exercise_id]}
            notesOpen={!!notesOpenMap[set.id]}
            notesDraft={notesDraftMap[set.id]}
            halfStep={halfStep}
            onUpdate={onUpdate}
            onCheck={onCheck}
            onDelete={onDelete}
            onRPE={onRPE}
            onHalfStep={onHalfStep}
            onHalfStepClear={onHalfStepClear}
            onHalfStepOpen={onHalfStepOpen}
            onNotes={onNotes}
            onNotesDraftChange={onNotesDraftChange}
            onToggleNotes={onToggleNotes}
          />
        ))}

        <Button
          mode="text"
          compact
          icon="plus"
          onPress={() => onAddSet(group.exercise_id)}
          style={styles.addSetBtn}
          accessibilityLabel={`Add set to ${group.name}`}
        >
          Add Set
        </Button>
      </View>
      <Divider style={styles.divider} />
    </View>
  );
});

export default function ActiveSession() {
  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {
      // Wake Lock unavailable on web without secure context — non-critical
    });
  }, []);
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();
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
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const restFlash = useSharedValue(0);
  const restFlashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      restFlash.value,
      [0, 1],
      [theme.colors.primaryContainer, theme.colors.primary],
    ),
  }));
  const restHapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Load timer sound setting
  useEffect(() => {
    getAppSetting("timer_sound_enabled").then((val) => {
      setAudioEnabled(val !== "false")
    }).catch(() => {
      setAudioEnabled(true)
      setSnackbar("Could not load sound setting")
    })
  }, []);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion | null>>({});
  const [modes, setModes] = useState<Record<string, TrainingMode>>({});
  const [tempoDraft, setTempoDraft] = useState<Record<string, string>>({});

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
    const derived = body.weight_unit === "lb" ? 5 : 2.5;
    setStep(derived);
    setUnit(body.weight_unit);

    const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];

    // Parallel fetch: previous sets, exercise metadata, and suggestions data
    const [prevResults, exerciseResults, recentResults] = await Promise.all([
      Promise.all(exerciseIds.map(async (eid) => ({ eid, data: await getPreviousSets(eid, id) }))),
      Promise.all(exerciseIds.map(async (eid) => ({ eid, data: await getExerciseById(eid) }))),
      Promise.all(exerciseIds.map(async (eid) => ({ eid, data: await getRecentExerciseSets(eid, 2) }))),
    ]);

    const prevCache: Record<string, { set_number: number; weight: number | null; reps: number | null }[]> = {};
    for (const { eid, data } of prevResults) prevCache[eid] = data;

    const exerciseMeta: Record<string, Exercise> = {};
    for (const { eid, data } of exerciseResults) {
      if (data) exerciseMeta[eid] = data;
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
        const ex = exerciseMeta[s.exercise_id];
        const parsed: TrainingMode[] = ex?.training_modes ?? [];
        map.set(s.exercise_id, {
          exercise_id: s.exercise_id,
          name: (s.exercise_name ?? "Unknown") + (s.exercise_deleted ? " (removed)" : ""),
          sets: [],
          link_id: s.link_id ?? null,
          training_modes: parsed,
          is_voltra: ex?.is_voltra ?? false,
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

    // Compute progressive overload suggestions using already-fetched data
    const entries: [string, Suggestion | null][] = exerciseIds.map((eid) => {
      try {
        const recent = recentResults.find((r) => r.eid === eid)?.data ?? [];
        if (recent.length === 0) return [eid, null];
        const timeBased = recent.every((r) => r.reps === 1 && (r.weight === 0 || r.weight === null));
        if (timeBased) return [eid, null];
        const ex = exerciseMeta[eid];
        const bw = ex ? ex.equipment === "bodyweight" : false;
        return [eid, suggest(recent, derived, bw)];
      } catch {
        return [eid, null];
      }
    });
    const sugg: Record<string, Suggestion | null> = Object.fromEntries(entries);
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
          const setsToInsert: Parameters<typeof addSetsBatch>[0] = [];
          for (const te of tpl.exercises) {
            for (let i = 1; i <= te.target_sets; i++) {
              setsToInsert.push({
                sessionId: id,
                exerciseId: te.exercise_id,
                setNumber: i,
                linkId: te.link_id ?? null,
                round: te.link_id ? i : null,
              });
            }
          }
          await addSetsBatch(setsToInsert);

          const created = await getSessionSets(id);
          const exerciseIds = [...new Set(created.map((s) => s.exercise_id))];
          const prevCache: Record<string, { set_number: number; weight: number | null; reps: number | null }[]> = {};
          const prevResults = await Promise.all(
            exerciseIds.map(async (eid) => ({ eid, data: await getPreviousSets(eid, id) }))
          );
          for (const { eid, data } of prevResults) prevCache[eid] = data;

          const setsToUpdate: { id: string; weight: number | null; reps: number | null }[] = [];
          for (const s of created) {
            const prev = prevCache[s.exercise_id]?.find((p) => p.set_number === s.set_number);
            if (prev && prev.weight != null) {
              setsToUpdate.push({ id: s.id, weight: prev.weight, reps: null });
            }
          }
          await updateSetsBatch(setsToUpdate);
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

  const updateGroupSet = useCallback((setId: string, patch: Partial<SetWithMeta>) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }))
    );
  }, []);

  const handleUpdate = useCallback(async (
    setId: string,
    field: "weight" | "reps",
    val: string
  ) => {
    let resolvedSet: SetWithMeta | undefined;
    setGroups((prev) => {
      for (const g of prev) {
        const s = g.sets.find((s) => s.id === setId);
        if (s) { resolvedSet = s; break; }
      }
      return prev;
    });
    if (!resolvedSet) return;

    const num = val === "" ? null : parseFloat(val);
    if (field === "weight") {
      updateGroupSet(setId, { weight: num });
      await updateSet(setId, num, resolvedSet.reps);
    } else {
      const rounded = num !== null ? Math.round(num) : null;
      updateGroupSet(setId, { reps: rounded });
      await updateSet(setId, resolvedSet.weight, rounded);
    }
  }, [updateGroupSet]);

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

      // Audio cue — rest complete
      playAudio("complete");

      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = 1;
      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = withTiming(0, { duration: 400 });
    }

    // Audio cue — 3-2-1 countdown tick
    if (rest > 0 && rest <= 3) {
      playAudio("tick");
    }

    prevRest.current = rest;
  }, [rest, restFlash]);

  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      for (const t of restHapticTimers.current) clearTimeout(t);
    };
  }, []);

  const handleCheck = useCallback(async (set: SetWithMeta) => {
    if (set.completed) {
      updateGroupSet(set.id, { completed: false, completed_at: null });
      await uncompleteSet(set.id);
    } else {
      const now = Date.now();
      updateGroupSet(set.id, { completed: true, completed_at: now });
      await completeSet(set.id);

      if (set.link_id) {
        const linked = groups.filter((g) => g.link_id === set.link_id);
        const idx = linked.findIndex((g) => g.exercise_id === set.exercise_id);
        const next = idx >= 0 && idx < linked.length - 1 ? linked[idx + 1] : null;

        if (next) {
          setNextHint(`Next: ${next.name}`);
          AccessibilityInfo.announceForAccessibility(`Next: ${next.name}`);
          if (hintTimer.current) clearTimeout(hintTimer.current);
          hintTimer.current = setTimeout(() => setNextHint(null), 1500);
        } else {
          setNextHint(null);
          const secs = await getRestSecondsForLink(id!, set.link_id);
          startRestWithDuration(secs);
        }
      } else {
        startRest(set.exercise_id);
      }
    }
  }, [updateGroupSet, groups, id, startRest, startRestWithDuration]);

  const handleAddSet = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    const num = (group?.sets.length ?? 0) + 1;
    const fallback = group?.is_voltra && group.training_modes.length > 1 ? group.training_modes[0] : null;
    const mode = modes[exerciseId] ?? fallback;
    const tp = mode === "eccentric_overload" ? (tempoDraft[exerciseId] || null) : null;
    const newSet = await addSet(id!, exerciseId, num, null, null, mode, tp);
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise_id === exerciseId
          ? { ...g, sets: [...g.sets, { ...newSet, previous: "-" }] }
          : g
      )
    );
  }, [id, groups, modes, tempoDraft]);

  const handleModeChange = useCallback(async (exerciseId: string, mode: TrainingMode) => {
    setModes((prev) => ({ ...prev, [exerciseId]: mode }));
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise_id === exerciseId
          ? { ...g, sets: g.sets.map((s) => (s.completed ? s : { ...s, training_mode: mode })) }
          : g
      )
    );
    for (const set of group.sets) {
      if (!set.completed) {
        await updateSetTrainingMode(set.id, mode);
      }
    }
  }, [groups]);

  const handleTempoBlur = useCallback(async (exerciseId: string, val: string) => {
    const clean = val && !/^[\s-]*$/.test(val) ? val : null;
    setTempoDraft((prev) => ({ ...prev, [exerciseId]: clean ?? "" }));
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group) return;
    for (const set of group.sets) {
      if (!set.completed) {
        await updateSetTempo(set.id, clean);
      }
    }
  }, [groups]);

  const handleAddExercise = () => {
    router.push(`/template/pick-exercise?sessionId=${id}`);
  };

  const handleRPE = useCallback(async (set: SetWithMeta, val: number) => {
    const next = set.rpe === val ? null : val;
    updateGroupSet(set.id, { rpe: next });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSetRPE(set.id, next);
  }, [updateGroupSet]);

  const handleHalfStep = useCallback(async (setId: string, val: number) => {
    updateGroupSet(setId, { rpe: val });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHalfStep(null);
    await updateSetRPE(setId, val);
  }, [updateGroupSet]);

  const handleDelete = useCallback(async (setId: string) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.filter((s) => s.id !== setId)
          .map((s, i) => ({ ...s, set_number: i + 1 })),
      })).filter((g) => g.sets.length > 0)
    );
    await deleteSet(setId);
  }, []);

  const handleHalfStepClear = useCallback(() => setHalfStep(null), []);

  const handleHalfStepOpen = useCallback((setId: string, base: number) => {
    setHalfStep({ setId, base });
  }, []);

  const handleNotes = useCallback(async (setId: string, text: string) => {
    updateGroupSet(setId, { notes: text });
    setNotesDraft((prev) => { const next = { ...prev }; delete next[setId]; return next; });
    await updateSetNotes(setId, text);
  }, [updateGroupSet]);

  const handleTempoChange = useCallback((exerciseId: string, val: string) => {
    setTempoDraft((prev) => ({ ...prev, [exerciseId]: val }));
  }, []);

  const handleNotesDraftChange = useCallback((setId: string, text: string) => {
    setNotesDraft((prev) => ({ ...prev, [setId]: text }));
  }, []);

  const toggleNotes = useCallback((setId: string) => {
    setNotesOpen((prev) => ({ ...prev, [setId]: !prev[setId] }));
  }, []);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, maxes]);

  const finish = () => {
    confirmAction(
      "Complete Workout?",
      `Duration: ${formatTime(elapsed)}`,
      async () => {
        await completeSession(id!);

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

        const allSets = await getSessionSets(id!);
        const done = allSets.filter((s) => s.completed);
        if (done.length === 0) {
          router.replace("/(tabs)");
        } else {
          router.replace(`/session/summary/${id}`);
        }
      },
      false
    );
  };

  const cancel = () => {
    confirmAction(
      "Discard Workout?",
      "All logged sets will be lost.",
      async () => {
        await cancelSession(id!);
        router.back();
      },
      true
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
      <FlatList
        data={[]}
        renderItem={null}
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
        {rest > 0 && (
          <Reanimated.View
            style={[styles.restBanner, restFlashStyle]}
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
          </Reanimated.View>
        )}

        {/* Next exercise hint for supersets */}
        {nextHint && (
          <View style={[styles.nextBanner, { backgroundColor: theme.colors.secondaryContainer }]} accessibilityLiveRegion="polite">
            <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer, fontWeight: "700" }}>
              {nextHint}
            </Text>
          </View>
        )}

        {groups.map((group) => (
          <ExerciseGroupCard
            key={group.exercise_id}
            group={group}
            step={step}
            unit={unit}
            maxes={maxes}
            suggestions={suggestions}
            modes={modes}
            tempoDraft={tempoDraft}
            notesOpenMap={notesOpen}
            notesDraftMap={notesDraft}
            halfStep={halfStep}
            linkIds={linkIds}
            groups={groups}
            palette={palette}
            onUpdate={handleUpdate}
            onCheck={handleCheck}
            onDelete={handleDelete}
            onAddSet={handleAddSet}
            onModeChange={handleModeChange}
            onTempoChange={handleTempoChange}
            onTempoBlur={handleTempoBlur}
            onRPE={handleRPE}
            onHalfStep={handleHalfStep}
            onHalfStepClear={handleHalfStepClear}
            onHalfStepOpen={handleHalfStepOpen}
            onNotes={handleNotes}
            onNotesDraftChange={handleNotesDraftChange}
            onToggleNotes={toggleNotes}
          />
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
          </>
        }
      />
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
    paddingVertical: 16,
    paddingBottom: 48,
  },
  group: {
    marginBottom: 8,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  groupTitle: {
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
  colLabel: {
    flex: 1,
    marginHorizontal: 4,
    textAlign: "center",
    fontSize: 11,
  },
  colCheck: {
    width: 40,
    alignItems: "center",
  },
  prChipText: {
    fontSize: 12,
  },
  modeBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
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
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 44,
    alignItems: "center",
  },
  rpeChipText: {
    fontSize: 11,
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
