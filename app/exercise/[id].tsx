import { useCallback, useState } from "react";
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
import { useToast } from "@/components/ui/bna-toast";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  softDeleteCustomExercise,
  getTemplatesUsingExercise,
  updateExerciseNote,
  setDefaultTempo,
  type ExerciseSession,
} from "../../lib/db";
import { bumpQueryVersion } from "../../lib/query";
import { CATEGORY_LABELS, ATTACHMENT_LABELS } from "../../lib/types";
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
import { getMostRecentCompletedSetForExercise } from "@/lib/db/session-sets";
import { isCableExercise } from "@/lib/cable-variant";
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
    <Button variant="outline" onPress={onOpenSheet} label="Set Goal"
      style={{ alignSelf: "flex-start", marginTop: 8, marginBottom: 8 }}
      accessibilityLabel="Set a strength goal for this exercise" />
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
        showToast({ title: "No completed sets yet — record a set first" });
      }
    } catch {
      // non-fatal
    }
  }, [id, showToast]);

  const edit = useCallback(() => { if (id) router.push(`/exercise/edit/${id}`); }, [id, router]);
  // BLD-1028: local draft for off-session pinned note edit.
  const [pinnedNoteDraft, setPinnedNoteDraft] = useState<string | undefined>(undefined);
  const savePinnedNote = useCallback(async (exerciseId: string, text: string) => {
    await updateExerciseNote(exerciseId, text);
    setPinnedNoteDraft(undefined);
    // Refresh exercise so the read surface reflects the saved note.
    bumpQueryVersion("exercises");
  }, []);
  const remove = useCallback(async () => {
    if (!id || !d.exercise) return;
    const templates = await getTemplatesUsingExercise(id);
    const msg = templates.length > 0
      ? `Delete ${d.exercise.name}? This exercise is used in ${templates.length} template(s). It will be removed from those templates.`
      : `Delete ${d.exercise.name}? This exercise will be removed from the library.`;
    Alert.alert("Delete Exercise", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await softDeleteCustomExercise(id); bumpQueryVersion("exercises"); bumpQueryVersion("session"); bumpQueryVersion("home"); showToast({ description: "Exercise deleted" }); setTimeout(() => router.back(), 400); }
        catch { showToast({ description: "Failed to delete exercise" }); }
      }},
    ]);
  }, [id, d.exercise, router, showToast]);

  if (!d.exercise) {
    return (<><Stack.Screen options={{ title: "Exercise" }} /><View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.onSurfaceVariant }}>Loading...</Text></View></>);
  }

  const exercise = d.exercise;
  const steps = exercise.instructions.split("\n").map((s) => s.trim()).filter(Boolean);

  // BLD-541: renderHeader aggregates many optional detail rows; +1 branch
  // for AC-23 bodyweight notice tips complexity over 15. Splitting out
  // subcomponents is out-of-scope for this PR.
  // eslint-disable-next-line complexity
  const renderHeader = () => (
    <View style={styles.content}>
      {exercise.is_custom && <Chip compact style={StyleSheet.flatten([styles.badge, { backgroundColor: colors.tertiaryContainer }])}>Custom</Chip>}
      <View style={styles.row}>
        <Chip compact style={{ backgroundColor: colors.primaryContainer }}>{CATEGORY_LABELS[exercise.category]}</Chip>
        <Chip compact style={StyleSheet.flatten([styles.difficultyChip, { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] }])}>{exercise.difficulty}</Chip>
      </View>

      {exercise.attachment && (
        <View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>Attachment</Text>
          <Text variant="body" style={[styles.value, { color: colors.onSurface }]} accessibilityLabel={`Attachment: ${ATTACHMENT_LABELS[exercise.attachment]}`}>{ATTACHMENT_LABELS[exercise.attachment]}</Text></View>
      )}

      {layout.atLeastMedium ? (
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>Muscles Involved</Text>
            <MuscleMap primary={exercise.primary_muscles} secondary={exercise.secondary_muscles} width={Math.min(screenWidth * 0.45, 400)} gender={profileGender} /></View>
          <View style={{ flex: 1 }}>{steps.length > 0 && (<View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>Instructions</Text>
            {steps.map((step, i) => <Text key={i} variant="body" style={[styles.step, { color: colors.onSurface }]}>{step}</Text>)}</View>)}</View>
        </View>
      ) : (
        <>
          <View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>Muscles Involved</Text>
            <MuscleMap primary={exercise.primary_muscles} secondary={exercise.secondary_muscles} width={screenWidth - 32} gender={profileGender} /></View>
          {steps.length > 0 && (<View style={styles.section}><Text variant="body" style={{ color: colors.onSurfaceVariant }}>Instructions</Text>
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
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>📌 Pinned Note for this exercise</Text>
          {pinnedNoteDraft !== undefined ? (
            <PinnedExerciseNoteEditor
              exerciseId={id}
              exerciseName={exercise.name}
              value={pinnedNoteDraft}
              onDraftChange={(_exId, text) => setPinnedNoteDraft(text)}
              onSave={(exId, text) => { void savePinnedNote(exId, text); }}
            />
          ) : exercise.notes ? (
            <Pressable
              onPress={() => setPinnedNoteDraft(exercise.notes ?? "")}
              accessibilityLabel={`Edit pinned note for ${exercise.name}`}
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
              accessibilityLabel={`Add pinned note for ${exercise.name}`}
              label="+ Add pinned note"
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

      <Text variant="title" style={{ color: colors.onSurface, marginTop: 8, marginBottom: 8 }}>Session History</Text>
      {d.historyLoading ? <ActivityIndicator style={styles.loader} /> : d.historyError ? (
        <View style={styles.errorBox}><Text style={{ color: colors.error }}>Failed to load history</Text>
          <Button variant="ghost" onPress={() => id && d.loadHistory(id)} label="Retry" /></View>
      ) : d.history.length === 0 ? <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>No sessions recorded for this exercise</Text> : null}
    </View>
  );

  const renderItem = ({ item }: { item: ExerciseSession }) => {
    // BLD-2701: a11y label uses active intensity mode (RPE or RIR), not hardcoded "avg RPE".
    const intensityLabel = item.avg_rpe != null
      ? `, avg ${formatIntensity(item.avg_rpe, intensityMode)}`
      : "";
    const label = d.bw
      ? `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max reps ${item.max_reps}${intensityLabel}`
      : `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max weight ${toDisplay(item.max_weight, d.unit)} ${d.unit}${intensityLabel}`;
    return (
      <Pressable onPress={() => router.push(`/session/detail/${item.session_id}`)} accessibilityLabel={label} accessibilityRole="button"
        style={[styles.historyRow, { borderBottomColor: colors.outlineVariant }]}>
        <View style={styles.historyLeft}>
          <Text variant="body" style={{ color: colors.onSurface }}>{formatDateLong(item.started_at)}</Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{item.session_name} · {item.set_count} sets · {item.total_reps} reps</Text>
        </View>
        <View style={styles.historyRight}>
          <Text variant="title" style={{ color: colors.primary }}>{d.bw ? `${item.max_reps} reps` : `${toDisplay(item.max_weight, d.unit)} ${d.unit}`}</Text>
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
    if (!d.hasMore && d.history.length >= MAX_ITEMS) return <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 16 }}>Showing last {d.history.length} sessions</Text>;
    return null;
  };

  return (
    <>
      <Stack.Screen options={{ title: exercise.name, headerRight: exercise.is_custom ? () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={edit} accessibilityLabel="Edit exercise" hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="pencil" size={22} color={colors.onSurface} /></TouchableOpacity>
          <TouchableOpacity onPress={remove} accessibilityLabel="Delete exercise" hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="delete" size={22} color={colors.onSurface} /></TouchableOpacity>
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
