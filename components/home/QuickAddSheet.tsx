/**
 * BLD-1089: Quick-Add bottom sheet.
 *
 * - Shows up to 6 recent exercise chips (ordered by recency, last 7 days).
 * - Chip tap → immediate 2-tap commit (prefilled reps/weight).
 * - Long-press chip → edit drawer with NumericStepper.
 * - "+ Pick exercise…" → ExercisePickerSheet.
 * - Active session guard: shows banner, disables all logging affordances. AC5.
 * - Undo within 4s hard-deletes the set (and backing row if it was the last set). AC8.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useToast } from "@/components/ui/bna-toast";
import NumericStepper from "@/components/exercise/NumericStepper";
import ExercisePickerSheet from "@/components/ExercisePickerSheet";
import {
  addQuickAddSet,
  removeQuickAddSet,
  listRecentQuickAddExercises,
} from "@/lib/db/day-session";
import { getActiveSession } from "@/lib/db/sessions";
import { getBodySettings, getAppSetting } from "@/lib/db";
import { resolveStep } from "@/lib/weightStep";
import type { QuickAddExerciseChip } from "@/lib/db/day-session";
import type { Exercise } from "@/lib/types";
import * as Haptics from "expo-haptics";
import { radii } from "@/constants/design-tokens";

// ─── Types ─────────────────────────────────────────────────────────

type EditState = {
  chip: QuickAddExerciseChip;
  reps: number;
  weight: number;
};

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onSetLogged: () => void;
  onOpenActiveSession: (sessionId: string) => void;
};

// ─── Component ─────────────────────────────────────────────────────

export default function QuickAddSheet({
  visible,
  onDismiss,
  onSetLogged,
  onOpenActiveSession,
}: Props) {
  const colors = useThemeColors();
  const { success: showSuccess, error: showError } = useToast();

  const sheetRef = useRef<BottomSheet>(null);

  const [chips, setChips] = useState<QuickAddExerciseChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [step, setStep] = useState<number>(2.5);

  const snapPoints = editState ? ["75%"] : ["50%"];

  // Load data when sheet opens
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditState(null);

    const getAppSettingPromise = typeof getAppSetting === "function"
      ? getAppSetting("session.weightStep")
      : Promise.resolve(null);

    Promise.all([
      listRecentQuickAddExercises(7, 6),
      getActiveSession(),
      getBodySettings(),
      getAppSettingPromise,
    ])
      .then(([recentChips, activeSession, settings, rawStep]) => {
        setChips(recentChips);
        setActiveSessionId(activeSession?.id ?? null);
        const resolvedUnit = (settings.weight_unit as "kg" | "lb") || "kg";
        setUnit(resolvedUnit);
        setStep(resolveStep(rawStep, resolvedUnit));
      })
      .catch(() => {
        showError("Failed to load exercises. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [visible, showError]);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const commitSet = useCallback(
    async (exerciseId: string, exerciseName: string, reps: number, weight: number | null) => {
      if (committing) return;
      setCommitting(true);
      try {
        // Haptics are best-effort — do not let failure block the DB write
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

        const result = await addQuickAddSet({ exerciseId, reps, weight });
        setEditState(null);
        onDismiss();
        onSetLogged();

        // Show confirmation toast with Undo (AC8)
        showSuccess(`Logged: ${exerciseName} ${reps} reps · today's total ${result.todayTotal}`, {
          action: {
            label: "Undo",
            onPress: async () => {
              await removeQuickAddSet(result.setId);
              onSetLogged();
            },
          },
          duration: 4000,
        });
      } catch {
        showError("Failed to log set. Please try again.");
      } finally {
        setCommitting(false);
      }
    },
    [committing, onDismiss, onSetLogged, showSuccess, showError]
  );

  // 2-tap path: chip tap immediately commits prefilled reps/weight (AC3, AC11)
  const handleChipTap = useCallback(
    async (chip: QuickAddExerciseChip) => {
      if (activeSessionId) return;
      const reps = chip.last_reps ?? 1;
      const weight = chip.last_weight ?? null;
      await commitSet(chip.exercise_id, chip.exercise_name, reps, weight);
    },
    [activeSessionId, commitSet]
  );

  // Long-press path: open edit drawer
  const handleChipLongPress = useCallback(
    (chip: QuickAddExerciseChip) => {
      if (activeSessionId) return;
      setEditState({
        chip,
        reps: chip.last_reps ?? 1,
        weight: chip.last_weight ?? 0,
      });
    },
    [activeSessionId]
  );

  // New exercise from picker → edit drawer
  const handleExercisePick = useCallback((exercise: Exercise) => {
    setExercisePickerVisible(false);
    setEditState({
      chip: {
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        last_reps: 1,
        last_weight: 0,
        last_added_at: Date.now(),
      },
      reps: 1,
      weight: 0,
    });
  }, []);

  const handleLogSet = useCallback(async () => {
    if (!editState) return;
    await commitSet(
      editState.chip.exercise_id,
      editState.chip.exercise_name,
      editState.reps,
      editState.weight || null
    );
  }, [editState, commitSet]);

  const hasActiveSession = !!activeSessionId;

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        index={visible ? 0 : -1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={onDismiss}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.outline }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        )}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {/* Active session banner — AC5 */}
          {hasActiveSession && (
            <View style={[styles.activeBanner, { backgroundColor: colors.errorContainer }]}>
              <Text style={{ color: colors.onErrorContainer, flex: 1 }}>
                You have an active session — finish it first, or log this set inside it.
              </Text>
              <Button
                variant="default"
                onPress={() => {
                  onDismiss();
                  onOpenActiveSession(activeSessionId!);
                }}
                style={styles.bannerBtn}
                accessibilityLabel="Open active session"
              >
                <Text style={{ color: colors.onPrimary }}>Open active session</Text>
              </Button>
            </View>
          )}

          {/* Edit drawer for selected exercise */}
          {editState && !hasActiveSession && (
            <View style={styles.editSection}>
              <Text variant="title" style={{ color: colors.onSurface, marginBottom: 16 }}>
                {editState.chip.exercise_name}
              </Text>
              <View style={styles.steppers}>
                <View style={styles.stepperGroup}>
                  <Text style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>Reps</Text>
                  <NumericStepper
                    value={editState.reps}
                    onValueChange={(v) => setEditState((s) => s ? { ...s, reps: v } : null)}
                    min={1}
                    step={1}
                    unit="reps"
                  />
                </View>
                <View style={styles.stepperGroup}>
                  <Text style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>Weight</Text>
                  <NumericStepper
                    value={editState.weight}
                    onValueChange={(v) => setEditState((s) => s ? { ...s, weight: v } : null)}
                    min={0}
                    step={step}
                    unit={unit}
                  />
                </View>
              </View>
              <Button
                variant="default"
                onPress={handleLogSet}
                style={styles.logBtn}
                accessibilityLabel={`Log set: ${editState.reps} reps of ${editState.chip.exercise_name}`}
                accessibilityHint="Announces result after logging"
              >
                <Text style={{ color: colors.onPrimary }}>
                  {committing ? "Logging…" : "Log set"}
                </Text>
              </Button>
              <Button
                variant="secondary"
                onPress={() => setEditState(null)}
                style={styles.cancelBtn}
                accessibilityLabel="Cancel edit, go back to exercise list"
              >
                <Text>Cancel</Text>
              </Button>
            </View>
          )}

          {/* Recent chips + pick exercise — hidden when active session present */}
          {!editState && (
            <>
              {loading ? (
                <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />
              ) : chips.length === 0 ? (
                <Text
                  style={[styles.emptyHint, { color: colors.onSurfaceVariant }]}
                  accessibilityRole="text"
                >
                  No recent exercises yet
                </Text>
              ) : (
                !hasActiveSession && (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}>
                      Recent
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipStrip}
                      accessible={false}
                    >
                      {chips.map((chip) => (
                        <Pressable
                          key={chip.exercise_id}
                          onPress={() => handleChipTap(chip)}
                          onLongPress={() => handleChipLongPress(chip)}
                          delayLongPress={400}
                          style={({ pressed }) => [
                            styles.chip,
                            {
                              backgroundColor: pressed
                                ? colors.primaryContainer
                                : colors.surfaceVariant,
                              borderColor: colors.outline,
                            },
                          ]}
                          accessible
                          accessibilityRole="button"
                          accessibilityLabel={
                            `${chip.exercise_name}, log a set, last logged ${chip.last_reps ?? 1} reps${chip.last_weight ? ` at ${chip.last_weight} kg` : ""}. Long press to edit.`
                          }
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          <Text
                            style={[styles.chipLabel, { color: colors.onSurface }]}
                            numberOfLines={1}
                          >
                            {chip.exercise_name}
                          </Text>
                          <Text
                            style={[styles.chipSub, { color: colors.onSurfaceVariant }]}
                            numberOfLines={1}
                          >
                            {chip.last_reps ?? 1} reps{chip.last_weight ? ` · ${chip.last_weight} kg` : ""}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                )
              )}

              <Button
                variant={hasActiveSession ? "secondary" : "default"}
                onPress={() => !hasActiveSession && setExercisePickerVisible(true)}
                disabled={hasActiveSession}
                style={styles.pickBtn}
                accessibilityLabel="Pick exercise to log a set"
              >
                <Text style={{ color: hasActiveSession ? colors.onSurface : colors.onPrimary }}>
                  + Pick exercise…
                </Text>
              </Button>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      <ExercisePickerSheet
        visible={exercisePickerVisible}
        onDismiss={() => setExercisePickerVisible(false)}
        onPick={handleExercisePick}
      />
    </>
  );
}

const CHIP_MIN_SIZE = 48;

const styles = StyleSheet.create({
  sheetContent: {
    padding: 16,
    paddingBottom: 32,
  },
  activeBanner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  bannerBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chipStrip: {
    gap: 8,
    paddingBottom: 4,
    paddingRight: 8,
  },
  chip: {
    minWidth: CHIP_MIN_SIZE,
    minHeight: CHIP_MIN_SIZE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  chipSub: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },
  editSection: {
    paddingVertical: 8,
  },
  steppers: {
    gap: 24,
    marginBottom: 24,
  },
  stepperGroup: {
    gap: 4,
  },
  logBtn: {
    minHeight: 56,
    borderRadius: radii.pill,
    marginBottom: 12,
  },
  cancelBtn: {
    minHeight: 44,
  },
  emptyHint: {
    textAlign: "center",
    marginVertical: 24,
  },
  pickBtn: {
    marginTop: 16,
    minHeight: 48,
  },
});
