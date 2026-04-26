/* eslint-disable max-lines-per-function, react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/bna-toast";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { setEnabled as setAudioCategoryEnabled, preload as preloadAudio } from "../../lib/audio";
import { getAppSetting, addWarmupSets } from "../../lib/db";
import { sessionBreadcrumb } from "../../lib/session-breadcrumbs";
import { useBodyweightModifierSheet } from "../../hooks/useBodyweightModifierSheet";
import { getTemplateDurationEstimates } from "../../lib/db/sessions";
import { generateWarmupSets } from "../../lib/warmup";
import * as Haptics from "expo-haptics";
import { useLayout } from "../../lib/layout";
import ExercisePickerSheet from "../../components/ExercisePickerSheet";
import SubstitutionSheet from "../../components/SubstitutionSheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useRestTimer } from "../../hooks/useRestTimer";
import { useSessionData } from "../../hooks/useSessionData";
import { useSessionActions } from "../../hooks/useSessionActions";
import { useExerciseManagement } from "../../hooks/useExerciseManagement";
import { useSetTypeActions } from "../../hooks/useSetTypeActions";
import { useSessionTimer } from "../../hooks/useSessionTimer";
import { usePRCelebration } from "../../hooks/usePRCelebration";
import { ExerciseGroupCard } from "../../components/session/ExerciseGroupCard";
import { MountTransitionHint } from "../../components/session/MountTransitionHint";
import { ExerciseDetailDrawerContent } from "../../components/session/ExerciseDetailDrawer";
import { SetTypeSheet } from "../../components/session/SetTypeSheet";
import { SessionListHeader } from "../../components/session/SessionListHeader";
import { SessionListFooter } from "../../components/session/SessionListFooter";
import { SessionToolboxSheet } from "../../components/session/SessionToolboxSheet";
import { SessionHeaderToolbar } from "../../components/session/SessionHeaderToolbar";
import { PRCelebration } from "../../components/session/PRCelebration";
import { BodyweightModifierSheet } from "../../components/session/BodyweightModifierSheet";

export default function ActiveSession() {
  // BLD-577: the session screen is the only surface allowed to hold a
  // keep-awake tag. We must release it on unmount — otherwise navigating
  // away mid-session (back button, route change, OS kill-and-restore) can
  // leak the wake-lock and burn the screen indefinitely. Using the
  // default tag (undefined) keeps the idempotency semantics from
  // expo-keep-awake.
  useEffect(() => {
    let released = false;
    sessionBreadcrumb("session.open");
    sessionBreadcrumb("session.keepawake.acquire");
    activateKeepAwakeAsync()
      .catch(() => { released = true; });
    return () => {
      if (released) return;
      try {
        deactivateKeepAwake();
        sessionBreadcrumb("session.keepawake.release");
        sessionBreadcrumb("session.close");
      } catch {
        // Keep-awake native module unavailable — nothing to release.
      }
    };
  }, []);
  const colors = useThemeColors();
  const layout = useLayout();
  const { id, templateId, sourceSessionId } = useLocalSearchParams<{
    id: string;
    templateId?: string;
    sourceSessionId?: string;
  }>();
  const { info: showToast, error: showError } = useToast();

  // Load timer sound setting + preload audio players so the first
  // set-complete tap is not the audio load trigger (BLD-559 TL-T3).
  useEffect(() => {
    getAppSetting("timer_sound_enabled").then((val) => {
      setAudioCategoryEnabled("timer", val !== "false");
    }).catch(() => {
      setAudioCategoryEnabled("timer", true);
      showError("Could not load sound setting");
    });
    void preloadAudio();
  }, []);

  const {
    session, groups, setGroups, step, unit, suggestions, modes, setModes,
    allExercises, linkIds, palette, updateGroupSet, load,
  } = useSessionData({ id, templateId, sourceSessionId });

  const {
    rest, breakdown, startRest, startRestWithDuration, startRestWithBreakdown, dismissRest, restRef,
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
  } = useSetTypeActions({ groups, setGroups });

  const { celebration, triggerPR, cleanup: cleanupCelebration } = usePRCelebration();

  const {
    elapsed, clockStartedAt, exerciseNotesOpen, exerciseNotesDraft, nextHint, hintTimer,
    handleUpdate, handleCheck, handleAddSet, handleModeChange,
    handleDelete,
    handleExerciseNotes, handleExerciseNotesDraftChange, toggleExerciseNotes,
    handleMoveUp, handleMoveDown, handlePrefillFromPrevious, finish, cancel,
  } = useSessionActions({
    id, groups, setGroups, modes, setModes, updateGroupSet, startRest, startRestWithDuration, startRestWithBreakdown, session, showToast, showError, triggerPR, unit,
  });

  const {
    activeExerciseId: timerExerciseId, activeSetIndex: timerSetIndex,
    isRunning: timerIsRunning, displaySeconds: timerDisplaySeconds, handleTimerStart, handleTimerStop,
  } = useSessionTimer({ sessionId: id, groups, dismissRest, handleUpdate });
  const detailSnapPoints = useMemo(() => ["40%", "90%"], []);
  const toolboxSheetRef = useRef<BottomSheet>(null);
  const {
    sheetRef: bwModifierSheetRef,
    handleOpen: handleOpenBodyweightModifier,
    handleClear: handleClearBodyweightModifier,
    handleSave: handleSaveBodyweightModifier,
    handleDismiss: handleDismissBodyweightModifier,
    initialModifierKg: bwModifierInitial,
  } = useBodyweightModifierSheet({ groups, updateGroupSet, showError });
  const [restSettingsRequested, setRestSettingsRequested] = useState(false);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);

  // Fetch estimated duration from template history (Phase 70)
  useEffect(() => {
    if (!session?.template_id) return;
    getTemplateDurationEstimates([session.template_id])
      .then((estimates) => {
        setEstimatedDuration(estimates[session.template_id!] ?? null);
      })
      .catch(() => {});
  }, [session?.template_id]);

  const handleToolboxOpen = useCallback(() => {
    // Mutual exclusion: close exercise picker before opening toolbox
    setPickerOpen(false);
    toolboxSheetRef.current?.snapToIndex(0);
  }, [setPickerOpen]);

  const handleToolboxDismiss = useCallback(() => {
    // no-op — sheet handles its own close
  }, []);

  const handleToolboxStartRest = useCallback((seconds: number) => {
    startRestWithDuration(seconds);
  }, [startRestWithDuration]);

  const handleOpenRestSettings = useCallback(() => {
    setRestSettingsRequested(true);
  }, []);

  const handleRestSettingsDismissed = useCallback(() => {
    setRestSettingsRequested(false);
  }, []);

  // Wrap add exercise to close toolbox (mutual exclusion)
  const handleAddExerciseWrapped = useCallback(() => {
    toolboxSheetRef.current?.close();
    handleAddExercise();
  }, [handleAddExercise]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      if (cleanupRefs.swapUndoTimer.current) clearTimeout(cleanupRefs.swapUndoTimer.current);
      if (cleanupRefs.deleteExerciseTimer.current) clearTimeout(cleanupRefs.deleteExerciseTimer.current);
      if (cleanupRefs.deleteCountdownInterval.current) clearInterval(cleanupRefs.deleteCountdownInterval.current);
      cleanupCelebration();
    };
  }, []);

  const handleAddWarmups = useCallback(async (exerciseId: string) => {
    const suggestion = suggestions[exerciseId];
    if (!suggestion || suggestion.weight <= 0) return;

    const barWeight = unit === "lb" ? 45 : 20;
    const warmupSets = generateWarmupSets(suggestion.weight, barWeight, unit);
    if (warmupSets.length === 0) return;

    try {
      const group = groups.find((g) => g.exercise_id === exerciseId);
      await addWarmupSets(
        id,
        exerciseId,
        warmupSets,
        group?.link_id,
        group?.sets[0]?.training_mode,
        group?.sets[0]?.tempo,
        group?.exercise_position ?? 0
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await load();
    } catch {
      showError("Could not add warmup sets");
    }
  }, [id, unit, suggestions, groups, load, showError]);

  const renderExerciseGroup = useCallback(({ item: group, index }: { item: typeof groups[number]; index: number }) => {
    const prevMount = index > 0 ? groups[index - 1]?.mount_position : undefined;
    const currMount = group.mount_position;
    return (<>
        {prevMount && currMount && prevMount !== currMount ? <MountTransitionHint prevMount={prevMount} nextMount={currMount} /> : null}
        <ExerciseGroupCard
      group={group}
      step={step}
      unit={unit}
      suggestions={suggestions}
      modes={modes}
      exerciseNotesOpen={!!exerciseNotesOpen[group.exercise_id]}
      exerciseNotesDraft={exerciseNotesDraft[group.exercise_id]}
      linkIds={linkIds}
      groups={groups}
      palette={palette}
      onUpdate={handleUpdate}
      onCheck={handleCheck}
      onDelete={handleDelete}
      onAddSet={handleAddSet}
      onAddWarmups={handleAddWarmups}
      onModeChange={handleModeChange}
      onExerciseNotes={handleExerciseNotes}
      onExerciseNotesDraftChange={handleExerciseNotesDraftChange}
      onToggleExerciseNotes={toggleExerciseNotes}
      onCycleSetType={handleCycleSetType}
      onLongPressSetType={handleLongPressSetType}
      onOpenBodyweightModifier={handleOpenBodyweightModifier}
      onClearBodyweightModifier={handleClearBodyweightModifier}
      onShowDetail={handleShowDetail}
      onSwap={handleSwapOpen}
      onDeleteExercise={handleDeleteExercise}
      onMoveUp={handleMoveUp}
      onMoveDown={handleMoveDown}
      onPrefill={handlePrefillFromPrevious}
      timerActiveExerciseId={timerExerciseId}
      timerActiveSetIndex={timerSetIndex}
      timerIsRunning={timerIsRunning}
      timerDisplaySeconds={timerDisplaySeconds}
      onTimerStart={handleTimerStart}
      onTimerStop={handleTimerStop}
    />
      </>
    );
  }, [step, unit, suggestions, modes, exerciseNotesOpen, exerciseNotesDraft, linkIds, groups, palette, handleUpdate, handleCheck, handleDelete, handleAddSet, handleAddWarmups, handleModeChange, handleExerciseNotes, handleExerciseNotesDraftChange, toggleExerciseNotes, handleCycleSetType, handleLongPressSetType, handleOpenBodyweightModifier, handleClearBodyweightModifier, handleShowDetail, handleSwapOpen, handleDeleteExercise, handleMoveUp, handleMoveDown, handlePrefillFromPrevious, timerExerciseId, timerSetIndex, timerIsRunning, timerDisplaySeconds, handleTimerStart, handleTimerStop]);

  const listHeader = useMemo(() => (
    <SessionListHeader nextHint={nextHint} colors={colors} />
  ), [nextHint, colors]);

  const listFooter = useMemo(() => (
    <SessionListFooter
      onAddExercise={handleAddExerciseWrapped}
      onFinish={finish}
      onCancel={cancel}
      colors={colors}
    />
  ), [handleAddExerciseWrapped, finish, cancel, colors]);

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Workout", gestureEnabled: false }} />
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
          title: session.name, gestureEnabled: false, // BLD-614 swipe-back guard.
          headerRight: () => (
            <SessionHeaderToolbar
              rest={rest}
              elapsed={elapsed}
              clockStarted={clockStartedAt != null}
              estimatedDuration={estimatedDuration}
              breakdown={breakdown}
              onStartRest={handleToolboxStartRest}
              onDismissRest={dismissRest}
              onOpenToolbox={handleToolboxOpen}
              pickerRequested={restSettingsRequested}
              onPickerDismissed={handleRestSettingsDismissed}
            />
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <PRCelebration celebration={celebration} />
      <FlatList
        data={groups}
        renderItem={renderExerciseGroup}
        keyExtractor={(item) => item.exercise_id}
        extraData={groups}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
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
            <ExerciseDetailDrawerContent exercise={detailExercise} unit={unit} />
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
      <SessionToolboxSheet
        sheetRef={toolboxSheetRef}
        onOpenRestSettings={handleOpenRestSettings}
        onDismiss={handleToolboxDismiss}
      />
      <BodyweightModifierSheet
        sheetRef={bwModifierSheetRef}
        initialModifierKg={bwModifierInitial}
        unit={unit}
        onDone={handleSaveBodyweightModifier}
        onDismiss={handleDismissBodyweightModifier}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  detailHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
});
