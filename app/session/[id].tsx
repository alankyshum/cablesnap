/* eslint-disable max-lines-per-function, react-hooks/exhaustive-deps */
import React, { useEffect, useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/bna-toast";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams } from "expo-router";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { setEnabled as setAudioEnabled } from "../../lib/audio";
import { getAppSetting } from "../../lib/db";
import { formatTime } from "../../lib/format";
import { useLayout } from "../../lib/layout";
import ExercisePickerSheet from "../../components/ExercisePickerSheet";
import SubstitutionSheet from "../../components/SubstitutionSheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useRestTimer } from "../../hooks/useRestTimer";
import { useSessionData } from "../../hooks/useSessionData";
import { useSessionActions } from "../../hooks/useSessionActions";
import { useExerciseManagement } from "../../hooks/useExerciseManagement";
import { useSetTypeActions } from "../../hooks/useSetTypeActions";
import { ExerciseGroupCard } from "../../components/session/ExerciseGroupCard";
import { ExerciseDetailDrawerContent } from "../../components/session/ExerciseDetailDrawer";
import { SetTypeSheet } from "../../components/session/SetTypeSheet";
import { SessionListHeader } from "../../components/session/SessionListHeader";
import { SessionListFooter } from "../../components/session/SessionListFooter";

export default function ActiveSession() {
  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
  }, []);
  const colors = useThemeColors();
  const layout = useLayout();
  const { id, templateId, sourceSessionId } = useLocalSearchParams<{
    id: string;
    templateId?: string;
    sourceSessionId?: string;
  }>();
  const { info: showToast, error: showError } = useToast();

  // Load timer sound setting
  useEffect(() => {
    getAppSetting("timer_sound_enabled").then((val) => {
      setAudioEnabled(val !== "false");
    }).catch(() => {
      setAudioEnabled(true);
      showError("Could not load sound setting");
    });
  }, []);

  const {
    session, groups, setGroups, step, unit,
    suggestions, modes, setModes, maxes,
    allExercises, linkIds, palette,
    updateGroupSet, load,
  } = useSessionData({ id, templateId, sourceSessionId });

  const {
    rest, restFlashStyle, startRest, startRestWithDuration, dismissRest, restRef,
  } = useRestTimer({ sessionId: id, colors });

  const {
    detailExercise, setDetailExercise, detailSheetRef,
    handleShowDetail,
    swapSource, setSwapSource, swapSheetRef,
    handleSwapOpen, handleSwapSelect,
    pickerOpen, setPickerOpen,
    handleAddExercise, handlePickExercise,
    handleDeleteExercise,
    cleanupRefs,
  } = useExerciseManagement({
    id, groups, setGroups, load, startRest, dismissRest,
  });

  const {
    setTypeSheetSetId, setSetTypeSheetSetId,
    handleCycleSetType, handleLongPressSetType, handleSelectSetType,
  } = useSetTypeActions({ groups, setGroups, maxes });

  const {
    elapsed, exerciseNotesOpen, exerciseNotesDraft, halfStep, nextHint, hintTimer,
    handleUpdate, handleCheck, handleAddSet, handleModeChange,
    handleRPE, handleHalfStep, handleHalfStepClear, handleHalfStepOpen,
    handleDelete, handleExerciseNotes, handleExerciseNotesDraftChange,
    toggleExerciseNotes, finish, cancel,
  } = useSessionActions({
    id, groups, setGroups, modes, setModes,
    updateGroupSet, startRest, startRestWithDuration, session,
    showToast, showError,
  });

  const detailSnapPoints = useMemo(() => ["40%", "90%"], []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      if (cleanupRefs.swapUndoTimer.current) clearTimeout(cleanupRefs.swapUndoTimer.current);
      if (cleanupRefs.deleteExerciseTimer.current) clearTimeout(cleanupRefs.deleteExerciseTimer.current);
      if (cleanupRefs.deleteCountdownInterval.current) clearInterval(cleanupRefs.deleteCountdownInterval.current);
    };
  }, []);

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

  return (
    <>
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text variant="body" style={{ color: colors.primary, marginRight: 8 }}>
                {formatTime(elapsed)}
              </Text>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <FlashList
        data={groups}
        renderItem={({ item: group }) => (
          <ExerciseGroupCard
            group={group}
            step={step}
            unit={unit}
            suggestions={suggestions}
            modes={modes}
            exerciseNotesOpen={!!exerciseNotesOpen[group.exercise_id]}
            exerciseNotesDraft={exerciseNotesDraft[group.exercise_id]}
            halfStep={halfStep}
            linkIds={linkIds}
            groups={groups}
            palette={palette}
            onUpdate={handleUpdate}
            onCheck={handleCheck}
            onDelete={handleDelete}
            onAddSet={handleAddSet}
            onModeChange={handleModeChange}
            onRPE={handleRPE}
            onHalfStep={handleHalfStep}
            onHalfStepClear={handleHalfStepClear}
            onHalfStepOpen={handleHalfStepOpen}
            onExerciseNotes={handleExerciseNotes}
            onExerciseNotesDraftChange={handleExerciseNotesDraftChange}
            onToggleExerciseNotes={toggleExerciseNotes}
            onCycleSetType={handleCycleSetType}
            onLongPressSetType={handleLongPressSetType}
            onShowDetail={handleShowDetail}
            onSwap={handleSwapOpen}
            onDeleteExercise={handleDeleteExercise}
          />
        )}
        keyExtractor={(item) => item.exercise_id}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <SessionListHeader
            rest={rest}
            restFlashStyle={restFlashStyle}
            dismissRest={dismissRest}
            nextHint={nextHint}
            colors={colors}
          />
        }
        ListFooterComponent={
          <SessionListFooter
            onAddExercise={handleAddExercise}
            onFinish={finish}
            onCancel={cancel}
            colors={colors}
          />
        }
      />
      </KeyboardAvoidingView>
      {!!setTypeSheetSetId && (
        <SetTypeSheet
          setId={setTypeSheetSetId}
          groups={groups}
          onSelect={handleSelectSetType}
          onDismiss={() => setSetTypeSheetSetId(null)}
        />
      )}

      <ExercisePickerSheet
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        onPick={handlePickExercise}
      />
      <BottomSheet
        ref={detailSheetRef}
        index={-1}
        snapPoints={detailSnapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        onClose={() => setDetailExercise(null)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        )}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
      >
        {detailExercise && (
          <>
            <View style={styles.detailHeader}>
              <Text variant="title" style={{ color: colors.onSurface, flex: 1 }}>
                {detailExercise.name}
              </Text>
              <Pressable
                onPress={() => detailSheetRef.current?.close()}
                accessibilityLabel="Close exercise details"
                hitSlop={8}
                style={{ padding: 8 }}
              >
                <MaterialCommunityIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
            <ExerciseDetailDrawerContent exercise={detailExercise} />
          </>
        )}
      </BottomSheet>
      <SubstitutionSheet
        sheetRef={swapSheetRef}
        sourceExercise={swapSource}
        allExercises={allExercises}
        onSelect={handleSwapSelect}
        onDismiss={() => setSwapSource(null)}
      />
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
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
});
