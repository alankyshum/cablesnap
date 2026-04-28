/* eslint-disable max-lines-per-function, react-hooks/exhaustive-deps, complexity */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Keyboard, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  addSet,
  cancelSession,
  deleteSet,
  completeSession,
  completeSet,
  getRestSecondsForLink,
  getRestContext,
  getAppSetting,
  uncompleteSet,
  updateSet,
  updateSetNotes,
  getSessionSets,
  updateSetDuration,
  checkSetPR,
  checkSetBodyweightModifierPR,
  updateExercisePositions,
  getGoalForExercise,
  achieveGoal,
  getCurrentBestWeight,
} from "../lib/db";
import {
  getLastBodyweightModifier,
  updateSetBodyweightModifier,
  getPreviousSetsBatch,
  getRecentVariantHistory,
  updateSetVariant,
  getRecentBodyweightGripHistory,
  updateSetBodyweightVariant,
} from "../lib/db/session-sets";
import { getLastVariant, isCableExercise } from "../lib/cable-variant";
import {
  getLastBodyweightGripVariant,
  isBodyweightGripExercise,
} from "../lib/bodyweight-grip-variant";
import {
  resolvePrefillCandidate,
  type PrefillCandidate,
} from "./resolvePrefillCandidate";
import { resolveRestSeconds, type RestBreakdown } from "../lib/rest";
import { bumpQueryVersion, queryClient } from "../lib/query";
import {
  getSessionProgramDayId,
  getProgramDayById,
  advanceProgram,
} from "../lib/programs";
import { formatTime, computePrefillSets } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import type { SetWithMeta, ExerciseGroup } from "../components/session/types";
import { sessionBreadcrumb } from "../lib/session-breadcrumbs";

/** Check if completing a set achieves a strength goal. Non-throwing. */
async function checkGoalAchievement(exerciseId: string): Promise<boolean> {
  try {
    const goal = await getGoalForExercise(exerciseId);
    if (goal?.target_weight != null) {
      const best = await getCurrentBestWeight(exerciseId);
      if (best != null && best >= goal.target_weight) {
        await achieveGoal(goal.id);
        return true;
      }
    }
  } catch {
    // Goal check must never block PR celebration
  }
  return false;
}

import type { SetContext } from "./useRestTimer";

type Params = {
  id: string | undefined;
  groups: ExerciseGroup[];
  setGroups: React.Dispatch<React.SetStateAction<ExerciseGroup[]>>;
  updateGroupSet: (setId: string, updates: Partial<SetWithMeta>) => void;
  startRest: (ctx: string | SetContext) => void;
  startRestWithDuration: (secs: number) => void;
  startRestWithBreakdown: (breakdown: RestBreakdown) => void;
  session: { started_at: number; clock_started_at?: number | null; name: string } | null;
  showToast: (msg: string) => void;
  showError: (msg: string) => void;
  triggerPR?: (exerciseName: string, goalAchieved?: boolean) => void;
  unit?: "kg" | "lb";
};

