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
import { getAppSetting, addWarmupSets, updateSetRPE, updatePulleyPin, getMaxPulleyPins, updateMaxPulleyPins } from "../../lib/db";
import { sessionBreadcrumb, rpeBreadcrumb } from "../../lib/session-breadcrumbs";
import { useBodyweightModifierSheet } from "../../hooks/useBodyweightModifierSheet";
import { useVariantPickerSheet } from "../../hooks/useVariantPickerSheet";
import { useBodyweightGripPickerSheet } from "../../hooks/useBodyweightGripPickerSheet";
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
import { ExerciseDetailDrawerContent } from "../../components/session/ExerciseDetailDrawer";
import { SetTypeSheet } from "../../components/session/SetTypeSheet";
import { SessionListHeader } from "../../components/session/SessionListHeader";
import { SessionListFooter } from "../../components/session/SessionListFooter";
import { SessionToolboxSheet } from "../../components/session/SessionToolboxSheet";
import { SessionHeaderToolbar } from "../../components/session/SessionHeaderToolbar";
import { PRCelebration } from "../../components/session/PRCelebration";
import { BodyweightModifierSheet } from "../../components/session/BodyweightModifierSheet";
import { VariantPickerSheet } from "../../components/session/VariantPickerSheet";
import { BodyweightGripPickerSheet } from "../../components/session/BodyweightGripPickerSheet";
import { FormVideoSheet } from "../../components/session/FormVideoSheet";
import { FormClipsPlayer } from "../../components/session/FormClipsPlayer";
import { CompareView } from "../../components/session/CompareView";
import { PulleyPinPickerSheet } from "../../components/session/PulleyPinPickerSheet";
import { SetupPhotoSheet } from "../../components/session/SetupPhotoSheet";
import { getSetupPhotoForSet, deleteSetupPhoto } from "../../lib/media/setup-photos";
import { toAbsPath, getClipsForExercise } from "../../lib/media/form-clips";
import type { SetMediaRow } from "../../lib/media/form-clips";

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
  const { success: showToast, error: showError } = useToast();

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
    session, groups, setGroups, step, unit, suggestions,
    allExercises, linkIds, palette, updateGroupSet, load, plateauHints,
  } = useSessionData({ id, templateId, sourceSessionId });

  const {
    rest, breakdown, restSource, restExerciseId, handlePinChange,
    persistedDurationSeconds,
    selectedDurationSeconds,
    restFlashStyle,
    startRest,
    startRestWithDuration,
    startRestWithBreakdown,
    dismissRest,
    restRef,
    recomputeActiveRest,
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
    elapsed, clockStartedAt, exerciseNotesOpen, exerciseNotesDraft, pinnedNoteDraft, nextHint, hintTimer,
    handleUpdate, handleCheck, handleAddSet,
    handleDelete,
    handleExerciseNotes, handleExerciseNotesDraftChange, toggleExerciseNotes,
    handlePinnedNoteDraftChange, handleSavePinnedNote, handleDismissBackfill, handleLoadBackfill,
    handleMoveUp, handleMoveDown, handlePrefillFromPrevious, handleApplyBreakThrough,
    handleMarkerConfirm, handleManualWeightSave, finish, cancel,
  } = useSessionActions({ id, groups, setGroups, updateGroupSet, startRest, startRestWithDuration, startRestWithBreakdown, dismissRest, session, showToast, showError, triggerPR, unit, suggestions });

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
  const variant = useVariantPickerSheet({ groups, updateGroupSet, showError });
  const bodyweightGrip = useBodyweightGripPickerSheet({ groups, updateGroupSet, showError });
  const [restSettingsRequested, setRestSettingsRequested] = useState(false);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);

  // BLD-1092: form-check video state (iOS/Android only; web guarded in components)
  const [formVideoSetId, setFormVideoSetId] = useState<string | null>(null);
  const [playerSetId, setPlayerSetId] = useState<string | null>(null);
  // Actual SetMediaRow for the set being played (null when no player open).
  const [playerClip, setPlayerClip] = useState<import("../../lib/media/form-clips").SetMediaRow | null>(null);
  // BLD-1151: Compare view state.
  const [compareClipA, setCompareClipA] = useState<SetMediaRow | null>(null);
  const [compareExerciseId, setCompareExerciseId] = useState<string | null>(null);
  const [compareSiblingCounts, setCompareSiblingCounts] = useState<Record<string, number>>({});
  // Map of setId → hasClip, populated after set completion check.
  const [hasClipMap, setHasClipMap] = useState<Record<string, boolean>>({});
  const [pulleyPinSetId, setPulleyPinSetId] = useState<string | null>(null);
  const [pulleyPinExerciseId, setPulleyPinExerciseId] = useState<string | null>(null);
  const [pulleyPinCurrent, setPulleyPinCurrent] = useState<number | null>(null);
  const [pulleyPinMax, setPulleyPinMax] = useState<number>(12);
  const [setupPhotoSetId, setSetupPhotoSetId] = useState<string | null>(null);
  const [setupPhotoRow, setSetupPhotoRow] = useState<import("../../lib/media/setup-photos").SetMediaRow | null>(null);
  const [hasSetupPhotoMap, setHasSetupPhotoMap] = useState<Record<string, boolean>>({});
  const [setupPhotoUriMap, setSetupPhotoUriMap] = useState<Record<string, string>>({});

  // BLD-1110: Live RPE capture preference
  const [captureRpe, setCaptureRpe] = useState(false);
  useEffect(() => {
    getAppSetting("session.captureRpe").then((val) => {
      setCaptureRpe(val === "true");
    }).catch(() => {});
  }, []);

  // BLD-1114: Pulley pin tracking enabled preference (default on)
  const [pulleyPinTrackingEnabled, setPulleyPinTrackingEnabled] = useState(true);
  useEffect(() => {
    getAppSetting("session.pulleyPinTracking").then((val) => {
      setPulleyPinTrackingEnabled(val !== "false");
    }).catch(() => {});
  }, []);

  // Lookup helper: find the group set for a given setId.
  const findSetById = useCallback((setId: string) => {
    for (const g of groups) {
      const s = g.sets.find((s) => s.id === setId);
      if (s) return { set: s, exerciseId: g.exercise_id };
    }
    return null;
  }, [groups]);

  const handleVideoGlyph = useCallback((setId: string) => {
    if (hasClipMap[setId]) {
      setPlayerSetId(setId);
      // Fetch the actual clip row so FormClipsPlayer can render the video.
      if (Platform.OS !== "web") {
        import("../../lib/db/form-clips").then(({ getClipForSet }) => {
          getClipForSet(setId).then((clip) => setPlayerClip(clip)).catch(() => {});
        }).catch(() => {});
        // Load sibling clip count for the Compare button.
        const found = findSetById(setId);
        if (found) {
          getClipsForExercise(found.exerciseId)
            .then((clips) => setCompareSiblingCounts((prev) => ({ ...prev, [found.exerciseId]: clips.length })))
            .catch(() => {});
        }
      }
    } else {
      setFormVideoSetId(setId);
    }
  }, [hasClipMap, findSetById]);

  // BLD-1151: Single-batched handoff from player to compare (AC2/AC12 contract).
  const handleRequestCompare = useCallback((clipA: SetMediaRow) => {
    const found = playerSetId ? findSetById(playerSetId) : null;
    // One batched update: close player, open compare.
    setPlayerSetId(null);
    setPlayerClip(null);
    setCompareClipA(clipA);
    setCompareExerciseId(found?.exerciseId ?? null);
  }, [playerSetId, findSetById]);

  const handleClipSaved = useCallback((setId: string, clipId: string) => {
    setFormVideoSetId(null);
    setHasClipMap((prev) => ({ ...prev, [setId]: true }));
    void clipId;
  }, []);

  const handleOpenPulleyPinPicker = useCallback((setId: string) => {
    const found = findSetById(setId);
    if (!found) return;
    setPulleyPinSetId(setId);
    setPulleyPinExerciseId(found.exerciseId);
    setPulleyPinCurrent(found.set.pulley_pin ?? null);
    getMaxPulleyPins(found.exerciseId).then((maxPins) => {
      setPulleyPinMax(maxPins ?? 12);
    }).catch(() => {
      setPulleyPinMax(12);
    });
  }, [findSetById]);

  const handleSelectPulleyPin = useCallback((pin: number | null) => {
    if (!pulleyPinSetId) return;
    const previous = pulleyPinCurrent;
    updateGroupSet(pulleyPinSetId, { pulley_pin: pin });
    setPulleyPinCurrent(pin);
    updatePulleyPin(pulleyPinSetId, pin).catch(() => {
      updateGroupSet(pulleyPinSetId, { pulley_pin: previous });
      setPulleyPinCurrent(previous);
      showError("Could not save pulley pin");
    });
  }, [pulleyPinCurrent, pulleyPinSetId, showError, updateGroupSet]);

  const handleSetMaxPulleyPins = useCallback((newMax: number) => {
    if (!pulleyPinExerciseId) return;
    setPulleyPinMax(newMax);
    updateMaxPulleyPins(pulleyPinExerciseId, newMax).catch(() => {
      showError("Could not save max pins");
    });
  }, [pulleyPinExerciseId, showError]);

  const handleSetupPhotoGlyph = useCallback(async (setId: string) => {
    let row: import("../../lib/media/setup-photos").SetMediaRow | null = null;
    try {
      row = await getSetupPhotoForSet(setId);
    } catch {
      row = null;
    }
    setSetupPhotoRow(row);
    setSetupPhotoSetId(setId);
  }, []);

  const handleSetupPhotoSaved = useCallback((row: import("../../lib/media/setup-photos").SetMediaRow) => {
    setSetupPhotoSetId(null);
    setSetupPhotoRow(row);
    setHasSetupPhotoMap((prev) => ({ ...prev, [row.set_id]: true }));
  }, []);

  const handleSetupPhotoDeleted = useCallback(() => {
    if (!setupPhotoRow) return;
    const { id: photoId, rel_path, set_id } = setupPhotoRow;
    deleteSetupPhoto(photoId, rel_path)
      .then(() => {
        setHasSetupPhotoMap((prev) => ({ ...prev, [set_id]: false }));
        setSetupPhotoRow(null);
      })
      .catch(() => showError("Could not delete setup photo"));
  }, [setupPhotoRow, showError]);

  // BLD-1110: RPE chip tap handler — optimistic update, persist, breadcrumb, recompute rest.
  const handleRpeChange = useCallback((setId: string, rpe: number | null) => {
    const found = findSetById(setId);
    const oldRpe = found?.set.rpe ?? null;
    // Optimistic in-memory update so the chip reflects the new value immediately.
    updateGroupSet(setId, { rpe });
    updateSetRPE(setId, rpe).catch(() => {
      // Rollback on persistence failure.
      updateGroupSet(setId, { rpe: oldRpe });
    });
    rpeBreadcrumb({ setId, oldRpe, newRpe: rpe, source: "chip" });
    if (found) {
      recomputeActiveRest(setId, found.exerciseId, rpe);
    }
  }, [findSetById, recomputeActiveRest, updateGroupSet]);

  // Refresh media maps when sets change (non-blocking fire-and-forget).
  useEffect(() => {
    if (Platform.OS === "web") return;
    import("../../lib/db/form-clips").then(({ getClipForSet }) => {
      const completedSetIds = groups.flatMap((g) => g.sets.filter((s) => s.completed).map((s) => s.id));
      if (completedSetIds.length === 0) {
        setHasClipMap({});
        setHasSetupPhotoMap({});
        return;
      }
      Promise.all([
        Promise.all(completedSetIds.map((sid) => getClipForSet(sid).then((clip) => [sid, !!clip] as const))),
        Promise.all(completedSetIds.map((sid) => getSetupPhotoForSet(sid).then((photo) => [sid, photo] as const))),
      ])
        .then(([clipPairs, photoPairs]) => {
          setHasClipMap(Object.fromEntries(clipPairs));
          const boolPairs = photoPairs.map(([sid, photo]) => [sid, !!photo] as const);
          setHasSetupPhotoMap(Object.fromEntries(boolPairs));
          setSetupPhotoUriMap(Object.fromEntries(photoPairs.filter(([, p]) => p != null).map(([sid, p]) => [sid, toAbsPath(p!.rel_path)] as const)));
        })
        .catch(() => {});
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

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
        group?.sets[0]?.tempo,
        group?.exercise_position ?? 0
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await load();
    } catch {
      showError("Could not add warmup sets");
    }
  }, [id, unit, suggestions, groups, load, showError]);

  const renderExerciseGroup = useCallback(({ item: group }: { item: typeof groups[number]; index: number }) => {
    return (
      <ExerciseGroupCard
      group={group}
      step={step}
      unit={unit}
      suggestions={suggestions}
      exerciseNotesOpen={!!exerciseNotesOpen[group.exercise_id]}
      exerciseNotesDraft={exerciseNotesDraft[group.exercise_id]}
      pinnedNoteDraft={pinnedNoteDraft[group.exercise_id]}
      linkIds={linkIds}
      groups={groups}
      palette={palette}
      onUpdate={handleUpdate}
      onCheck={handleCheck}
      onDelete={handleDelete}
      onAddSet={handleAddSet}
      onAddWarmups={handleAddWarmups}
      onExerciseNotes={handleExerciseNotes}
      onExerciseNotesDraftChange={handleExerciseNotesDraftChange}
      onToggleExerciseNotes={toggleExerciseNotes}
      onPinnedNoteDraftChange={handlePinnedNoteDraftChange}
      onPinnedNoteSave={handleSavePinnedNote}
      onBackfillCopy={(exId, text) => { handleDismissBackfill(exId); handleSavePinnedNote(exId, text); }}
      onBackfillDismiss={handleDismissBackfill}
      onLoadBackfill={handleLoadBackfill}
      onCycleSetType={handleCycleSetType}
      onLongPressSetType={handleLongPressSetType}
      onOpenBodyweightModifier={handleOpenBodyweightModifier}
      onClearBodyweightModifier={handleClearBodyweightModifier}
      onOpenVariantPicker={variant.handleOpen} onClearVariant={variant.handleClear}
      onOpenBodyweightGripPicker={bodyweightGrip.handleOpen} onClearBodyweightGrip={bodyweightGrip.handleClear}
      onShowDetail={handleShowDetail}
      onSwap={handleSwapOpen}
      onDeleteExercise={handleDeleteExercise}
      onMoveUp={handleMoveUp}
      onMoveDown={handleMoveDown}
      onPrefill={handlePrefillFromPrevious}
      plateauHints={plateauHints} onApplyBreakThrough={handleApplyBreakThrough}
      timerActiveExerciseId={timerExerciseId}
      timerActiveSetIndex={timerSetIndex}
      timerIsRunning={timerIsRunning}
      timerDisplaySeconds={timerDisplaySeconds}
      onTimerStart={handleTimerStart}
      onTimerStop={handleTimerStop}
      hasClipMap={hasClipMap}
      onVideoGlyph={handleVideoGlyph}
      onOpenPulleyPinPicker={handleOpenPulleyPinPicker}
      hasSetupPhotoMap={hasSetupPhotoMap}
      setupPhotoUriMap={setupPhotoUriMap}
      onSetupPhotoGlyph={handleSetupPhotoGlyph}
      captureRpe={captureRpe}
      onRpeChange={handleRpeChange}
      showPulleyPin={pulleyPinTrackingEnabled} gymId={session?.gym_id ?? null} onMarkerConfirm={handleMarkerConfirm} onManualWeightSave={handleManualWeightSave}
    />
    );
  }, [step, unit, suggestions, plateauHints, exerciseNotesOpen, exerciseNotesDraft, pinnedNoteDraft, linkIds, groups, palette, handleUpdate, handleCheck, handleDelete, handleAddSet, handleAddWarmups, handleExerciseNotes, handleExerciseNotesDraftChange, toggleExerciseNotes, handlePinnedNoteDraftChange, handleSavePinnedNote, handleDismissBackfill, handleLoadBackfill, handleCycleSetType, handleLongPressSetType, handleOpenBodyweightModifier, handleClearBodyweightModifier, variant, bodyweightGrip, handleShowDetail, handleSwapOpen, handleDeleteExercise, handleMoveUp, handleMoveDown, handlePrefillFromPrevious, handleApplyBreakThrough, timerExerciseId, timerSetIndex, timerIsRunning, timerDisplaySeconds, handleTimerStart, handleTimerStop, hasClipMap, handleVideoGlyph, handleOpenPulleyPinPicker, hasSetupPhotoMap, setupPhotoUriMap, handleSetupPhotoGlyph, captureRpe, handleRpeChange, pulleyPinTrackingEnabled, session?.gym_id, handleMarkerConfirm, handleManualWeightSave]);

  const listHeader = useMemo(() => (
    <SessionListHeader nextHint={nextHint} gymName={session?.gym_name_at_log ?? null} colors={colors} />
  ), [nextHint, session?.gym_name_at_log, colors]);

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
              persistedDurationSeconds={persistedDurationSeconds}
              selectedDurationSeconds={selectedDurationSeconds}
              flashStyle={restFlashStyle}
              onStartRest={handleToolboxStartRest}
              onDismissRest={dismissRest}
              onOpenToolbox={handleToolboxOpen}
              pickerRequested={restSettingsRequested}
              onPickerDismissed={handleRestSettingsDismissed}
              restSource={restSource} restExerciseId={restExerciseId}
              onPinChange={handlePinChange}
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
        onDismiss={() => { /* no-op */ }}
      />
      <BodyweightModifierSheet sheetRef={bwModifierSheetRef} initialModifierKg={bwModifierInitial} unit={unit} onDone={handleSaveBodyweightModifier} onDismiss={handleDismissBodyweightModifier} />
      <VariantPickerSheet isVisible={variant.isVisible} onClose={variant.handleClose} onConfirm={variant.handleConfirm} {...variant.initialValues} />
      <BodyweightGripPickerSheet isVisible={bodyweightGrip.isVisible} onClose={bodyweightGrip.handleClose} onConfirm={bodyweightGrip.handleConfirm} {...bodyweightGrip.initialValues} />
      <PulleyPinPickerSheet
        visible={!!pulleyPinSetId}
        currentPin={pulleyPinCurrent}
        maxPins={pulleyPinMax}
        onSelect={handleSelectPulleyPin}
        onSetMaxPins={handleSetMaxPulleyPins}
        onClose={() => {
          setPulleyPinSetId(null);
        }}
      />
      {/* BLD-1092: form-check video modals (no-ops on web — components guard with Platform.OS) */}
      {Platform.OS !== "web" && (() => {
        const formSetInfo = formVideoSetId ? findSetById(formVideoSetId) : null;
        return formSetInfo ? (
          <FormVideoSheet
            isVisible={!!formVideoSetId}
            setId={formVideoSetId!}
            exerciseId={formSetInfo.exerciseId}
            setNumber={formSetInfo.set.set_number}
            onClose={() => setFormVideoSetId(null)}
            onClipSaved={(clipId) => handleClipSaved(formVideoSetId!, clipId)}
          />
        ) : null;
      })()}
      {Platform.OS !== "web" && (() => {
        const playerSetInfo = playerSetId ? findSetById(playerSetId) : null;
        const playerSet = playerSetInfo?.set ?? null;
        const sibCount = playerSetInfo ? (compareSiblingCounts[playerSetInfo.exerciseId] ?? 0) : 0;
        return (
          <FormClipsPlayer
            isVisible={!!playerSetId && !!playerClip}
            clip={playerClip}
            weightLabel={playerSet ? `${playerSet.weight ?? ""} ${unit}`.trim() : undefined}
            reps={playerSet?.reps ?? null}
            exerciseId={playerSetInfo?.exerciseId}
            siblingClipCount={sibCount}
            onRequestCompare={handleRequestCompare}
            onClose={() => { setPlayerSetId(null); setPlayerClip(null); }}
          />
        );
      })()}
      {Platform.OS !== "web" && compareClipA && compareExerciseId && (
        <CompareView
          isVisible
          clipA={compareClipA}
          clipB={null}
          exerciseId={compareExerciseId}
          pickerEnabled
          pickerOpen
          onClose={() => { setCompareClipA(null); setCompareExerciseId(null); }}
        />
      )}
      {Platform.OS !== "web" && (() => {
        const setupSetInfo = setupPhotoSetId ? findSetById(setupPhotoSetId) : null;
        return setupSetInfo ? (
          <SetupPhotoSheet
            visible={!!setupPhotoSetId}
            setId={setupPhotoSetId!}
            exerciseId={setupSetInfo.exerciseId}
            existingPhoto={setupPhotoRow}
            onSaved={handleSetupPhotoSaved}
            onDeleted={handleSetupPhotoDeleted}
            onClose={() => {
              setSetupPhotoSetId(null);
              setSetupPhotoRow(null);
            }}
          />
        ) : null;
      })()}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  detailHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
});
