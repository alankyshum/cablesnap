/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Alert, BackHandler, Platform } from "react-native";
import {
  deleteCompletedSession,
  editCompletedSession,
  type SessionEditPayload,
  type SessionEditSetPatch,
} from "@/lib/db";
import { useToast } from "@/components/ui/bna-toast";
import type { ExerciseGroup } from "@/hooks/useSessionDetail";
import type { Exercise } from "@/lib/types";

/**
 * Per-set draft entry. We track BOTH the original snapshot and the patch so
 * the dirty check can be shallow-equality on patches and Save can build a
 * minimal PATCH-style payload that preserves untouched columns.
 */
type DraftSet = {
  /** workout_sets.id for existing sets; undefined for newly-added sets. */
  id?: string;
  /** Stable client key (always set, even for new sets). */
  key: string;
  exercise_id: string;
  /** Existing set columns we mirror so the editable rows can render. */
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: 0 | 1;
  set_type: string;
  link_id: string | null;
  round: number | null;
  bodyweight_modifier_kg: number | null;
  /** Inline non-judgmental warning surfaced under the row. */
  warning?: string;
};

type DraftGroup = {
  /** Stable per-group client key (always set, even if `exercise_id` repeats). */
  groupKey: string;
  exercise_id: string;
  name: string;
  link_id: string | null;
  sets: DraftSet[];
  /** True if this exercise was added in this edit session (vs. pre-existing). */
  isNew: boolean;
};

let nextKey = 0;
const newKey = () => `draft-${++nextKey}`;
const newGroupKey = () => `dg-${++nextKey}`;

function snapshotFromGroups(groups: ExerciseGroup[]): DraftGroup[] {
  return groups.map((g) => ({
    groupKey: newGroupKey(),
    exercise_id: g.exercise_id,
    name: g.name,
    link_id: g.link_id,
    isNew: false,
    sets: g.sets.map((s) => ({
      id: s.id,
      key: s.id,
      exercise_id: s.exercise_id,
      set_number: s.set_number,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
      completed: (s.completed ? 1 : 0) as 0 | 1,
      set_type: s.set_type ?? "normal",
      link_id: s.link_id,
      round: s.round,
      bodyweight_modifier_kg: s.bodyweight_modifier_kg ?? null,
    })),
  }));
}

function totalSets(groups: DraftGroup[]): number {
  return groups.reduce((acc, g) => acc + g.sets.length, 0);
}

export type UseSessionEditOptions = {
  sessionId: string | undefined;
  /** Used purely to format the "Delete workout from MMM D" copy. */
  sessionStartedAt?: number | null;
  groups: ExerciseGroup[];
  /** Refresh the read-only screen after a successful save / delete. */
  refresh: () => Promise<void>;
  /** Called when the user deletes the entire session — caller routes away. */
  onSessionDeleted?: () => void;
  /** Called once a successful save settles, for any post-save side effects. */
  onSaved?: () => void;
};

