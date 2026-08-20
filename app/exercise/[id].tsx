import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/bna-toast";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  softDeleteCustomExercise,
  getTemplatesUsingExercise,
  updateExerciseNote,
  setDefaultTempo,
  updateTrackUnilateral,
  type ExerciseSession,
} from "../../lib/db";
import { bumpQueryVersion } from "../../lib/query";
import { ATTACHMENT_LABELS, type Attachment, type Category, type Difficulty } from "../../lib/types";
import { DIFFICULTY_COLORS } from "../../constants/theme";
import { MuscleMap } from "../../components/MuscleMap";
import { rpeColor, rpeText } from "../../lib/rpe";
import { toDisplay } from "../../lib/units";
import { useLayout } from "../../lib/layout";
import FlowContainer, { flowCardStyle } from "../../components/ui/FlowContainer";
import { useProfileGender } from "../../lib/useProfileGender";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useExerciseDetail, MAX_ITEMS } from "@/hooks/useExerciseDetail";
import ExerciseRecordsCard from "@/components/exercise/ExerciseRecordsCard";
import ExerciseChartCard from "@/components/exercise/ExerciseChartCard";
import ExerciseVariantFilter from "@/components/exercise/ExerciseVariantFilter";
import { PlateauStatusCard } from "@/components/exercise/PlateauStatusCard";
import { usePlateauStatus } from "@/hooks/usePlateauStatus";
import { FormVideoSheet } from "@/components/session/FormVideoSheet";
import { getMostRecentCompletedSetForExercise, getLatestUnilateralInsight } from "@/lib/db/session-sets";
import { ATTACHMENT_VALUES, isCableExercise } from "@/lib/cable-variant";
import StrengthLevelBadge from "@/components/exercise/StrengthLevelBadge";
import { useStrengthLevel } from "@/hooks/useStrengthLevel";
import { useStrengthGoal } from "@/hooks/useStrengthGoals";
import { useBottomSheet } from "@/components/ui/bottom-sheet";
import GoalProgressCard from "@/components/exercise/GoalProgressCard";
import GoalSetForm from "@/components/exercise/GoalSetForm";
import { BodyweightModifierNotice } from "@/components/exercises/BodyweightModifierNotice";
import ProgressionPathCard from "@/components/exercise/ProgressionPathCard";
import { PinnedExerciseNoteEditor } from "@/components/session/PinnedExerciseNoteEditor";
import { ExerciseDefaultTempoField } from "@/components/exercise/ExerciseDefaultTempoField";
import { useProgressionChain } from "@/hooks/useProgressionChain";
import { fontSizes } from "@/constants/design-tokens";
import { formatIntensity } from "@/lib/intensity";
import { useIntensityMode } from "@/hooks/useIntensityMode";
import { ExerciseIllustrationCards } from "@/components/exercises/ExerciseIllustrationCards";

function categoryLabel(category: Category): string {
  switch (category) {
    case "abs_core": return t({ id: "app.exercise.id.category.absCore", message: "Abs & Core" });
    case "arms": return t({ id: "app.exercise.id.category.arms", message: "Arms" });
    case "back": return t({ id: "app.exercise.id.category.back", message: "Back" });
    case "chest": return t({ id: "app.exercise.id.category.chest", message: "Chest" });
    case "legs_glutes": return t({ id: "app.exercise.id.category.legsGlutes", message: "Legs & Glutes" });
    case "shoulders": return t({ id: "app.exercise.id.category.shoulders", message: "Shoulders" });
  }
}

function difficultyLabel(difficulty: Difficulty): string {
  switch (difficulty) {
    case "beginner": return t({ id: "app.exercise.id.difficulty.beginner", message: "Beginner" });
    case "intermediate": return t({ id: "app.exercise.id.difficulty.intermediate", message: "Intermediate" });
    case "advanced": return t({ id: "app.exercise.id.difficulty.advanced", message: "Advanced" });
  }
}

