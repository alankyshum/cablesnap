import { StyleSheet, View, FlatList } from "react-native";
import { useState, useEffect } from "react";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useLayout } from "@/lib/layout";
import { useSessionDetail, type ExerciseGroup } from "@/hooks/useSessionDetail";
import { useSessionEdit } from "@/hooks/useSessionEdit";
import { useSessionShareData } from "@/hooks/useSessionShareData";
import { SummaryCard } from "@/components/session/detail/SummaryCard";
import { RatingNotesCard } from "@/components/session/detail/RatingNotesCard";
import { SessionDetailHeaderActions } from "@/components/session/detail/SessionDetailHeaderActions";
import { PRsCard } from "@/components/session/detail/PRsCard";
import { EditedPill } from "@/components/session/EditedPill";
import { SessionDetailShareOverlay } from "@/components/session/detail/SessionDetailShareOverlay";
import { isStravaConnected } from "@/lib/strava";
import { SessionDetailRow } from "@/components/session/detail/SessionDetailRow";
import { SessionDetailFooter } from "@/components/session/detail/SessionDetailFooter";

export default function SessionDetail() {
  const layout = useLayout();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    session, groups, prs, rating, notesText, setNotesText,
    templateModalVisible, templateName,
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

  const [stravaConnected, setStravaConnected] = useState(false);
  useEffect(() => {
    isStravaConnected().then(setStravaConnected).catch(() => {});
  }, []);

  // ── Share state (BLD-891) ──
  const share = useSessionShareData(session, groups, prs, completedSetCount, id);
  const renderItem = ({ item: group, index }: { item: ExerciseGroup | (typeof edit.draft)[number]; index: number }) => {
    return (
      <SessionDetailRow
        group={group}
        index={index}
        editing={edit.editing}
        updateSet={edit.updateSet}
        removeSet={edit.removeSet}
        addSet={edit.addSet}
        removeExercise={edit.removeExercise}
        groups={groups}
        linkIds={linkIds}
        palette={palette}
        colors={colors}
      />
    );
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
              stravaActivityId={share.stravaActivityId}
              stravaSynced={share.stravaSynced}
              sessionId={id}
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
          <SessionDetailFooter
            editing={edit.editing}
            isEmpty={edit.isEmpty}
            pickerVisible={edit.pickerVisible}
            setPickerVisible={edit.setPickerVisible}
            deleteWholeSession={edit.deleteWholeSession}
            addExercise={edit.addExercise}
            templateModalVisible={templateModalVisible}
            templateName={templateName}
            setTemplateName={setTemplateName}
            handleSaveAsTemplate={handleSaveAsTemplate}
            closeTemplateModal={closeTemplateModal}
            saving={saving}
            colors={colors}
            styles={styles}
          />
        }
      />
      <SessionDetailShareOverlay
        shareSheetRef={share.shareSheetRef}
        onShareText={share.handleShareText}
        imageDisabled={completedSetCount === 0}
        stravaConnected={stravaConnected}
        onConnectStrava={() => router.push('/(tabs)/settings')}
        sessionName={session.name ?? "Workout"}
        shareCardDate={share.shareCardDate}
        duration={share.duration}
        completedSets={completedSets()}
        volumeDisplay={share.volumeDisplay.toLocaleString()}
        unit={share.unit}
        rating={rating}
        shareCardPrs={share.shareCardPrs}
        shareCardExercises={share.shareCardExercises}
        promoCaption={share.promoCaption}
        promoEnabled={share.promoEnabled}
        colors={colors}
        sessionId={id}
        stravaSynced={share.stravaSynced}
        stravaActivityId={share.stravaActivityId}
        onRefreshSyncLog={share.refreshSyncLog}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  repeatButton: { marginBottom: 20 },
});