export function useSessionEdit({
  sessionId,
  sessionStartedAt,
  groups,
  refresh,
  onSessionDeleted,
  onSaved,
}: UseSessionEditOptions) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftGroup[]>([]);
  const [deletes, setDeletes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [original, setOriginal] = useState<DraftGroup[]>([]);

  const enterEdit = useCallback(() => {
    const snap = snapshotFromGroups(groups);
    setOriginal(snap);
    setDraft(snap);
    setDeletes([]);
    setEditing(true);
  }, [groups]);

  const dirty = useMemo(() => {
    if (!editing) return false;
    if (deletes.length > 0) return true;
    if (JSON.stringify(stripWarnings(draft)) !== JSON.stringify(stripWarnings(original))) return true;
    return false;
  }, [draft, deletes, editing, original]);

  // ── Per-set edit helpers ────────────────────────────────────────────────
  const updateSet = useCallback(
    (groupIdx: number, setIdx: number, patch: Partial<DraftSet>) => {
      setDraft((prev) => {
        const next = prev.slice();
        const group = { ...next[groupIdx] };
        const sets = group.sets.slice();
        const before = sets[setIdx];
        const after: DraftSet = { ...before, ...patch };
        // AC #12: auto-flip completed=1+reps=0 → completed=0 with inline warn.
        if (after.completed === 1 && (after.reps == null || after.reps < 1)) {
          after.completed = 0;
          after.warning = "Reps set to 0 — marked as not completed";
        } else if (after.warning && (after.reps ?? 0) >= 1) {
          delete after.warning;
        }
        sets[setIdx] = after;
        group.sets = sets;
        next[groupIdx] = group;
        return next;
      });
    },
    [],
  );

  const addSet = useCallback((groupIdx: number) => {
    setDraft((prev) => {
      const next = prev.slice();
      const group = { ...next[groupIdx] };
      const sets = group.sets.slice();
      const last = sets[sets.length - 1];
      const newSet: DraftSet = {
        key: newKey(),
        exercise_id: group.exercise_id,
        set_number: sets.length + 1,
        // Prefill weight/reps from prior set, matching the live-workout UX.
        weight: last?.weight ?? null,
        reps: last?.reps ?? null,
        rpe: null,
        completed: 0,
        set_type: "normal",
        link_id: group.link_id,
        round: null,
        bodyweight_modifier_kg: last?.bodyweight_modifier_kg ?? null,
      };
      group.sets = [...sets, newSet];
      next[groupIdx] = group;
      return next;
    });
  }, []);

  const removeSet = useCallback((groupIdx: number, setIdx: number) => {
    setDraft((prev) => {
      const next = prev.slice();
      const group = { ...next[groupIdx] };
      const set = group.sets[setIdx];
      if (set.id) {
        setDeletes((d) => (d.includes(set.id!) ? d : [...d, set.id!]));
      }
      group.sets = group.sets.filter((_, i) => i !== setIdx);
      next[groupIdx] = group;
      return next;
    });
  }, []);

  const removeExercise = useCallback((groupIdx: number) => {
    setDraft((prev) => {
      const next = prev.slice();
      const group = next[groupIdx];
      // Queue server-side deletes for any previously-persisted sets.
      const ids = group.sets.map((s) => s.id).filter((x): x is string => !!x);
      if (ids.length > 0) setDeletes((d) => [...d, ...ids]);
      next.splice(groupIdx, 1);
      return next;
    });
  }, []);

  const addExercise = useCallback((exercise: Exercise) => {
    setDraft((prev) => [
      ...prev,
      {
        groupKey: newGroupKey(),
        exercise_id: exercise.id,
        name: exercise.name,
        link_id: null,
        isNew: true,
        sets: [
          {
            key: newKey(),
            exercise_id: exercise.id,
            set_number: 1,
            weight: null,
            reps: null,
            rpe: null,
            completed: 0,
            set_type: "normal",
            link_id: null,
            round: null,
            bodyweight_modifier_kg: null,
          },
        ],
      },
    ]);
    setPickerVisible(false);
  }, []);

  // ── Build payload + save ────────────────────────────────────────────────
  const buildPayload = useCallback((): SessionEditPayload => {
    const upserts: SessionEditSetPatch[] = [];
    const originalById = new Map<string, DraftSet>();
    for (const g of original) for (const s of g.sets) if (s.id) originalById.set(s.id, s);

    let position = 0;
    for (const group of draft) {
      let setNum = 0;
      for (const s of group.sets) {
        setNum += 1;
        if (s.id) {
          const orig = originalById.get(s.id)!;
          const patch: SessionEditSetPatch = {
            id: s.id,
            exercise_id: s.exercise_id,
          };
          if (s.set_number !== setNum) patch.set_number = setNum;
          if (s.weight !== orig.weight) patch.weight = s.weight;
          if (s.reps !== orig.reps) patch.reps = s.reps;
          if (s.rpe !== orig.rpe) patch.rpe = s.rpe;
          if (s.completed !== orig.completed) patch.completed = s.completed;
          if (s.set_type !== orig.set_type) patch.set_type = s.set_type;
          // Only push if anything besides the (id, exercise_id) marker changed.
          const keys = Object.keys(patch);
          if (keys.length > 2) upserts.push(patch);
        } else {
          upserts.push({
            exercise_id: s.exercise_id,
            set_number: setNum,
            weight: s.weight,
            reps: s.reps,
            rpe: s.rpe,
            completed: s.completed,
            set_type: s.set_type,
            link_id: s.link_id,
            round: s.round,
            bodyweight_modifier_kg: s.bodyweight_modifier_kg,
            exercise_position: position,
          });
        }
      }
      position += 1;
    }
    return { upserts, deletes };
  }, [draft, deletes, original]);

  const save = useCallback(async () => {
    if (!sessionId || saving) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      await editCompletedSession(sessionId, payload);
      await refresh();
      setEditing(false);
      setDraft([]);
      setDeletes([]);
      toast({ description: "Workout updated" });
      // AC #16: a11y announcement in addition to visual toast.
      if (Platform.OS !== "web") {
        AccessibilityInfo.announceForAccessibility("Workout updated");
      }
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save changes";
      toast({ description: `Couldn't save changes — ${msg}` });
    } finally {
      setSaving(false);
    }
  }, [sessionId, saving, buildPayload, refresh, toast, onSaved]);

  const cancel = useCallback(() => {
    if (!dirty) {
      setEditing(false);
      setDraft([]);
      setDeletes([]);
      return;
    }
    Alert.alert(
      "Discard changes?",
      "Your edits will be lost.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            setEditing(false);
            setDraft([]);
            setDeletes([]);
          },
        },
      ],
    );
  }, [dirty]);

  // Confirm-and-delete the entire session when all sets have been removed.
  const deleteWholeSession = useCallback(() => {
    if (!sessionId) return;
    const sets = totalSets(original);
    const exCount = original.length;
    const date = sessionStartedAt
      ? new Date(sessionStartedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "this date";
    Alert.alert(
      "Delete workout?",
      `Delete this workout from ${date} (${exCount} exercises, ${sets} sets)? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCompletedSession(sessionId);
              setEditing(false);
              setDraft([]);
              setDeletes([]);
              onSessionDeleted?.();
            } catch {
              toast({ description: "Failed to delete workout" });
            }
          },
        },
      ],
    );
  }, [sessionId, sessionStartedAt, onSessionDeleted, toast]);

  // ── Android hardware-back interception (AC #18) ─────────────────────────
  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      cancel();
      return true;
    });
    return () => sub.remove();
  }, [editing, cancel]);

  const isEmpty = editing && totalSets(draft) === 0;

  return {
    editing,
    enterEdit,
    cancel,
    save,
    saving,
    dirty,
    draft,
    pickerVisible,
    setPickerVisible,
    addSet,
    addExercise,
    updateSet,
    removeSet,
    removeExercise,
    isEmpty,
    deleteWholeSession,
  };
}

/** Strip the `warning` field for dirty-comparison so transient inline notices don't count as dirt. */
function stripWarnings(g: DraftGroup[]): DraftGroup[] {
  return g.map((grp) => ({
    ...grp,
    sets: grp.sets.map((s) => {
      const { warning: _w, ...rest } = s;
      void _w;
      return rest as DraftSet;
    }),
  }));
}