function attachmentLabel(attachment: Attachment): string {
  switch (attachment) {
    case ATTACHMENT_VALUES[0]: return t({ id: "app.exercise.id.attachment.handle", message: "Handle" });
    case ATTACHMENT_VALUES[1]: return t({ id: "app.exercise.id.attachment.ringHandle", message: "Ring Handle" });
    case ATTACHMENT_VALUES[2]: return t({ id: "app.exercise.id.attachment.ankleStrap", message: "Ankle Strap" });
    case ATTACHMENT_VALUES[3]: return t({ id: "app.exercise.id.attachment.rope", message: "Rope" });
    case ATTACHMENT_VALUES[4]: return t({ id: "app.exercise.id.attachment.bar", message: "Bar" });
    case ATTACHMENT_VALUES[5]: return t({ id: "app.exercise.id.attachment.squatHarness", message: "Squat Harness" });
    case ATTACHMENT_VALUES[6]: return t({ id: "app.exercise.id.attachment.carabiner", message: "Carabiner" });
  }
  return ATTACHMENT_LABELS[attachment];
}

function formatDateLong(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(ts));
}

function GoalSection({ goalState, colors, bw, unit, onOpenSheet }: {
  goalState: ReturnType<typeof useStrengthGoal>; colors: ReturnType<typeof useThemeColors>;
  bw: boolean; unit: "kg" | "lb"; onOpenSheet: () => void;
}) {
  if (goalState.isLoading) return null;
  if (goalState.goal) {
    return (
      <GoalProgressCard
        colors={colors} goal={goalState.goal} currentBest={goalState.currentBest}
        progressPct={goalState.progressPct} isBodyweight={bw} unit={unit}
        onEdit={onOpenSheet}
        onDelete={() => goalState.goal && goalState.deleteGoal(goalState.goal.id)}
      />
    );
  }
  return (
    <Button variant="outline" onPress={onOpenSheet} label={t({ id: "app.exercise.id.set-goal", message: "Set Goal" })}
      style={{ alignSelf: "flex-start", marginTop: 8, marginBottom: 8 }}
      accessibilityLabel={t({ id: "app.exercise.id.set-goal-a11y", message: "Set a strength goal for this exercise" })} />
  );
}

