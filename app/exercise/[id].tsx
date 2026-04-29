import { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import StrengthLevelBadge from "@/components/exercise/StrengthLevelBadge";
import { useStrengthLevel } from "@/hooks/useStrengthLevel";
import { useStrengthGoal } from "@/hooks/useStrengthGoals";
import { useBottomSheet } from "@/components/ui/bottom-sheet";
import GoalProgressCard from "@/components/exercise/GoalProgressCard";
import GoalSetForm from "@/components/exercise/GoalSetForm";
import { BodyweightModifierNotice } from "@/components/exercises/BodyweightModifierNotice";
import { fontSizes } from "@/constants/design-tokens";

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

  const edit = useCallback(() => { if (id) router.push(`/exercise/edit/${id}`); }, [id, router]);
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

      {/* Goal Progress Card — above Records/Chart for discoverability */}
      <GoalSection goalState={goalState} colors={colors} bw={d.bw} unit={d.unit} onOpenSheet={goalSheet.open} />

      <FlowContainer gap={16}>
        <ExerciseRecordsCard colors={colors} records={d.records} recordsLoading={d.recordsLoading} recordsError={d.recordsError}
          best={d.best} bw={d.bw} unit={d.unit} exerciseId={id} loadRecords={d.loadRecords}
          style={layout.atLeastMedium ? { ...flowCardStyle, maxWidth: 560 } : undefined} />
        <ExerciseChartCard colors={colors} bw={d.bw} unit={d.unit} chart={d.chart} chart1RM={d.chart1RM}
          activeChart={d.activeChart} chartMode={d.chartMode} setChartMode={d.setChartMode}
          chartLoading={d.chartLoading} chartError={d.chartError} exerciseId={id} exerciseName={exercise.name} loadChart={d.loadChart}
          style={layout.atLeastMedium ? { ...flowCardStyle, maxWidth: 560 } : undefined} />
      </FlowContainer>

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
    const rpeLabel = item.avg_rpe != null ? `, avg RPE ${Math.round(item.avg_rpe * 10) / 10}` : "";
    const label = d.bw
      ? `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max reps ${item.max_reps}${rpeLabel}`
      : `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max weight ${toDisplay(item.max_weight, d.unit)} ${d.unit}${rpeLabel}`;
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
              <Text style={{ color: rpeText(item.avg_rpe), fontSize: fontSizes.xs, fontWeight: "600" }}>RPE {Math.round(item.avg_rpe * 10) / 10}</Text>
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
});
