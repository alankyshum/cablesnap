import { StyleSheet, View, FlatList } from "react-native";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import ExercisePickerSheet from "@/components/ExercisePickerSheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useLayout } from "@/lib/layout";
import { useSessionDetail, type ExerciseGroup } from "@/hooks/useSessionDetail";
import { useSessionEdit } from "@/hooks/useSessionEdit";
import { useSessionShareData } from "@/hooks/useSessionShareData";
import { SummaryCard } from "@/components/session/detail/SummaryCard";
import { RatingNotesCard } from "@/components/session/detail/RatingNotesCard";
import { ExerciseGroupRow } from "@/components/session/detail/ExerciseGroupRow";
import { SessionDetailHeaderActions } from "@/components/session/detail/SessionDetailHeaderActions";
import { PRsCard } from "@/components/session/detail/PRsCard";
import { EditableExerciseGroupRow } from "@/components/session/detail/EditableExerciseGroupRow";
import { TemplateModal } from "@/components/session/detail/TemplateModal";
import { EditedPill } from "@/components/session/EditedPill";
import { SessionDetailShareOverlay } from "@/components/session/detail/SessionDetailShareOverlay";

export default function SessionDetail() {
  const layout = useLayout();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    session, groups, prs, rating, notesText, setNotesText,
    notesExpanded, setNotesExpanded, templateModalVisible, templateName,
    setTemplateName, completedSetCount, saving, linkIds, palette,
    volume, completedSets, handleRatingChange, handleNotesSave,
    handleSaveAsTemplate, handleRepeatWorkout, openTemplateModal,
    closeTemplateModal, colors, refresh,
  } = useSessionDetail(id);

  const edit = useSessionEdit({
    sessionId: id,
    sessionStartedAt: session?.started_at ?? null,
    groups,
    refresh,
    onSessionDeleted: () => router.back(),
  });

  // ── Share state (BLD-891) ──
  const share = useSessionShareData(session, groups, prs, completedSetCount);
  const renderItem = ({ item: group, index }: { item: ExerciseGroup | (typeof edit.draft)[number]; index: number }) => {
    if (edit.editing) {
      const dg = group as (typeof edit.draft)[number];
      return (
        <EditableExerciseGroupRow
          exerciseName={dg.name}
          sets={dg.sets}
          onChangeWeight={(setIdx, v) => edit.updateSet(index, setIdx, { weight: v })}
          onChangeReps={(setIdx, v) => edit.updateSet(index, setIdx, { reps: v })}
          onChangeRpe={(setIdx, v) => edit.updateSet(index, setIdx, { rpe: v })}
          onToggleCompleted={(setIdx, v) => edit.updateSet(index, setIdx, { completed: v })}
          onRemoveSet={(setIdx) => edit.removeSet(index, setIdx)}
          onAddSet={() => edit.addSet(index)}
          onRemoveExercise={() => edit.removeExercise(index)}
        />
      );
    }
    return <ExerciseGroupRow group={group as ExerciseGroup} groups={groups} linkIds={linkIds} palette={palette} colors={colors} />;
  };
  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Workout" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const showReadOnlyExtras = !edit.editing && !!session.completed_at;
  const showPRs = !edit.editing && prs.length > 0;
  const data = edit.editing ? edit.draft : groups;
  return (
    <>
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: () => (
            <SessionDetailHeaderActions
              editing={edit.editing}
              dirty={edit.dirty}
              saving={edit.saving}
              showEditButton={!!session.completed_at}
              completedSetCount={completedSetCount}
              onCancel={edit.cancel}
              onSave={() => void edit.save()}
              onEnterEdit={edit.enterEdit}
              onOpenTemplate={openTemplateModal}
              onShare={share.handleShareButtonPress}
              colors={colors}
            />
          ),
        }}
      />
      <FlatList<ExerciseGroup | (typeof edit.draft)[number]>
        data={data}
        keyExtractor={(group) =>
          edit.editing
            ? (group as (typeof edit.draft)[number]).groupKey
            : (group as ExerciseGroup).exercise_id
        }
        keyboardShouldPersistTaps="handled"
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        ListHeaderComponent={
          <>
            {session.edited_at != null && (
              <View style={{ marginBottom: 8 }}>
                <EditedPill editedAt={session.edited_at} colors={colors} />
              </View>
            )}
            <SummaryCard session={session} completedSets={completedSets()} volume={volume()} colors={colors} />

            {showReadOnlyExtras && (
              <RatingNotesCard
                rating={rating}
                onRatingChange={handleRatingChange}
                notesText={notesText}
                onNotesChange={setNotesText}
                notesExpanded={notesExpanded}
                onToggleNotes={() => setNotesExpanded(!notesExpanded)}
                onNotesSave={handleNotesSave}
                colors={colors}
              />
            )}

            {showPRs && <PRsCard prs={prs} colors={colors} />}

            {showReadOnlyExtras && (
              <Button variant="outline" onPress={handleRepeatWorkout} disabled={completedSetCount === 0} style={styles.repeatButton} accessibilityLabel="Repeat workout" accessibilityHint="Start a new session with the same exercises and weights" accessibilityRole="button" label="Repeat Workout" />
            )}
          </>
        }
        renderItem={renderItem}
        ListFooterComponent={
          <>
            {edit.editing && edit.isEmpty && (
              <Button
                variant="outline"
                onPress={edit.deleteWholeSession}
                style={styles.repeatButton}
                accessibilityLabel="Delete workout"
                label="Delete workout"
              />
            )}
            {edit.editing && (
              <Button
                variant="outline"
                onPress={() => edit.setPickerVisible(true)}
                style={styles.repeatButton}
                accessibilityLabel="Add exercise"
                label="+ Add exercise"
              />
            )}
            <TemplateModal
              visible={templateModalVisible}
              templateName={templateName}
              onNameChange={setTemplateName}
              onSave={handleSaveAsTemplate}
              onClose={closeTemplateModal}
              saving={saving}
              colors={colors}
            />
            <ExercisePickerSheet
              visible={edit.pickerVisible}
              onDismiss={() => edit.setPickerVisible(false)}
              onPick={(ex) => edit.addExercise(ex)}
            />
          </>
        }
      />
      <SessionDetailShareOverlay
        shareSheetRef={share.shareSheetRef}
        onShareText={share.handleShareText}
        imageDisabled={completedSetCount === 0}
        sessionName={session.name ?? "Workout"}
        shareCardDate={share.shareCardDate}
        duration={share.duration}
        completedSets={completedSets()}
        volumeDisplay={share.volumeDisplay.toLocaleString()}
        unit={share.unit}
        rating={rating}
        shareCardPrs={share.shareCardPrs}
        shareCardExercises={share.shareCardExercises}
        colors={colors}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  repeatButton: { marginBottom: 20 },
});
