/* eslint-disable max-lines-per-function, max-lines, react-hooks/exhaustive-deps, complexity */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Keyboard } from "react-native";
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
  syncTemplateFromSession,
  undoTemplateSyncFromSession,
  updateExerciseNote,
  dismissExerciseBackfill,
  getExerciseBackfillCandidate,
  updatePulleyPin,
} from "../lib/db";
import {
  getLastBodyweightModifier,
  updateSetBodyweightModifier,
  getPreviousSetsBatch,
  getRecentVariantHistory,
  updateSetVariant,
  getRecentBodyweightGripHistory,
  updateSetBodyweightVariant,
  updateSetsBatch,
  updateSetStackMarker,
  updateSetManualWeight,
  getRecentStackHistory,
  updateSetRepsAndDuration,
} from "../lib/db/session-sets";
import { insertSegment, deleteSegment, collapseAdvancedSetToNormal, getSegmentsForSets } from "../lib/db/sets";
import { getLastVariant, isCableExercise } from "../lib/cable-variant";
import { resolveMarker } from "../lib/cable-stack";
import {
  fetchStacksWithCalibrations,
  type StackWithCalibrations,
} from "./useActiveCalibration";
import {
  getLastBodyweightGripVariant,
  isBodyweightGripExercise,
} from "../lib/bodyweight-grip-variant";
import {
  resolvePrefillCandidate,
  type PrefillCandidate,
} from "./resolvePrefillCandidate";
import { resolveRestSeconds, type RestBreakdown } from "../lib/rest";
import { restResolverBreadcrumb } from "../lib/rest-resolver";
import * as Sentry from "@sentry/react-native";
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
import type { Suggestion } from "../lib/rm";

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
import { type NextSetPreview } from "../lib/notifications";

/**
 * BLD-1137: Compute the next-set preview and isLastSet flag for the Smart Rest Coach
 * lock-screen notification. Looks at the next uncompleted set in `previewGroup`.
 * isLastSet = true iff no uncompleted sets remain anywhere across all groups
 * (excluding the just-completed set which is now marked done optimistically).
 *
 * Fallback precedence (plan §Preview body formatting):
 * 1. Next uncompleted planned set in same exercise group (primary).
 * 2. Progression suggestion from lib/rm.ts suggest() (secondary, when primary is null).
 * 3. null → no preview.
 */
function computeRestPreview(
  completedSetId: string,
  previewGroup: { name: string; is_bodyweight: boolean; trackingMode: "reps" | "duration"; sets: Array<{ id: string; completed: boolean; weight: number | null; reps: number | null; duration_seconds: number | null }> } | undefined,
  allGroups: Array<{ sets: Array<{ id: string; completed: boolean }> }>,
  unit: "kg" | "lb",
  suggestion?: Suggestion | null,
): { preview: NextSetPreview; isLastSet: boolean } {
  const isLastSet = !allGroups.some((g) =>
    g.sets.some((s) => !s.completed && s.id !== completedSetId),
  );
  if (!previewGroup) return { preview: null, isLastSet };
  const exerciseKind: NonNullable<NextSetPreview>["exerciseKind"] =
    previewGroup.is_bodyweight ? "bodyweight"
    : previewGroup.trackingMode === "duration" ? "time_based"
    : "weighted";
  const nextSet = previewGroup.sets.find((s) => !s.completed && s.id !== completedSetId);
  if (nextSet) {
    return {
      preview: {
        exerciseName: previewGroup.name,
        exerciseKind,
        plannedWeight: nextSet.weight ?? null,
        weightUnit: unit,
        repRange: nextSet.reps != null ? String(nextSet.reps) : null,
        durationSeconds: nextSet.duration_seconds ?? null,
        distanceMeters: null,
      },
      isLastSet,
    };
  }
  // Fallback: progression suggestion from lib/rm.ts suggest()
  // suggest() returns reps: null for weighted increase/maintain — derive repRange from the
  // last completed set or the just-completed set (completedSetId, not yet flushed in state).
  if (suggestion) {
    const lastCompletedSet =
      [...previewGroup.sets].filter((s) => s.completed).at(-1) ??
      previewGroup.sets.find((s) => s.id === completedSetId);
    const repRange =
      suggestion.reps != null ? String(suggestion.reps)
      : lastCompletedSet?.reps != null ? String(lastCompletedSet.reps)
      : null;
    return {
      preview: {
        exerciseName: previewGroup.name,
        exerciseKind,
        plannedWeight: suggestion.weight > 0 ? suggestion.weight : null,
        weightUnit: unit,
        repRange,
        durationSeconds: null,
        distanceMeters: null,
      },
      isLastSet,
    };
  }
  return { preview: null, isLastSet };
}