export function useSessionActions({
  id,
  groups,
  setGroups,
  updateGroupSet,
  startRest,
  startRestWithDuration,
  startRestWithBreakdown,
  session,
  showToast,
  showError,
  triggerPR,
  unit,
}: Params) {
  const router = useRouter();

  // --- local state ---
  const [elapsed, setElapsed] = useState(0);
  // BLD-630: optimistic local mirror of `workout_sessions.clock_started_at`.
  // The DB write inside completeSet is authoritative for persistence/export,
  // but `useSessionDetail` fetches the session once on `[id]` and never
  // re-runs, so without a local override the on-screen elapsed timer would
  // never start ticking. We sync from the prop on session-id change.
  const [clockStartedAt, setClockStartedAt] = useState<number | null>(
    session?.clock_started_at ?? null,
  );
  useEffect(() => {
    // Mirror DB anchor into local state when the session prop changes (e.g.
    // navigating to another session, or a hydration roundtrip after restart).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop sync
    setClockStartedAt(session?.clock_started_at ?? null);
  }, [session?.clock_started_at]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [exerciseNotesOpen, setExerciseNotesOpen] = useState<Record<string, boolean>>({});
  const [exerciseNotesDraft, setExerciseNotesDraft] = useState<Record<string, string>>({});
  const [nextHint, setNextHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BLD-541: per-session rate-limiter for weighted-BW PR celebrations.
  // Populated with exercise_id on first PR hit; further sets in the same
  // session for the same exercise don't re-trigger the celebration.
  const bwPRExerciseSet = useRef<Set<string>>(new Set());

  // Session-elapsed clock.
  // BLD-630: the clock is now anchored to the first completed set, not the
  // moment the user tapped Start. While `clockStartedAt` is null, elapsed
  // stays at 0 and the 1Hz interval is not scheduled.
  // BLD-553 battery fix: pause setInterval when app is backgrounded. On some
  // RN runtimes setInterval continues to schedule wake-ups with the screen
  // off, and if it doesn't, React still triggers a render-burst as Date.now()
  // jumps on resume. We recompute elapsed from `clockStartedAt` on resume,
  // so there's no drift.
  useEffect(() => {
    if (!session) return;
    if (clockStartedAt == null) {
      // Not yet anchored — show 0:00 and don't run the interval. The "Starts
      // when you log your first set" caption is rendered in the header.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing elapsed when clock unanchors
      setElapsed(0);
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      return;
    }
    const update = () => {
      setElapsed(Math.floor((Date.now() - clockStartedAt) / 1000));
    };
    const start = () => {
      if (timer.current) return;
      // BLD-560 polish: don't spin up the 1Hz interval if the app is mounted
      // while already backgrounded (e.g. restart from notification). The
      // AppState listener below will start it on the subsequent "active"
      // transition. Without this guard we'd immediately tick once and then
      // rely on the listener to stop — an extra render for zero benefit.
      if (AppState.currentState !== "active") return;
      update();
      timer.current = setInterval(update, 1000);
    };
    const stop = () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
    start();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        sessionBreadcrumb("session.appstate.active");
        start();
      } else if (next === "background") {
        sessionBreadcrumb("session.appstate.background");
        stop();
      } else if (next === "inactive") {
        sessionBreadcrumb("session.appstate.inactive");
        stop();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [session, clockStartedAt]);

  // Cleanup hint timer
  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  // --- handlers ---

  const handleUpdate = useCallback(async (
    setId: string,
    field: "weight" | "reps" | "duration_seconds",
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
    } else if (field === "duration_seconds") {
      const rounded = num !== null ? Math.round(num) : null;
      updateGroupSet(setId, { duration_seconds: rounded });
      await updateSetDuration(setId, rounded);
    } else {
      const rounded = num !== null ? Math.round(num) : null;
      updateGroupSet(setId, { reps: rounded });
      await updateSet(setId, resolvedSet.weight, rounded);
    }
  }, [updateGroupSet]);

  /** Handle superset next-hint or rest timer for linked exercises. */
  const handleLinkedRest = useCallback(async (set: SetWithMeta) => {
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
      // Adaptive superset rest: resolve using the last-completed set's context
      // on the final exercise of the superset (per plan §5).
      const adaptiveSetting = await getAppSetting("rest_adaptive_enabled");
      if (adaptiveSetting !== "false" && id) {
        try {
          const ctx = await getRestContext(id, set.exercise_id, {
            set_type: set.set_type,
            rpe: set.rpe,
          });
          const breakdown = resolveRestSeconds(ctx);
          startRestWithBreakdown(breakdown);
          return;
        } catch {
          // Fall through to legacy path on any error.
        }
      }
      const secs = await getRestSecondsForLink(id!, set.link_id!);
      startRestWithDuration(secs);
    }
  }, [groups, id, startRestWithDuration, startRestWithBreakdown]);

  const handleCheck = useCallback(async (set: SetWithMeta) => {
    const group = groups.find((g) => g.exercise_id === set.exercise_id);

    if (set.completed) {
      updateGroupSet(set.id, { completed: false, completed_at: null });
      await uncompleteSet(set.id);
      // BLD-541 R2: uncompleting a set changes which set is "latest
      // completed" for this exercise, so the smart-default cache for
      // bodyweight exercises must refresh too.
      if (group?.is_bodyweight) {
        queryClient.invalidateQueries({
          queryKey: ['bw-modifier-default', set.exercise_id],
        });
      }
      return;
    }

    // BLD-682 AC18: if this is a pristine row carrying a non-null
    // prefillCandidate (display-only hydration value), persist the
    // candidate via updateSet BEFORE the completion write so the DB
    // reflects exactly what the sighted user sees in the picker.
    // Single-write-path / write-on-intent: tapping the set-number is
    // the user's deliberate intent.
    const candidate = set.prefillCandidate ?? null;
    const isPristine =
      set.weight == null &&
      set.reps == null &&
      set.duration_seconds == null &&
      !set.completed &&
      (set.notes == null || set.notes === "") &&
      (set.bodyweight_modifier_kg == null);
    let persistedWeight: number | null = set.weight ?? null;
    if (isPristine && candidate &&
      (candidate.weight != null || candidate.reps != null || candidate.duration_seconds != null)
    ) {
      const isDuration = group?.trackingMode === "duration";
      try {
        await updateSet(
          set.id,
          candidate.weight,
          candidate.reps,
          isDuration ? candidate.duration_seconds : undefined,
        );
        persistedWeight = candidate.weight;
        // Mirror persistence into local state so subsequent renders /
        // PR-detection use the just-written values.
        updateGroupSet(set.id, {
          weight: candidate.weight,
          reps: candidate.reps,
          ...(isDuration ? { duration_seconds: candidate.duration_seconds } : {}),
        });
      } catch (err) {
        // Same write-fault contract as AC6 — completion still proceeds,
        // single console.warn breadcrumb. The completion write below
        // will record a "completed-with-null-values" row rather than
        // block the user's primary intent.
        // eslint-disable-next-line no-console
        console.warn("[BLD-682] pristine-completion candidate persistence failed", err);
      }
    }

    const now = Date.now();
    updateGroupSet(set.id, { completed: true, completed_at: now });
    // BLD-630: anchor the session clock optimistically before the DB write
    // so the elapsed timer starts ticking within the next render. The DB
    // update inside `completeSet` is authoritative for persistence/export.
    setClockStartedAt((prev) => (prev == null ? now : prev));
    await completeSet(set.id);

    // BLD-541 R2: invalidate the smart-default cache so the next add-set
    // for this bodyweight exercise reflects the just-completed modifier
    // (including null for a BW-only set) as its starting point.
    // Gated on the EXERCISE being bodyweight — NOT on modifier
    // nullability: completing a null-modifier BW-only set still changes
    // the "latest completed" reading and must invalidate stale non-null
    // defaults that may have been cached within staleTime.
    if (group?.is_bodyweight) {
      queryClient.invalidateQueries({
        queryKey: ['bw-modifier-default', set.exercise_id],
      });
    }

    // Live PR detection (non-blocking — errors never prevent set completion)
    // BLD-682: use persisted weight, which may have been hoisted from
    // prefillCandidate above, so PR detection sees the value the user
    // actually logged on this completion.
    if (set.set_type !== 'warmup' && persistedWeight && persistedWeight > 0 && id && triggerPR) {
      try {
        const isPR = await checkSetPR(set.exercise_id, persistedWeight, id);
        if (isPR) {
          const group = groups.find((g) => g.exercise_id === set.exercise_id);
          const goalAchieved = await checkGoalAchievement(set.exercise_id);
          triggerPR(group?.name ?? "exercise", goalAchieved);
          updateGroupSet(set.id, { is_pr: true });
        }
      } catch {
        // PR detection must never block set completion
      }
    }

    // BLD-541: weighted-bodyweight PR detection on set completion. Gated on a
    // non-null modifier (pure-bodyweight sets don't celebrate). Rate-limited
    // once-per-exercise-per-session via bwPRExerciseSet to avoid repeat
    // celebrations on equal-or-better later sets within the same session.
    if (
      set.set_type !== 'warmup' &&
      set.bodyweight_modifier_kg != null &&
      id &&
      triggerPR &&
      !bwPRExerciseSet.current.has(set.exercise_id)
    ) {
      try {
        const isBwPR = await checkSetBodyweightModifierPR(
          set.exercise_id,
          set.bodyweight_modifier_kg,
          id
        );
        if (isBwPR) {
          bwPRExerciseSet.current.add(set.exercise_id);
          const group = groups.find((g) => g.exercise_id === set.exercise_id);
          triggerPR(group?.name ?? "exercise", false);
          updateGroupSet(set.id, { is_pr: true });
        }
      } catch {
        // PR detection must never block set completion
      }
    }

    // Warmup sets: default behavior preserved (no timer). Opt-in via setting.
    if (set.set_type === 'warmup') {
      const warmupRest = await getAppSetting("rest_after_warmup_enabled");
      if (warmupRest !== "true") return;
    }

    if (set.link_id) {
      await handleLinkedRest(set);
    } else {
      startRest({
        exerciseId: set.exercise_id,
        sessionId: id!,
        setType: set.set_type,
        rpe: set.rpe,
      });
    }
  }, [updateGroupSet, groups, id, startRest, startRestWithDuration, triggerPR, handleLinkedRest]);

  const handleAddSet = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    const num = (group?.sets.length ?? 0) + 1;
    const newSet = await addSet(id!, exerciseId, num, null, null, null, undefined, undefined, group?.exercise_position ?? 0);

    // BLD-541: smart-default the bodyweight modifier from the last session's
    // most-recent completed set. Only runs for bodyweight groups. Persisted
    // via the same updateSetBodyweightModifier entry point as the sheet, so
    // the equipment-invariant and normalize() apply uniformly.
    let defaultModifier: number | null = null;
    if (group?.is_bodyweight) {
      try {
        // BLD-541: route smart-default through React Query so the
        // ['bw-modifier-default', exerciseId] key has a real consumer.
        // Sibling add-sets within staleTime reuse cache; explicit invalidation
        // from the sheet + set-complete paths refreshes when semantics change.
        defaultModifier = await queryClient.fetchQuery({
          queryKey: ['bw-modifier-default', exerciseId],
          queryFn: () => getLastBodyweightModifier(exerciseId),
        });
        if (defaultModifier != null) {
          await updateSetBodyweightModifier(newSet.id, defaultModifier);
          // Invalidate so the next add-set re-reads through the smart-default
          // query if a newer set (with possibly different modifier) has since
          // been persisted.
          queryClient.invalidateQueries({
            queryKey: ['bw-modifier-default', exerciseId],
          });
        }
      } catch {
        defaultModifier = null;
      }
    }

    // BLD-771: autofill cable variant (attachment + mount_position) from the
    // user's last logged set on this exercise. Gated on `isCableExercise()`
    // — never runs for non-cable equipment, which prevents writing variant
    // data to barbell / dumbbell / machine sets that have no UI to surface
    // it (would be invisible-but-persistent state, AC line 195).
    //
    // Mirrors the bodyweight smart-default pattern above:
    //   1. fetchQuery against React Query so siblings within staleTime share.
    //   2. Per-attribute resolution via getLastVariant() — so if user has
    //      last attachment='rope' but no recent mount_position, only
    //      attachment is autofilled (AC line 199 independent attributes).
    //   3. Persisted via updateSetVariant() — same entry point the picker
    //      uses, so the silent-default-trap closure (QD-B2) is uniform.
    //
    // Returns NULL/NULL when the user has no prior history. NEVER falls back
    // to exercises.attachment / exercises.mount_position default — that's
    // the QD-B2 trap, which is closed by getLastVariant() reading only
    // workout_sets, never the exercise definition.
    //
    // Reviewer blocker #1 (PR #426): the autofilled values MUST also be
    // captured into the in-memory `setWithModifier` row below — otherwise
    // the new SetRow renders with NULL/NULL chips until a refresh, and the
    // user can accidentally overwrite the unseen autofill.
    let autofilledAttachment: typeof newSet.attachment = null;
    let autofilledMountPosition: typeof newSet.mount_position = null;
    if (group && isCableExercise({ equipment: group.equipment })) {
      try {
        const history = await queryClient.fetchQuery({
          queryKey: ['variant-history', exerciseId],
          queryFn: () => getRecentVariantHistory(exerciseId),
        });
        const last = getLastVariant(history);
        if (last.attachment !== null || last.mount_position !== null) {
          await updateSetVariant(newSet.id, last.attachment, last.mount_position);
          autofilledAttachment = last.attachment;
          autofilledMountPosition = last.mount_position;
          queryClient.invalidateQueries({
            queryKey: ['variant-history', exerciseId],
          });
        }
      } catch {
        // Autofill is best-effort; on any error the set is created with
        // NULL/NULL and the user can pick via the chip → picker flow.
      }
    }

    // BLD-822: autofill bodyweight grip variant (grip_type + grip_width) from
    // the user's last logged set on this exercise. Sibling of the cable
    // variant autofill above; gated on `isBodyweightGripExercise()` (dual:
    // equipment === "bodyweight" AND name regex). Mutual exclusion vs the
    // cable block above is enforced by the predicates being disjoint —
    // `isCableExercise` requires equipment.includes("cable") while
    // `isBodyweightGripExercise` requires equipment === "bodyweight". A given
    // set can only enter one of the two blocks.
    //
    // Per-attribute resolution via `getLastBodyweightGripVariant()` — if the
    // user's last set has grip_type='overhand' but no grip_width, only
    // grip_type autofills. NULL/NULL when no prior history (closes the QD-B2
    // silent-default trap; there is no exercise-level default to fall back
    // onto for grip — the column doesn't exist on `exercises`).
    //
    // Reviewer blocker #1 (BLD-771 PR #426) carried forward: capture into
    // `setWithModifier` so the new SetRow renders with the correct chips
    // immediately, without a refresh.
    let autofilledGripType: typeof newSet.grip_type = null;
    let autofilledGripWidth: typeof newSet.grip_width = null;
    if (group && isBodyweightGripExercise({ equipment: group.equipment, name: group.name })) {
      try {
        const history = await queryClient.fetchQuery({
          queryKey: ['bodyweight-grip-history', exerciseId],
          queryFn: () => getRecentBodyweightGripHistory(exerciseId),
        });
        const last = getLastBodyweightGripVariant(history);
        if (last.grip_type !== null || last.grip_width !== null) {
          await updateSetBodyweightVariant(newSet.id, last.grip_type, last.grip_width);
          autofilledGripType = last.grip_type;
          autofilledGripWidth = last.grip_width;
          queryClient.invalidateQueries({
            queryKey: ['bodyweight-grip-history', exerciseId],
          });
        }
      } catch {
        // Autofill is best-effort; on any error the set is created with
        // NULL/NULL and the user can pick via the chip → picker flow.
      }
    }

    // BLD-655 + BLD-682: prefill weight/reps (or weight/duration_seconds)
    // using the resolvePrefillCandidate helper.
    //   1. In-session prior working set (BLD-655 path).
    //   2. Otherwise, the matching set from the previous workout (BLD-682).
    // Routes through the existing updateSet write path (single-write-path).
    // Silent no-op when no usable source. AC16: previous-workout
    // getPreviousSetsBatch MUST NOT be called when in-session lastWorking
    // already exists — short-circuit BEFORE the DB query.
    let prefillWeight: number | null = null;
    let prefillReps: number | null = null;
    let prefillDuration: number | null = null;
    let prefillApplied = false;
    if (group) {
      const hasInSessionWorking = group.sets.some((s) => s.set_type !== "warmup");

      let previousSetForSlot: PrefillCandidate & { set_type: string | null } | null = null;
      if (!hasInSessionWorking && id) {
        try {
          const batch = await getPreviousSetsBatch([exerciseId], id);
          // AC13 + reviewer/techlead/QD BLOCKER (2026-04-27 16:03Z):
          // match by set_number AND require completed=true. Prior
          // session rows include un-completed sets (lib/db/session-sets.ts:469
          // returns ALL rows so progression detection can use them);
          // every prefill consumer must filter `&& p.completed`. Warmup
          // filtering happens in the helper.
          const match = batch[exerciseId]?.find((p) => p.set_number === num && p.completed);
          if (match) {
            previousSetForSlot = {
              weight: match.weight,
              reps: match.reps,
              duration_seconds: match.duration_seconds,
              set_type: match.set_type,
            };
          }
        } catch {
          previousSetForSlot = null;
        }
      }

      const candidate = resolvePrefillCandidate(
        { trackingMode: group.trackingMode, sets: group.sets },
        previousSetForSlot,
      );

      if (candidate) {
        const isDuration = group.trackingMode === "duration";
        try {
          await updateSet(
            newSet.id,
            candidate.weight,
            candidate.reps,
            isDuration ? candidate.duration_seconds : undefined,
          );
          prefillWeight = candidate.weight;
          prefillReps = candidate.reps;
          prefillDuration = candidate.duration_seconds;
          prefillApplied = true;
        } catch (err) {
          // AC6: do not throw, do not show unsaved values; row insert
          // already succeeded. Single console.warn breadcrumb. Tag both
          // BLD-655 and BLD-682 so log readers find either ticket.
          // eslint-disable-next-line no-console
          console.warn("[BLD-682] add-set previous-workout prefill persistence failed", err);
        }
      }
    }

    const setWithModifier: SetWithMeta = {
      ...newSet,
      ...(prefillApplied
        ? { weight: prefillWeight, reps: prefillReps, duration_seconds: prefillDuration }
        : {}),
      bodyweight_modifier_kg: defaultModifier,
      // Reviewer blocker #1 (PR #426): propagate variant autofill into the
      // in-memory row so chips render with the autofilled values immediately
      // instead of after a refresh. Falls through to `newSet`'s NULL when
      // autofill resolved to NULL or the gate (isCableExercise) was false.
      attachment: autofilledAttachment ?? newSet?.attachment ?? null,
      mount_position: autofilledMountPosition ?? newSet?.mount_position ?? null,
      // BLD-822: same propagation pattern for bodyweight grip autofill so
      // chips render the autofilled grip immediately without a refresh.
      grip_type: autofilledGripType ?? newSet?.grip_type ?? null,
      grip_width: autofilledGripWidth ?? newSet?.grip_width ?? null,
      previous: "-",
    };
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise_id === exerciseId
          ? { ...g, sets: [...g.sets, setWithModifier] }
          : g
      )
    );
  }, [id, groups]);

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

  const handleExerciseNotes = useCallback(async (exerciseId: string, text: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group || group.sets.length === 0) return;
    const firstSetId = group.sets[0].id;
    updateGroupSet(firstSetId, { notes: text });
    setExerciseNotesDraft((prev) => { const n = { ...prev }; delete n[exerciseId]; return n; });
    await updateSetNotes(firstSetId, text);
  }, [updateGroupSet, groups]);

  const handleExerciseNotesDraftChange = useCallback((exerciseId: string, text: string) => {
    setExerciseNotesDraft((prev) => ({ ...prev, [exerciseId]: text }));
  }, []);

  const toggleExerciseNotes = useCallback((exerciseId: string) => {
    setExerciseNotesOpen((prev) => ({ ...prev, [exerciseId]: !prev[exerciseId] }));
  }, []);

  const handleMoveExercise = useCallback(async (exerciseId: string, direction: "up" | "down") => {
    if (!id) return;
    Keyboard.dismiss();
    // Find non-superset groups for reorder (supersets excluded)
    const reorderableGroups = groups.filter((g) => !g.link_id);
    const idx = reorderableGroups.findIndex((g) => g.exercise_id === exerciseId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= reorderableGroups.length) return;

    const a = reorderableGroups[idx];
    const b = reorderableGroups[swapIdx];

    // Swap positions in state
    const newPosA = b.exercise_position;
    const newPosB = a.exercise_position;

    setGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.exercise_id === a.exercise_id) return { ...g, exercise_position: newPosA };
        if (g.exercise_id === b.exercise_id) return { ...g, exercise_position: newPosB };
        return g;
      });
      return updated.sort((x, y) => x.exercise_position - y.exercise_position);
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    AccessibilityInfo.announceForAccessibility(
      `${a.name} moved to position ${direction === "up" ? idx : idx + 2}`
    );

    // Persist position swap
    await updateExercisePositions(id, [
      { exerciseId: a.exercise_id, position: newPosA },
      { exerciseId: b.exercise_id, position: newPosB },
    ]);
  }, [id, groups]);

  const handleMoveUp = useCallback((exerciseId: string) => {
    handleMoveExercise(exerciseId, "up");
  }, [handleMoveExercise]);

  const handleMoveDown = useCallback((exerciseId: string) => {
    handleMoveExercise(exerciseId, "down");
  }, [handleMoveExercise]);

  const prefillFromPrevious = useCallback(async (exerciseId: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group?.previousSets) return;

    const progression = group.progressionSuggested && unit
      ? { suggested: true, weightUnit: unit, exerciseCategory: group.exerciseCategory ?? null }
      : undefined;
    const toFill = computePrefillSets(group.sets, group.previousSets, group.trackingMode, progression);
    if (toFill.length === 0) {
      if (!silent) {
        const workingSets = group.sets.filter((s) => s.set_type !== "warmup");
        const allCompleted = workingSets.every((s) => s.completed);
        showToast(allCompleted ? "All sets already completed" : "Sets already have values");
      }
      return;
    }

    // Snapshot pre-fill set values for this exercise so we can roll back on DB failure.
    const preFillSnapshot = group.sets.map((s) => ({
      id: s.id,
      weight: s.weight,
      reps: s.reps,
      duration_seconds: s.duration_seconds,
    }));

    // Update local state in one batch
    setGroups((prev) =>
      prev.map((g) => {
        if (g.exercise_id !== exerciseId) return g;
        return {
          ...g,
          sets: g.sets.map((s) => {
            const fill = toFill.find((f) => f.setId === s.id);
            if (!fill) return s;
            return { ...s, weight: fill.weight, reps: fill.reps, duration_seconds: fill.duration_seconds };
          }),
        };
      })
    );

    // Persist to DB
    try {
      for (const fill of toFill) {
        await updateSet(fill.setId, fill.weight, fill.reps, fill.duration_seconds);
      }
    } catch (err) {
      // Rollback optimistic UI update so UI ↔ DB stays in sync when persistence fails.
      setGroups((prev) =>
        prev.map((g) => {
          if (g.exercise_id !== exerciseId) return g;
          return {
            ...g,
            sets: g.sets.map((s) => {
              const snap = preFillSnapshot.find((p) => p.id === s.id);
              if (!snap) return s;
              return { ...s, weight: snap.weight, reps: snap.reps, duration_seconds: snap.duration_seconds };
            }),
          };
        })
      );
      // Always leave a diagnostic breadcrumb, even on the silent auto-prefill path.
      // eslint-disable-next-line no-console
      console.warn(`[prefillFromPrevious] persist failed (exercise=${exerciseId}, silent=${silent}):`, err);
      if (!silent) showError("Failed to save prefilled values");
      return;
    }

    if (!silent) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast(`Filled ${toFill.length} set${toFill.length !== 1 ? "s" : ""} from last session`);
    }
    AccessibilityInfo.announceForAccessibility(`Prefilled ${toFill.length} sets from last session`);
  }, [groups, setGroups, showToast, showError, unit]);

  const handlePrefillFromPrevious = useCallback((exerciseId: string) => {
    return prefillFromPrevious(exerciseId);
  }, [prefillFromPrevious]);

  // BLD-682: the once-per-session-open auto-prefill effect was removed —
  // it violated AC5 (zero `updateSet` calls during hydration of pristine
  // rows). Pristine rows are now surfaced via `prefillCandidate` from
  // useSessionData (display-only) and persisted on user intent only:
  //   - explicit "+ Add Set" tap (handleAddSet, above)
  //   - explicit "Prefill from last session" button (handlePrefillFromPrevious)
  //   - first picker interaction (handleUpdate, above)
  //   - set-completion of a pristine row carrying a candidate (handleCheck, AC18)
  // No more hydration-write-storm.


  const finish = () => {
    confirmAction(
      "Complete Workout?",
      `Duration: ${formatTime(elapsed)}`,
      async () => {
        await completeSession(id!);
        bumpQueryVersion("home");
        queryClient.removeQueries({ queryKey: ["home"] });

        // Strava sync (non-blocking — never prevents workout completion)
        try {
          const { syncSessionToStrava } = await import("../lib/strava");
          const synced = await syncSessionToStrava(id!);
          if (synced) {
            showToast("Synced to Strava ✓");
          }
        } catch {
          showError("Strava sync failed");
        }

        // Health Connect sync (non-blocking, silent)
        if (Platform.OS === "android") {
          try {
            const { syncToHealthConnect } = await import("../lib/health-connect");
            await syncToHealthConnect(id!);
          } catch {
            // HC sync is silent
          }
        }

        try {
          const dayId = await getSessionProgramDayId(id!);
          if (dayId) {
            const day = await getProgramDayById(dayId);
            if (day) {
              const result = await advanceProgram(day.program_id, dayId, id!);
              if (result.wrapped) {
                showToast(`Cycle ${result.cycle} complete!`);
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
          // Program advance failed — session already saved
        }

        const allSets = await getSessionSets(id!);
        const done = allSets.filter((s) => s.completed);
        if (done.length === 0) {
          router.replace("/(tabs)");
        } else {
          // Fire-and-forget auto-backup — must never block navigation
          void (async () => {
            try {
              const { performAutoBackup, isAutoBackupEnabled } = await import("../lib/backup");
              if (await isAutoBackupEnabled()) {
                await performAutoBackup();
              }
            } catch {
              // Silent failure — backup should never block workout completion
            }
          })();
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
        bumpQueryVersion("home");
        queryClient.removeQueries({ queryKey: ["home"] });
        router.back();
      },
      true
    );
  };

  return {
    elapsed,
    /** BLD-630: null until the user completes the first set in the session.
     * Consumers (header) use this to render the "Starts when you log your
     * first set" caption and the appropriate a11y label. */
    clockStartedAt,
    exerciseNotesOpen,
    exerciseNotesDraft,
    nextHint,
    hintTimer,
    handleUpdate,
    handleCheck,
    handleAddSet,
    handleDelete,
    handleExerciseNotes,
    handleExerciseNotesDraftChange,
    toggleExerciseNotes,
    handleMoveUp,
    handleMoveDown,
    handlePrefillFromPrevious,
    finish,
    cancel,
  };
}