export default function ExerciseDetail() {
  const colors = useThemeColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const layout = useLayout();
  const profileGender = useProfileGender();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast: showToast } = useToast();
  const d = useExerciseDetail(id);
  const strengthLevel = useStrengthLevel(d.exercise?.name, d.records?.est_1rm ?? null, d.unit);
  const goalSheet = useBottomSheet();
  const goalState = useStrengthGoal(id, d.bw);
  const progression = useProgressionChain(id);
  // BLD-1122: plateau detection for exercise detail screen
  const plateauStatus = usePlateauStatus(id);
  // BLD-2701: active intensity display mode (RPE vs RIR) for history badges
  const intensityMode = useIntensityMode();

  // BLD-1122 AC3: form-clip recording sheet triggered by plateau form_check CTA
  const [formClipSetId, setFormClipSetId] = useState<string | null>(null);
  const [formClipSetNumber, setFormClipSetNumber] = useState<number>(1);
  const handleNavigateToFormClip = useCallback(async () => {
    if (!id || Platform.OS === "web") return;
    try {
      const freeSet = await getMostRecentCompletedSetForExercise(id, { mustHaveNoClip: true });
      const anySet = freeSet ?? await getMostRecentCompletedSetForExercise(id);
      if (anySet) {
        setFormClipSetNumber(anySet.set_number);
        setFormClipSetId(anySet.id);
      } else {
        showToast({ title: t({ id: "app.exercise.id.no-completed-sets", message: "No completed sets yet — record a set first" }) });
      }
    } catch {
      // non-fatal
    }
  }, [id, showToast]);

  const edit = useCallback(() => { if (id) router.push(`/exercise/edit/${id}`); }, [id, router]);

  const [trackUnilateral, setTrackUnilateral] = useState(d.exercise?.track_unilateral ?? false);
  const [unilateralInsight, setUnilateralInsight] = useState<{
    left: { weight: number | null; reps: number | null } | null;
    right: { weight: number | null; reps: number | null } | null;
  } | null>(null);

  useEffect(() => {
    if (d.exercise) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrackUnilateral(d.exercise.track_unilateral ?? false);
    }
  }, [d.exercise]);

  useEffect(() => {
    if (id && trackUnilateral) {
      getLatestUnilateralInsight(id).then(setUnilateralInsight);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnilateralInsight(null);
    }
  }, [id, trackUnilateral]);

  const handleTrackUnilateralChange = useCallback(async (value: boolean) => {
    if (!id) return;
    setTrackUnilateral(value);
    try {
      await updateTrackUnilateral(id, value);
      bumpQueryVersion("exercises");
      bumpQueryVersion("session");
      showToast({ description: t({ id: "app.exercise.id.track-updated", message: "Track left/right separately updated" }) });
    } catch {
      showToast({ description: t({ id: "app.exercise.id.track-update-error", message: "Failed to update unilateral tracking" }) });
      setTrackUnilateral(!value);
    }
  }, [id, showToast]);

  // BLD-1028: local draft for off-session pinned note edit.
  const [pinnedNoteDraft, setPinnedNoteDraft] = useState<string | undefined>(undefined);
  const pinnedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedPendingRef = useRef<{ exerciseId: string; text: string } | null>(null);
  const pinnedWriteChainRef = useRef<Promise<void>>(Promise.resolve());

  const enqueuePinnedWrite = useCallback((exerciseId: string, text: string) => {
    pinnedWriteChainRef.current = pinnedWriteChainRef.current
      .catch(() => {})
      .then(() => updateExerciseNote(exerciseId, text))
      .then(() => bumpQueryVersion("exercises"));
    return pinnedWriteChainRef.current;
  }, []);

  const flushPinnedNote = useCallback(async () => {
    if (pinnedDebounceRef.current) { clearTimeout(pinnedDebounceRef.current); pinnedDebounceRef.current = null; }
    const pending = pinnedPendingRef.current;
    pinnedPendingRef.current = null;
    if (pending) {
      await enqueuePinnedWrite(pending.exerciseId, pending.text);
    }
  }, [enqueuePinnedWrite]);

  // Debounced auto-save as the user types (600ms) — matches in-session behaviour.
  const handlePinnedDraftChange = useCallback((exerciseId: string, text: string) => {
    setPinnedNoteDraft(text);
    pinnedPendingRef.current = { exerciseId, text };
    if (pinnedDebounceRef.current) clearTimeout(pinnedDebounceRef.current);
    pinnedDebounceRef.current = setTimeout(() => {
      pinnedDebounceRef.current = null;
      const p = pinnedPendingRef.current;
      pinnedPendingRef.current = null;
      if (p) { void enqueuePinnedWrite(p.exerciseId, p.text); }
    }, 600);
  }, [enqueuePinnedWrite]);

  const savePinnedNote = useCallback(async (exerciseId: string, text: string) => {
    if (pinnedDebounceRef.current) { clearTimeout(pinnedDebounceRef.current); pinnedDebounceRef.current = null; }
    pinnedPendingRef.current = null;
    await enqueuePinnedWrite(exerciseId, text);
    setPinnedNoteDraft(undefined);
  }, [enqueuePinnedWrite]);

  // Flush any pending debounced write on unmount (e.g. user taps back mid-type).
  useEffect(() => {
    return () => { void flushPinnedNote(); };
  }, [flushPinnedNote]);
  const remove = useCallback(async () => {
    if (!id || !d.exercise) return;
    const templates = await getTemplatesUsingExercise(id);
    const msg = templates.length > 0
      ? t({ id: "app.exercise.id.delete-used", message: `Delete ${d.exercise.name}? This exercise is used in ${templates.length} template(s). It will be removed from those templates.` })
      : t({ id: "app.exercise.id.delete-unused", message: `Delete ${d.exercise.name}? This exercise will be removed from the library.` });
    Alert.alert(t({ id: "app.exercise.id.delete-title", message: "Delete Exercise" }), msg, [
      { text: t({ id: "app.exercise.id.cancel", message: "Cancel" }), style: "cancel" },
      { text: t({ id: "app.exercise.id.delete", message: "Delete" }), style: "destructive", onPress: async () => {
        try { await softDeleteCustomExercise(id); bumpQueryVersion("exercises"); bumpQueryVersion("session"); bumpQueryVersion("home"); showToast({ description: t({ id: "app.exercise.id.deleted", message: "Exercise deleted" }) }); setTimeout(() => router.back(), 400); }
        catch { showToast({ description: t({ id: "app.exercise.id.delete-error", message: "Failed to delete exercise" }) }); }
      }},
    ]);
  }, [id, d.exercise, router, showToast]);

  if (!d.exercise) {
    return (<><Stack.Screen options={{ title: t({ id: "app.exercise.id.exercise", message: "Exercise" }) }} /><View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.exercise.id.loading", message: "Loading..." })}</Text></View></>);
  }

  const exercise = d.exercise;
  const steps = exercise.instructions.split("\n").map((s) => s.trim()).filter(Boolean);

  // BLD-541: renderHeader aggregates many optional detail rows; +1 branch
  // for AC-23 bodyweight notice tips complexity over 15. Splitting out
  // subcomponents is out-of-scope for this PR.
  // eslint-disable-next-line complexity
  const renderHeader = () => (
    <View style={styles.content}>
       {exercise.is_custom && <Chip compact style={StyleSheet.flatten([styles.badge, { backgroundColor: colors.tertiaryContainer }])}>{t({ id: "app.exercise.id.custom", message: "Custom" })}</Chip>}
      <View style={styles.row}>
         <Chip compact style={{ backgroundColor: colors.primaryContainer }}>{categoryLabel(exercise.category)}</Chip>
         <Chip compact style={StyleSheet.flatten([styles.difficultyChip, { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] }])}>{difficultyLabel(exercise.difficulty)}</Chip>
      </View>

      {exercise.attachment && (
          <View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>{t({ id: "app.exercise.id.attachment", message: "Attachment" })}</Text>
           <Text variant="body" style={[styles.value, { color: colors.onSurface }]} accessibilityLabel={i18n._({ id: "app.exercise.id.attachment-a11y-localized", message: "Attachment: {attachment}", values: { attachment: attachmentLabel(exercise.attachment) } })}>{attachmentLabel(exercise.attachment)}</Text></View>
      )}

      {layout.atLeastMedium ? (
        <View style={styles.infoRow}>
            <View style={{ flex: 1 }}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.exercise.id.muscles-involved", message: "Muscles Involved" })}</Text>
            <MuscleMap primary={exercise.primary_muscles} secondary={exercise.secondary_muscles} width={Math.min(screenWidth * 0.45, 400)} gender={profileGender} /></View>
          <View style={{ flex: 1 }}>
            {steps.length > 0 && <ExerciseIllustrationCards exercise={exercise} />}
              {steps.length > 0 && (<View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.exercise.id.instructions", message: "Instructions" })}</Text>
            {steps.map((step, i) => <Text key={i} variant="body" style={[styles.step, { color: colors.onSurface }]}>{step}</Text>)}</View>)}
          </View>
        </View>
      ) : (
        <>
            <View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.exercise.id.muscles-involved-mobile", message: "Muscles Involved" })}</Text>
            <MuscleMap primary={exercise.primary_muscles} secondary={exercise.secondary_muscles} width={screenWidth - 32} gender={profileGender} /></View>
          {steps.length > 0 && <ExerciseIllustrationCards exercise={exercise} />}
            {steps.length > 0 && (<View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.exercise.id.instructions-mobile", message: "Instructions" })}</Text>
            {steps.map((step, i) => <Text key={i} variant="body" style={[styles.step, { color: colors.onSurface }]}>{step}</Text>)}</View>)}
        </>
      )}

      {/* BLD-541 AC-23: v1 user-trust microcopy on bodyweight exercise detail. */}
      {exercise.equipment === 'bodyweight' && <BodyweightModifierNotice colors={colors} />}

      {/* BLD-913: Bodyweight exercise progression path */}
      {!progression.loading && progression.chain.length > 0 && id && (
        <ProgressionPathCard
          exerciseId={id}
          chain={progression.chain}
          suggestion={progression.suggestion}
        />
      )}

      {/* BLD-1028: Pinned per-exercise note — off-session edit surface */}
      {id && (
        <View style={styles.section}>
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.exercise.id.pinned-note", message: "📌 Pinned Note for this exercise" })}</Text>
          {pinnedNoteDraft !== undefined ? (
            <PinnedExerciseNoteEditor
              exerciseId={id}
              exerciseName={exercise.name}
              value={pinnedNoteDraft}
              onDraftChange={handlePinnedDraftChange}
              onSave={(exId, text) => { void savePinnedNote(exId, text); }}
            />
          ) : exercise.notes ? (
            <Pressable
              onPress={() => setPinnedNoteDraft(exercise.notes ?? "")}
              accessibilityLabel={t({ id: "app.exercise.id.edit-pinned-note-a11y", message: `Edit pinned note for ${exercise.name}` })}
              accessibilityRole="button"
            >
              <Text style={[styles.pinnedNoteText, { color: colors.onSurface, borderColor: colors.outlineVariant }]}>
                {exercise.notes}
              </Text>
            </Pressable>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onPress={() => setPinnedNoteDraft("")}
              accessibilityLabel={t({ id: "app.exercise.id.add-pinned-note-a11y", message: `Add pinned note for ${exercise.name}` })}
               label={t({ id: "app.exercise.id.add-pinned-note", message: "+ Add pinned note" })}
              style={{ alignSelf: "flex-start", marginTop: 4 }}
            />
          )}
        </View>
      )}

      {/* BLD-1158: Per-exercise default tempo — primary discoverability path */}
      {id && (
        <View style={styles.section}>
          <ExerciseDefaultTempoField
            exerciseId={id}
            currentTempo={exercise.default_tempo}
            onSave={async (canonical) => {
              await setDefaultTempo(id, canonical);
              bumpQueryVersion("exercises");
            }}
          />
        </View>
      )}

      {id && (
        <View style={styles.section}>
          <Switch
             label={t({ id: "app.exercise.id.track-unilateral", message: "Track left/right separately" })}
            value={trackUnilateral}
            onValueChange={handleTrackUnilateralChange}
             accessibilityLabel={t({ id: "app.exercise.id.track-unilateral-a11y", message: "Track left and right separately" })}
          />
        </View>
      )}

      {unilateralInsight && unilateralInsight.left && unilateralInsight.right && (() => {
        const leftVol = (unilateralInsight.left.weight ?? 0) * (unilateralInsight.left.reps ?? 0);
        const rightVol = (unilateralInsight.right.weight ?? 0) * (unilateralInsight.right.reps ?? 0);
        const maxVol = Math.max(leftVol, rightVol);
        const diff = maxVol > 0 ? Math.round((Math.abs(leftVol - rightVol) / maxVol) * 100) : 0;
        return (
          <View style={styles.section} accessibilityLabel={t({ id: "app.exercise.id.unilateral-difference-a11y", message: `Left and right differ by ${diff} percent` })}>
            <Text variant="body" style={{ color: colors.onSurface }}>
              {t({ id: "app.exercise.id.unilateral-difference", message: `Left ${toDisplay(unilateralInsight.left.weight ?? 0, d.unit)} ${d.unit}x${unilateralInsight.left.reps ?? 0} · Right ${toDisplay(unilateralInsight.right.weight ?? 0, d.unit)} ${d.unit}x${unilateralInsight.right.reps ?? 0} · Difference ${diff}%` })}
            </Text>
          </View>
        );
      })()}

      {/* Goal Progress Card — above Records/Chart for discoverability */}
      <GoalSection goalState={goalState} colors={colors} bw={d.bw} unit={d.unit} onOpenSheet={goalSheet.open} />

      <FlowContainer gap={16}>
        {/* BLD-1122: plateau card — shown above records when stalled or regressing and not dismissed */}
        {plateauStatus.result != null && plateauStatus.result.classification !== "progressing" && plateauStatus.result.classification !== "maintaining" && !plateauStatus.dismissedUntil && (
          <PlateauStatusCard
            result={plateauStatus.result}
            exerciseName={exercise?.name ?? ""}
            unit={d.unit}
            onDismiss={plateauStatus.onDismiss}
            onQueuePending={plateauStatus.onQueuePending}
            onNavigateToFormClip={handleNavigateToFormClip}
          />
        )}
        <ExerciseRecordsCard colors={colors} records={d.records} recordsLoading={d.recordsLoading} recordsError={d.recordsError}
          best={d.best} bw={d.bw} unit={d.unit} exerciseId={id}
          loadRecords={(eid) => d.loadRecords(eid, d.variantScope)}
          variantFilterActive={d.variantScope.attachment !== undefined || d.variantScope.mount_position !== undefined}
          style={layout.atLeastMedium ? { ...flowCardStyle, maxWidth: 560 } : undefined} />
        <ExerciseChartCard colors={colors} bw={d.bw} unit={d.unit} chart={d.chart} chart1RM={d.chart1RM}
          activeChart={d.activeChart} chartMode={d.chartMode} setChartMode={d.setChartMode}
          chartLoading={d.chartLoading} chartError={d.chartError} exerciseId={id} exerciseName={exercise.name} loadChart={(eid) => d.loadChart(eid, d.variantScope)}
          style={layout.atLeastMedium ? { ...flowCardStyle, maxWidth: 560 } : undefined} />
      </FlowContainer>

      {/* BLD-788: cable variant analytics filter — only renders for cable exercises. */}
      {isCableExercise(exercise) && (
        <ExerciseVariantFilter
          scope={d.variantScope}
          onChange={d.setVariantScope}
          variantTotal={d.variantTotal}
        />
      )}

      {strengthLevel && (
        <StrengthLevelBadge
          colors={colors}
          level={strengthLevel.level}
          nextLevel={strengthLevel.nextLevel}
          nextThresholdKg={strengthLevel.nextThresholdKg}
          unit={d.unit}
          style={{ marginTop: 8 }}
        />
      )}

       <Text variant="title" style={{ color: colors.onSurface, marginTop: 8, marginBottom: 8 }}>{t({ id: "app.exercise.id.session-history", message: "Session History" })}</Text>
      {d.historyLoading ? <ActivityIndicator style={styles.loader} /> : d.historyError ? (
         <View style={styles.errorBox}><Text style={{ color: colors.error }}>{t({ id: "app.exercise.id.history-error", message: "Failed to load history" })}</Text>
           <Button variant="ghost" onPress={() => id && d.loadHistory(id)} label={t({ id: "app.exercise.id.retry", message: "Retry" })} /></View>
       ) : d.history.length === 0 ? <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>{t({ id: "app.exercise.id.no-history", message: "No sessions recorded for this exercise" })}</Text> : null}
    </View>
  );

  const renderItem = ({ item }: { item: ExerciseSession }) => {
    // BLD-2701: a11y label uses active intensity mode (RPE or RIR), not hardcoded "avg RPE".
    const intensityLabel = item.avg_rpe != null
      ? t({ id: "app.exercise.id.avg-intensity", message: `, avg ${formatIntensity(item.avg_rpe, intensityMode)}` })
      : "";
    const label = d.bw
      ? t({ id: "app.exercise.id.history-bodyweight-a11y", message: `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max reps ${item.max_reps}${intensityLabel}` })
      : t({ id: "app.exercise.id.history-weighted-a11y", message: `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max weight ${toDisplay(item.max_weight, d.unit)} ${d.unit}${intensityLabel}` });
    return (
      <Pressable onPress={() => router.push(`/session/detail/${item.session_id}`)} accessibilityLabel={label} accessibilityRole="button"
        style={[styles.historyRow, { borderBottomColor: colors.outlineVariant }]}>
        <View style={styles.historyLeft}>
          <Text variant="body" style={{ color: colors.onSurface }}>{formatDateLong(item.started_at)}</Text>
           <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.exercise.id.history-row", message: `${item.session_name} · ${item.set_count} sets · ${item.total_reps} reps` })}</Text>
        </View>
        <View style={styles.historyRight}>
           <Text variant="title" style={{ color: colors.primary }}>{d.bw ? t({ id: "app.exercise.id.history-max-reps", message: `${item.max_reps} reps` }) : t({ id: "app.exercise.id.history-max-weight", message: `${toDisplay(item.max_weight, d.unit)} ${d.unit}` })}</Text>
          {item.avg_rpe != null && (
            <View style={[styles.rpeBadge, { backgroundColor: rpeColor(item.avg_rpe) }]}>
              {/* BLD-2701: render via formatIntensity so mode flip (RPE ↔ RIR) is reflected.
                  Color stays keyed on the stored RPE value — rpeColor/rpeText are NOT changed. */}
              <Text style={{ color: rpeText(item.avg_rpe), fontSize: fontSizes.xs, fontWeight: "600" }}>
                {formatIntensity(item.avg_rpe, intensityMode)}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderFooter = () => {
    if (d.loadingMore) return <ActivityIndicator style={{ padding: 16 }} />;
     if (!d.hasMore && d.history.length >= MAX_ITEMS) return <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 16 }}>{i18n._({ id: "app.exercise.id.showingLastSessions", message: "Showing last {count} sessions", values: { count: d.history.length } })}</Text>;
    return null;
  };

  return (
    <>
      <Stack.Screen options={{ title: exercise.name, headerRight: exercise.is_custom ? () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={edit} accessibilityLabel={t({ id: "app.exercise.id.edit-a11y", message: "Edit exercise" })} hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="pencil" size={22} color={colors.onSurface} /></TouchableOpacity>
          <TouchableOpacity onPress={remove} accessibilityLabel={t({ id: "app.exercise.id.delete-a11y", message: "Delete exercise" })} hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="delete" size={22} color={colors.onSurface} /></TouchableOpacity>
        </View>
      ) : undefined }} />
      <FlatList style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 100 }}
        data={d.historyLoading || d.historyError || d.history.length === 0 ? [] : d.history}
        keyExtractor={(item) => item.session_id} renderItem={renderItem} ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        onEndReached={d.loadMore} onEndReachedThreshold={0.3} />
      {id && (
        <GoalSetForm
          isVisible={goalSheet.isVisible}
          onClose={goalSheet.close}
          exerciseId={id}
          isBodyweight={d.bw}
          unit={d.unit}
          existingGoal={goalState.goal}
          onCreate={goalState.createGoal}
          onUpdate={goalState.updateGoal}
        />
      )}
      {/* BLD-1122 AC3: form-clip recording sheet for plateau form_check CTA */}
      {id != null && formClipSetId != null && (
        <FormVideoSheet
          isVisible={formClipSetId != null}
          setId={formClipSetId}
          exerciseId={id}
          setNumber={formClipSetNumber}
          onClose={() => setFormClipSetId(null)}
          onClipSaved={() => setFormClipSetId(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16 },
  headerActions: { flexDirection: "row" },
  badge: { alignSelf: "flex-start", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, marginBottom: 16 },
  section: { marginBottom: 20 },
  value: { marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  muscleChip: { marginBottom: 2 },
  difficultyChip: { borderRadius: 16 },
  step: { marginTop: 6, lineHeight: 22 },
  infoRow: { flexDirection: "row", gap: 24, marginBottom: 20 },
  loader: { paddingVertical: 24 },
  errorBox: { alignItems: "center", paddingVertical: 12 },
  historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  historyLeft: { flex: 1 },
  historyRight: { marginLeft: 12, alignItems: "flex-end" },
  rpeBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  pinnedNoteText: { marginTop: 6, padding: 10, borderWidth: 1, borderRadius: 8, lineHeight: 20, fontSize: fontSizes.base },
});