type Params = {
  id: string | undefined;
  groups: ExerciseGroup[];
  setGroups: React.Dispatch<React.SetStateAction<ExerciseGroup[]>>;
  updateGroupSet: (setId: string, updates: Partial<SetWithMeta>) => void;
  startRest: (ctx: string | SetContext) => void;
  startRestWithDuration: (secs: number, preview?: NextSetPreview, isLastSet?: boolean) => void;
  startRestWithBreakdown: (breakdown: RestBreakdown, preview?: NextSetPreview, isLastSet?: boolean) => void;
  dismissRest: () => void;
  session: { started_at: number; clock_started_at?: number | null; name: string; gym_id?: string | null } | null;
  showToast: (msg: string, opts?: { action?: { label: string; onPress: () => void | Promise<void> }; duration?: number }) => void;
  showError: (msg: string) => void;
  triggerPR?: (exerciseName: string, goalAchieved?: boolean) => void;
  unit?: "kg" | "lb";
  suggestions?: Record<string, Suggestion | null>;
};

export function useSessionActions({
  id,
  groups,
  setGroups,
  updateGroupSet,
  startRest,
  startRestWithDuration,
  startRestWithBreakdown,
  dismissRest,
  session,
  showToast,
  showError,
  triggerPR,
  unit,
  suggestions,
}: Params) {
  const router = useRouter();
  // BLD-1239: ref so finish/cancel can access the router without including it in
  // useCallback deps. In production, useRouter() returns a stable singleton — but
  // keeping it as a ref removes any dependency on the reference identity of the
  // router object and makes the hook easier to unit-test.
  const routerRef = useRef(router);
  routerRef.current = router;

  // --- local state ---
  const [elapsed, setElapsed] = useState(0);
  // BLD-1239: keep a ref in sync so finish() can read the latest elapsed without
  // capturing elapsed as a dependency (which would cause finish to get a new reference
  // every second, re-mount the memoised listFooter, and drop Android tap events).
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
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
  // BLD-1028: per-exercise pinned note draft. Separate from exerciseNotesDraft
  // which drives workout_sets.notes (per-set, per-session).
  const [pinnedNoteDraft, setPinnedNoteDraft] = useState<Record<string, string>>({});
  const pinnedNoteDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pinnedNotePendingFlushRef = useRef<Record<string, string>>({});
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
  // BLD-1028: flush all pending pinned-note debounces immediately to DB.
  // Called from AppState (background/inactive), finish, unmount.
  const flushAllPinnedNotes = useCallback(async () => {
    const pending = pinnedNotePendingFlushRef.current;
    pinnedNotePendingFlushRef.current = {};
    const writes: Promise<void>[] = [];
    for (const [exerciseId, text] of Object.entries(pending)) {
      const debounce = pinnedNoteDebounceRef.current[exerciseId];
      if (debounce) {
        clearTimeout(debounce);
        delete pinnedNoteDebounceRef.current[exerciseId];
      }
      writes.push(updateExerciseNote(exerciseId, text));
    }
    await Promise.all(writes);
  }, []);

  // Cleanup: flush any pending pinned-note drafts on unmount.
  useEffect(() => {
    return () => { void flushAllPinnedNotes(); };
  }, [flushAllPinnedNotes]);

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
        // BLD-1028: flush any pending pinned-note drafts on background.
        void flushAllPinnedNotes();
      } else if (next === "inactive") {
        sessionBreadcrumb("session.appstate.inactive");
        stop();
        void flushAllPinnedNotes();
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
    // BLD-1122 AC17: weight/reps changes affect plateau window
    queryClient.invalidateQueries({ queryKey: ["plateau"] });
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
      // BLD-1137: for superset rest, preview is the next uncompleted set of the
      // first linked exercise (superset cycles back to the top).
      const firstLinked = linked.length > 0 ? linked[0] : undefined;
      const previewGroup = firstLinked?.exercise_id !== set.exercise_id ? firstLinked : undefined;
      const { preview, isLastSet } = computeRestPreview(set.id, previewGroup, groups, unit ?? "lb", previewGroup ? suggestions?.[previewGroup.exercise_id] : undefined);
      // Adaptive superset rest: resolve using the last-completed set's context
      // on the final exercise of the superset (per plan §5).
      const adaptiveSetting = await getAppSetting("rest_adaptive_enabled");
      if (adaptiveSetting !== "false" && id) {
        try {
          // AC2c: linkScope: true so history tier is never consulted for linked groups.
          // Only bypass needed is for pinned (history cannot occur here).
          const ctx = await getRestContext(id, set.exercise_id, {
            set_type: set.set_type,
            rpe: set.rpe,
          }, { linkScope: true });
          if (ctx.source.kind === "pinned") {
            const secs = Math.min(600, Math.max(15, ctx.source.seconds));
            startRestWithDuration(secs, preview, isLastSet);
            return;
          }
          const breakdown = resolveRestSeconds(ctx);
          startRestWithBreakdown(breakdown, preview, isLastSet);
          return;
        } catch (e) {
          // Resolver error — log to Sentry for observability, then fall through to legacy path.
          Sentry.captureException(e, { tags: { feature: "rest-resolver" } });
          restResolverBreadcrumb({ source: "default", seconds: 0, exerciseId: set.exercise_id, level: "error" });
        }
      }
      const secs = await getRestSecondsForLink(id!, set.link_id!);
      startRestWithDuration(secs, preview, isLastSet);
    }
  }, [groups, id, unit, suggestions, startRestWithDuration, startRestWithBreakdown]);

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
      // BLD-1122 AC17: set completion status affects plateau window
      queryClient.invalidateQueries({ queryKey: ["plateau"] });
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
    // BLD-1122 AC17: completing a set changes the plateau window
    queryClient.invalidateQueries({ queryKey: ["plateau"] });

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
      // BLD-1137: compute next-set preview for Smart Rest Coach lock-screen notification.
      const group = groups.find((g) => g.exercise_id === set.exercise_id);
      const { preview, isLastSet } = computeRestPreview(set.id, group, groups, unit ?? "lb", suggestions?.[set.exercise_id]);
      startRest({
        exerciseId: set.exercise_id,
        sessionId: id!,
        setType: set.set_type,
        rpe: set.rpe,
        setId: set.id,
        preview,
        isLastSet,
      });
    }
  }, [updateGroupSet, groups, id, unit, suggestions, startRest, startRestWithDuration, triggerPR, handleLinkedRest]);

  const handleAddSet = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    const num = (group?.sets.length ?? 0) + 1;
    // AC1.1 / AC1.6: pass exerciseDefaultTempo for rep-mode groups; null for duration groups.
    const exerciseDefaultTempo = group?.trackingMode === "duration" ? null : (group?.defaultTempo ?? null);
    const newSet = await addSet(id!, exerciseId, num, null, null, null, undefined, undefined, group?.exercise_position ?? 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, exerciseDefaultTempo);

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
     //      last attachment is e.g. rope but no recent mount_position, only
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
     // user's last set has e.g. grip_type of overhand but no grip_width, only
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

    // BLD-1126 AC6: autofill stack marker from the user's last logged cable set
    // on this exercise. Only fires when: the exercise is cable, the session has
    // a gym_id, and the user's last set had a stack_marker recorded. Uses
    // CURRENT calibration data (not historical snapshot) to resolve the true
    // weight — the snapshot columns on the prior set remain immutable (AC3).
    let autofilledStackId: string | null = null;
    let autofilledStackMarker: number | null = null;
    let autofilledStackName: string | null = null;
    let autofilledStackUnit: string | null = null;
    let autofilledStackWeight: number | null = null;
    if (group && isCableExercise({ equipment: group.equipment }) && session?.gym_id) {
      try {
        const lastMarker = await getRecentStackHistory(exerciseId);
        if (lastMarker?.stack_marker != null && lastMarker.stack_id) {
          // BLD-1130 G2 (closes BLD-1127 AC6 cold-cache race): use fetchQuery
          // (not getQueryData) so a cold cache awaits a real fetch instead of
          // silently skipping autofill on the first add-set after gym change.
          // Same key as `useActiveCalibration` so react-query dedupes any
          // concurrent in-flight fetch from the rendered ExerciseGroupCard.
          // Use relative path (matches static imports elsewhere in this file)
          // so jest's resolver doesn't depend on the `@/*` alias mapper.
          // BLD-1130: fetchStacksWithCalibrations + resolveMarker statically
          // imported at top of file. The previous `await import()` pattern
          // failed under jest CJS dynamic-import without
          // --experimental-vm-modules; static binding makes the cold-cache
          // path testable and removes a per-call resolver round-trip.
          const currentStacks: StackWithCalibrations[] =
            await queryClient.fetchQuery({
              queryKey: ["stack-calibrations", session.gym_id],
              queryFn: () => fetchStacksWithCalibrations(session.gym_id as string),
              staleTime: 60_000,
            });
          const matchedStack = currentStacks.find((s) => s.id === lastMarker.stack_id);
          if (matchedStack) {
            const resolved = resolveMarker(matchedStack.calibrations, lastMarker.stack_marker);
            if (resolved !== null) {
              await updateSetStackMarker(newSet.id, {
                weight: resolved.weight,
                marker: lastMarker.stack_marker,
                stackId: matchedStack.id,
                stackName: matchedStack.name,
                stackUnit: matchedStack.unit ?? "",
              });
              autofilledStackId = matchedStack.id;
              autofilledStackMarker = lastMarker.stack_marker;
              autofilledStackName = matchedStack.name;
              autofilledStackUnit = matchedStack.unit ?? null;
              autofilledStackWeight = resolved.weight;
            }
          }
        }
      } catch {
        // Stack marker autofill is best-effort; silently ignored on any error.
      }
    }
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
    // Always resolve the reps/duration prefill candidate (BLD-655/BLD-682), but
    // when marker autofill has already set the weight:
    //  - use updateSetRepsAndDuration (reps + duration only, no weight/stack cols)
    //  - leave prefillWeight as null so setWithModifier keeps the marker weight.
    // When no marker autofill, use the normal updateSet path (weight + reps).
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
          if (autofilledStackWeight !== null) {
            // Marker autofill owns the weight. Only carry reps/duration so the
            // set is pre-populated without overwriting the resolved marker weight
            // or leaving stack_* snapshot columns in an inconsistent state.
            await updateSetRepsAndDuration(
              newSet.id,
              candidate.reps,
              isDuration ? candidate.duration_seconds : undefined,
            );
            prefillReps = candidate.reps;
            prefillDuration = candidate.duration_seconds;
            prefillApplied = true;
          } else {
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
          }
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
      // BLD-1126 AC6: propagate stack marker autofill into in-memory row so
      // the pill renders the autofilled marker immediately without a refresh.
      stack_id: autofilledStackId ?? newSet?.stack_id ?? null,
      stack_marker: autofilledStackMarker ?? newSet?.stack_marker ?? null,
      stack_name_at_log: autofilledStackName ?? newSet?.stack_name_at_log ?? null,
      stack_unit_at_log: autofilledStackUnit ?? newSet?.stack_unit_at_log ?? null,
      ...(autofilledStackWeight !== null ? { weight: autofilledStackWeight } : {}),
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
    // BLD-1122 AC17: set deletion changes the plateau window
    queryClient.invalidateQueries({ queryKey: ["plateau"] });
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

  // BLD-1028: Pinned per-exercise note handlers.

  /** Called on every keystroke; debounces DB write at 600ms. */
  const handlePinnedNoteDraftChange = useCallback((exerciseId: string, text: string) => {
    setPinnedNoteDraft((prev) => ({ ...prev, [exerciseId]: text }));
    pinnedNotePendingFlushRef.current[exerciseId] = text;
    // Clear existing debounce and restart.
    const existing = pinnedNoteDebounceRef.current[exerciseId];
    if (existing) clearTimeout(existing);
    pinnedNoteDebounceRef.current[exerciseId] = setTimeout(() => {
      delete pinnedNoteDebounceRef.current[exerciseId];
      delete pinnedNotePendingFlushRef.current[exerciseId];
      void updateExerciseNote(exerciseId, text);
      // Mirror back to group state so re-navigation reflects the latest note.
      setGroups((prev) => prev.map((g) =>
        g.exercise_id === exerciseId ? { ...g, pinnedNote: text || null } : g
      ));
    }, 600);
  }, [setGroups]);

  /** Called on onBlur / explicit save — flushes immediately. */
  const handleSavePinnedNote = useCallback((exerciseId: string, text: string) => {
    const existing = pinnedNoteDebounceRef.current[exerciseId];
    if (existing) clearTimeout(existing);
    delete pinnedNoteDebounceRef.current[exerciseId];
    delete pinnedNotePendingFlushRef.current[exerciseId];
    setPinnedNoteDraft((prev) => { const n = { ...prev }; delete n[exerciseId]; return n; });
    void updateExerciseNote(exerciseId, text);
    setGroups((prev) => prev.map((g) =>
      g.exercise_id === exerciseId ? { ...g, pinnedNote: text || null } : g
    ));
  }, [setGroups]);

  /** Dismisses the backfill prompt (both "Copy" and "Dismiss" taps). */
  const handleDismissBackfill = useCallback((exerciseId: string) => {
    void dismissExerciseBackfill(exerciseId);
    setGroups((prev) => prev.map((g) =>
      g.exercise_id === exerciseId ? { ...g, pinnedNoteBackfill: null } : g
    ));
  }, [setGroups]);

  /**
   * Lazy-loads the backfill candidate for an exercise. Called by the header
   * on first mount so we don't pay the query cost for all exercises upfront.
   */
  const handleLoadBackfill = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    // Only query if: no pinned note, not yet dismissed, not already loaded.
    if (!group || group.pinnedNote || group.pinnedNoteBackfill !== undefined) return;
    const candidate = await getExerciseBackfillCandidate(exerciseId);
    setGroups((prev) => prev.map((g) =>
      g.exercise_id === exerciseId ? { ...g, pinnedNoteBackfill: candidate } : g
    ));
  }, [groups, setGroups]);

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
      pulley_pin: s.pulley_pin,
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
            return { ...s, weight: fill.weight, reps: fill.reps, duration_seconds: fill.duration_seconds, pulley_pin: fill.pulley_pin ?? s.pulley_pin };
          }),
        };
      })
    );

    // Persist to DB
    try {
      for (const fill of toFill) {
        await updateSet(fill.setId, fill.weight, fill.reps, fill.duration_seconds);
        if (fill.pulley_pin !== undefined) {
          await updatePulleyPin(fill.setId, fill.pulley_pin ?? null);
        }
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
              return { ...s, weight: snap.weight, reps: snap.reps, duration_seconds: snap.duration_seconds, pulley_pin: snap.pulley_pin };
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


  // BLD-1239: wrap in useCallback so finish's reference is stable across rest-timer ticks.
  // Previously a plain arrow function → new ref every render → listFooter remounted every
  // second → Android Pressable could be unmounted between touchDown and touchUp, dropping
  // the tap. Uses elapsedRef.current and routerRef.current to read current values without
  // adding them to deps (they are refs, always up-to-date).
  const finish = useCallback(() => {
    confirmAction(
      "Complete Workout?",
      `Duration: ${formatTime(elapsedRef.current)}`,
      async () => {

        // BLD-1207 / GH#589: the critical "save the workout" steps must
        // never silently no-op. Previously a thrown rejection inside
        // dismissRest() / flushAllPinnedNotes() / completeSession() was
        // swallowed by Alert's onPress callback, so the user saw "no
        // event" after tapping Complete and lost their session. Wrap the
        // must-succeed chain in try/catch and surface a toast on failure
        // so the user can retry. Their data remains intact because the
        // session is not marked completed_at on throw and the resume CTA
        // on Home still picks it up.
        try {
          // BLD-1137: cancel any active rest timer notifications before completing.
          dismissRest();
          // BLD-1028: flush any pending pinned-note drafts before completing.
          await flushAllPinnedNotes();
          await completeSession(id!);
        } catch (err) {
          console.warn("[finish] failed to complete workout:", err);
          showError("Couldn't finish workout — your data is safe, please try again");
          return;
        }
        bumpQueryVersion("home");
        queryClient.removeQueries({ queryKey: ["home"] });
        // BLD-1122 AC17: completing a session finalizes the plateau window
        queryClient.invalidateQueries({ queryKey: ["plateau"] });

        // Sync session edits (set count + set types) back to originating template (BLD-1038)
        try {
          const syncResult = await syncTemplateFromSession(id!);
          if (syncResult) {
            const toastMsg =
              syncResult.kind === "cloned"
                ? "Saved as your template — Starter unchanged"
                : "Template updated from this session";
            showToast(toastMsg, {
              action: {
                label: "Undo",
                onPress: async () => {
                  try {
                    const undoResult = await undoTemplateSyncFromSession(syncResult);
                    if (undoResult?.blocked) {
                      const blockedMsg =
                        syncResult.kind === "updated"
                          ? "Can't undo — template was edited again"
                          : "Can't undo — template already in use";
                      showToast(blockedMsg, { duration: 4000 });
                    }
                  } catch {
                    showError("Could not undo template update");
                  }
                },
              },
              duration: 6000,
            });
          }
        } catch {
          // Template sync failure must never block workout completion
        }

        // Strava sync (non-blocking — never prevents workout completion)
        try {
          const { syncSessionToStrava } = await import("../lib/strava");
          const result = await syncSessionToStrava(id!);
          if (result.status === "synced") {
            showToast("Synced to Strava ✓");
          } else if (result.status === "queued") {
            showToast("Strava sync queued — will retry");
          } else if (result.status === "failed") {
            showToast("Strava sync failed — check Settings", {
              action: { label: "Settings", onPress: () => routerRef.current.push("/settings/strava") },
              duration: 6000,
            });
          }
          // "skipped" → no toast (not connected or no sets)
        } catch {
          showError("Strava sync failed");
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
          routerRef.current.replace("/(tabs)");
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
          routerRef.current.replace(`/session/summary/${id}`);
        }
      },
      false,
      "Complete"
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- elapsedRef/routerRef are refs (stable); id/dismissRest/flushAllPinnedNotes/showError/showToast are the real deps
  }, [id, dismissRest, flushAllPinnedNotes, showError, showToast]);

  // BLD-1239: wrap in useCallback — cancel had the same re-mount issue as finish.
  const cancel = useCallback(() => {
    confirmAction(
      "Discard Workout?",
      "All logged sets will be lost.",
      async () => {
        await cancelSession(id!);
        bumpQueryVersion("home");
        queryClient.removeQueries({ queryKey: ["home"] });
        // BLD-1122 AC17: cancelled session removes sets from plateau window
        queryClient.invalidateQueries({ queryKey: ["plateau"] });
        routerRef.current.back();
      },
      true
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- routerRef is a ref (stable); cancelSession/bumpQueryVersion/queryClient are stable module imports
  }, [id]);

  /** BLD-1122: Atomically apply break-through fill updates to a set of rows.
   * Writes via updateSetsBatch (single transaction), then invalidates plateau queries. */
  const handleApplyBreakThrough = useCallback(
    async (exerciseId: string, updates: { id: string; weight: number | null; reps: number | null }[]) => {
      if (updates.length === 0) return;
      // Capture pre-update snapshot for rollback fidelity (AC9)
      const preUpdateSnapshot = new Map<string, { weight: number | null; reps: number | null }>();
      setGroups((prev) => {
        for (const g of prev) {
          if (g.exercise_id !== exerciseId) continue;
          for (const s of g.sets) {
            const upd = updates.find((u) => u.id === s.id);
            if (upd) preUpdateSnapshot.set(s.id, { weight: s.weight, reps: s.reps });
          }
        }
        return prev.map((g) => {
          if (g.exercise_id !== exerciseId) return g;
          return {
            ...g,
            sets: g.sets.map((s) => {
              const upd = updates.find((u) => u.id === s.id);
              if (!upd) return s;
              return { ...s, weight: upd.weight, reps: upd.reps };
            }),
          };
        });
      });
      try {
        await updateSetsBatch(updates);
        queryClient.invalidateQueries({ queryKey: ["plateau"] });
      } catch (err) {
        // Rollback to snapshot values (not blanket null — preserves 0 vs null distinction)
        setGroups((prev) =>
          prev.map((g) => {
            if (g.exercise_id !== exerciseId) return g;
            return {
              ...g,
              sets: g.sets.map((s) => {
                const snap = preUpdateSnapshot.get(s.id);
                if (!snap) return s;
                return { ...s, weight: snap.weight, reps: snap.reps };
              }),
            };
          })
        );
        showError("Failed to apply break-through suggestion");
        // eslint-disable-next-line no-console
        console.warn("[handleApplyBreakThrough] persist failed:", err);
      }
    },
    [setGroups, showError]
  );

  /**
   * BLD-1126 AC3: Atomic write of all five stack columns in a single UPDATE.
   * Called by SetWeightCell → SetRow → ExerciseGroupSetTable → ExerciseGroupCard → session screen.
   * Also invalidates the stack-calibrations cache so any concurrent hook refetch
   * sees the freshest snapshot name (AC6 autofill uses current calibration).
   *
   * BLD-1128: Snapshot all six mutable fields before the optimistic write and
   * restore them on failure (weight was missing from the prior rollback — Defect 1).
   */
  const handleMarkerConfirm = useCallback(
    async (setId: string, result: { stackId: string; stackName: string; marker: number; trueWeight: number; unit: string }) => {
      // Snapshot prior state so we can fully restore on DB failure (BLD-1128 AC1).
      const priorSet = groups.flatMap((g) => g.sets).find((s) => s.id === setId);
      const priorSnapshot = priorSet
        ? {
            weight: priorSet.weight,
            reps: priorSet.reps,
            stack_id: priorSet.stack_id,
            stack_marker: priorSet.stack_marker,
            stack_name_at_log: priorSet.stack_name_at_log,
            stack_unit_at_log: priorSet.stack_unit_at_log,
          }
        : null;

      // Optimistic in-memory update so the pill re-renders immediately (AC1).
      updateGroupSet(setId, {
        stack_id: result.stackId,
        stack_name_at_log: result.stackName,
        stack_marker: result.marker,
        stack_unit_at_log: result.unit,
        weight: result.trueWeight,
      });
      try {
        await updateSetStackMarker(setId, {
          weight: result.trueWeight,
          marker: result.marker,
          stackId: result.stackId,
          stackName: result.stackName,
          stackUnit: result.unit,
        });
        queryClient.invalidateQueries({ queryKey: ["stack-calibrations"] });
      } catch (err) {
        // Restore all six fields from snapshot (BLD-1128 Defect 1 — prior code
        // omitted `weight`, leaving the optimistic resolved weight in the UI while
        // DB had weight=NULL or the previous value).
        if (priorSnapshot) {
          updateGroupSet(setId, priorSnapshot);
        } else {
          // Fallback if set was not found in groups (should not happen in practice).
          updateGroupSet(setId, {
            weight: null,
            reps: null,
            stack_id: null,
            stack_name_at_log: null,
            stack_marker: null,
            stack_unit_at_log: null,
          });
        }
        showError("Failed to save stack marker");
        // eslint-disable-next-line no-console
        console.warn("[handleMarkerConfirm] persist failed:", err);
      }
    },
    [groups, updateGroupSet, showError]
  );

  /**
   * BLD-1126 AC5: When the user long-presses a marker-logged pill and then saves
   * a numeric weight, this handler issues a single UPDATE that writes weight + reps
   * AND clears all four stack_* columns (stack_id, stack_marker, stack_name_at_log,
   * stack_unit_at_log). Called only from the keypad-override code path in
   * SetWeightCell — normal weight changes use handleUpdate as usual.
   *
   * BLD-1128: Snapshot all six mutable fields before the optimistic write and
   * restore them on failure (prior code had no rollback at all — Defect 2).
   */
  const handleManualWeightSave = useCallback(
    async (setId: string, weight: number | null, reps: number | null) => {
      // Snapshot prior state so we can fully restore on DB failure (BLD-1128 AC2).
      const priorSet = groups.flatMap((g) => g.sets).find((s) => s.id === setId);
      const priorSnapshot = priorSet
        ? {
            weight: priorSet.weight,
            reps: priorSet.reps,
            stack_id: priorSet.stack_id,
            stack_marker: priorSet.stack_marker,
            stack_name_at_log: priorSet.stack_name_at_log,
            stack_unit_at_log: priorSet.stack_unit_at_log,
          }
        : null;

      // Optimistic update: clear stack fields, apply weight.
      updateGroupSet(setId, {
        weight,
        reps,
        stack_id: null,
        stack_marker: null,
        stack_name_at_log: null,
        stack_unit_at_log: null,
      });
      try {
        await updateSetManualWeight(setId, { weight, reps });
      } catch (err) {
        // Restore all six fields from snapshot (BLD-1128 Defect 2 — prior code
        // performed no rollback at all, leaving the optimistic manual weight/reps
        // in the UI while the DB still held the old marker snapshot).
        if (priorSnapshot) {
          updateGroupSet(setId, priorSnapshot);
        } else {
          updateGroupSet(setId, {
            weight: null,
            reps: null,
            stack_id: null,
            stack_marker: null,
            stack_name_at_log: null,
            stack_unit_at_log: null,
          });
        }
        showError("Failed to save weight");
        // eslint-disable-next-line no-console
        console.warn("[handleManualWeightSave] persist failed:", err);
      }
    },
    [groups, updateGroupSet, showError]
  );

  const handleAddSegment = useCallback(
    async (setId: string, reps: number) => {
      const allSets = groups.flatMap((g) => g.sets);
      const set = allSets.find((s) => s.id === setId);
      if (!set) return;
      const segments = set.segments ?? [];
      // deleteSegment renumbers remaining segments to contiguous 1..N, so the
      // next slot is always (length + 1). This keeps mini-set labels meaningful
      // under the 8-cap.
      const nextSegmentNumber = segments.length + 1;
      await insertSegment({
        setId,
        segmentNumber: nextSegmentNumber,
        reps,
        weight: null,
      });
      const segMap = await getSegmentsForSets([setId]);
      updateGroupSet(setId, { segments: segMap.get(setId) ?? [] });
    },
    [groups, updateGroupSet]
  );

  const handleDeleteSegment = useCallback(
    async (segmentId: string, setId: string) => {
      await deleteSegment(segmentId, setId);
      const segMap = await getSegmentsForSets([setId]);
      updateGroupSet(setId, { segments: segMap.get(setId) ?? [] });
    },
    [updateGroupSet]
  );

  const handleCollapseToNormal = useCallback(
    async (setId: string) => {
      // Atomic collapse: deletes segments, sets type='normal' + reps=Σ, AND
      // rewrites cached_volume_kg / cached_e1rm_kg from parent.weight × Σreps.
      // Doing these as separate calls leaves caches stuck at 0 because
      // recomputeSetCaches early-returns for non-advanced sets with no segments.
      const totalReps = await collapseAdvancedSetToNormal(setId);
      updateGroupSet(setId, {
        set_type: "normal",
        segments: [],
        reps: totalReps > 0 ? totalReps : null,
      });
    },
    [updateGroupSet]
  );

  return {
    elapsed,
    /** BLD-630: null until the user completes the first set in the session.
     * Consumers (header) use this to render the "Starts when you log your
     * first set" caption and the appropriate a11y label. */
    clockStartedAt,
    exerciseNotesOpen,
    exerciseNotesDraft,
    pinnedNoteDraft,
    nextHint,
    hintTimer,
    handleUpdate,
    handleCheck,
    handleAddSet,
    handleDelete,
    handleExerciseNotes,
    handleExerciseNotesDraftChange,
    toggleExerciseNotes,
    handlePinnedNoteDraftChange,
    handleSavePinnedNote,
    handleDismissBackfill,
    handleLoadBackfill,
    handleMoveUp,
    handleMoveDown,
    handlePrefillFromPrevious,
    handleApplyBreakThrough,
    handleMarkerConfirm,
    handleManualWeightSave,
    handleAddSegment,
    handleDeleteSegment,
    handleCollapseToNormal,
    finish,
    cancel,
  };
}
