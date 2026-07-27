/* eslint-disable max-lines-per-function */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { PinnedExerciseNoteEditor } from "./PinnedExerciseNoteEditor";
import { BackfillNoteSuggestion } from "./BackfillNoteSuggestion";
import { LastNextRow } from "./LastNextRow";
import { SuggestionExplainerModal } from "./SuggestionExplainerModal";
import { PreferredSwapChip } from "./PreferredSwapChip";
import type { SetWithMeta, ExerciseGroup } from "./types";
import type { TrainingMode } from "../../lib/types";
import type { Suggestion } from "../../lib/rm";
import type { BreakThroughSuggestion } from "../../lib/plateau";

export type GroupCardHeaderProps = {
  group: ExerciseGroup;
  /**
   * BLD-560: per-group subscription slice. Previously this component received
   * the full `modes: Record<string, TrainingMode>` record, which caused every
   * group's header to re-render whenever ANY exercise's mode changed (the
   * Record reference busts shallow equality on every update). By narrowing
   * to the scalar mode value for *this* group, React.memo (see bottom of
   * this file) can skip re-renders when an unrelated exercise's mode
   * changes.
   *
   * Falls back to `group.training_modes[0]` when undefined.
   *
   * NOTE (BLD-850): retained to preserve the prop shape of downstream
   * tests and parent wiring even though the in-header mode pill was
   * removed. Mode-picker UI moves to the Details modal in a follow-up.
   */
  currentMode?: TrainingMode | undefined;
  exerciseNotesOpen?: boolean;
  exerciseNotesDraft?: string | undefined;
  /** BLD-1028: current draft of the pinned note (or undefined if not editing). */
  pinnedNoteDraft?: string;
  firstSet: SetWithMeta | undefined;
  previousPerformance?: string | null;
  previousPerformanceA11y?: string | null;
  previousSetupPhotoUri?: string | null;
  /** BLD-850: suggestion + step + onUpdate are now owned by the header so it
   *  can render the inline Last/Next row. They were previously routed through
   *  the standalone SuggestionChip rendered by `ExerciseGroupCard`. */
  suggestion?: Suggestion | null;
  step?: number;
  onUpdate?: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onModeChange?: (exerciseId: string, mode: TrainingMode) => void;
  onExerciseNotes?: (exerciseId: string, text: string) => void;
  onExerciseNotesDraftChange?: (exerciseId: string, text: string) => void;
  onToggleExerciseNotes?: (exerciseId: string) => void;
  /** BLD-1028 */
  onPinnedNoteDraftChange: (exerciseId: string, text: string) => void;
  onPinnedNoteSave: (exerciseId: string, text: string) => void;
  onBackfillCopy: (exerciseId: string, text: string) => void;
  onBackfillDismiss: (exerciseId: string) => void;
  onLoadBackfill: (exerciseId: string) => void;
  onShowDetail: (exerciseId: string) => void;
  onSwap: (exerciseId: string) => void;
  onDeleteExercise: (exerciseId: string) => void;
  onMoveUp?: (exerciseId: string) => void;
  onMoveDown?: (exerciseId: string) => void;
  onPrefill?: (exerciseId: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
  showMoveButtons?: boolean;
  /** BLD-1122: per-exercise plateau break-through hint */
  plateauHint?: BreakThroughSuggestion | null;
  /** BLD-1122: atomic apply callback for plateau break-through */
  onApplyBreakThrough?: (exerciseId: string, updates: { id: string; weight: number | null; reps: number | null }[]) => Promise<void>;
  /** BLD-1122: weight unit for break-through confirmation labels */
  unit?: "kg" | "lb";
  /** BLD-2561: resolved preferred substitute name (null = chip hidden). */
  preferredSubstituteName?: string | null;
  /** BLD-2561: whether this exercise has already been swapped to its preferred in this session. */
  isPreferredSwapApplied?: boolean;
  /** BLD-2561: name of the exercise that was swapped to (for post-swap undo label). */
  preferredSwappedToName?: string | null;
  /** BLD-2561: fast-path tap — apply preferred substitute immediately (no confirm). */
  onPreferredSwap?: (exerciseId: string) => void;
};

// eslint-disable-next-line complexity
function GroupCardHeaderInner({
  group,
  // currentMode is intentionally accepted but unused after BLD-850 (mode
  // picker moved out of the header). Kept on the type to preserve memo
  // semantics from BLD-560 and parent callsite stability.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currentMode: _currentMode,
  pinnedNoteDraft,
  previousPerformance,
  previousPerformanceA11y,
  previousSetupPhotoUri,
  suggestion,
  step,
  onUpdate,
  onPinnedNoteDraftChange,
  onPinnedNoteSave,
  onBackfillCopy,
  onBackfillDismiss,
  onLoadBackfill,
  onShowDetail,
  onSwap,
  onDeleteExercise,
  onMoveUp,
  onMoveDown,
  onPrefill,
  isFirst,
  isLast,
  showMoveButtons,
  plateauHint,
  onApplyBreakThrough,
  unit,
  preferredSubstituteName,
  isPreferredSwapApplied,
  preferredSwappedToName,
  onPreferredSwap,
}: GroupCardHeaderProps) {
  // BLD-560: dev-only render counter for memoization regression detection.
  // Metro strips the require + call-site in prod via __DEV__ DCE (matches the
  // pattern in lib/db/helpers.ts and scripts/verify-scenario-hook-not-in-bundle.sh).
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("../../lib/dev/render-counter") as typeof import("../../lib/dev/render-counter")).countRender("GroupCardHeader");
  }
  const colors = useThemeColors();
  const eid = group.exercise_id;
  const [explainerVisible, setExplainerVisible] = useState(false);
  // BLD-1028: local state for whether the pinned note editor is open.
  const [pinnedNoteOpen, setPinnedNoteOpen] = useState(false);
  const pinnedNoteValue = pinnedNoteDraft ?? group.pinnedNote ?? "";

  // Lazy-load backfill candidate once on mount (avoids per-exercise upfront cost).
  useEffect(() => {
    onLoadBackfill(eid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eid]);

  // Defensive: LastNextRow needs a numeric step + onUpdate. We default both to
  // safe no-ops so the header still renders if a parent (or test) hasn't
  // wired the suggestion path.
  const safeStep = step ?? 0;
  const safeOnUpdate = onUpdate ?? (() => {});

  const showLastNextRow = previousPerformance != null || suggestion != null;

  return (
    <>
      <View style={styles.headerWrap}>
        {/* Row 1: title alone */}
        <Pressable
          onLongPress={() => onDeleteExercise(eid)}
          delayLongPress={500}
          accessibilityLabel={`Remove ${group.name}`}
          accessibilityRole="button"
          accessibilityHint="Long press to remove exercise"
        >
          <Text
            variant="title"
            style={[styles.groupTitle, { color: colors.primary }]}
          >
            {group.name}
          </Text>
        </Pressable>

        {/* Row 2: Details (left) + controls (right) */}
        <View style={styles.actionsRow}>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onShowDetail(eid)}
            accessibilityLabel={`View ${group.name} details`}
            style={styles.detailsBtn}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons
                name="information-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Details</Text>
            </View>
          </Button>
          <View style={styles.controlsCluster}>
            {showMoveButtons && (
              <>
                <Pressable
                  onPress={() => onMoveUp?.(eid)}
                  disabled={isFirst}
                  accessibilityLabel={`Move ${group.name} up`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isFirst }}
                  hitSlop={4}
                  style={[styles.moveBtn, isFirst && styles.moveBtnDisabled]}
                >
                  <MaterialCommunityIcons
                    name="chevron-up"
                    size={28}
                    color={isFirst ? colors.outlineVariant : colors.onSurfaceVariant}
                  />
                </Pressable>
                <Pressable
                  onPress={() => onMoveDown?.(eid)}
                  disabled={isLast}
                  accessibilityLabel={`Move ${group.name} down`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLast }}
                  hitSlop={4}
                  style={[styles.moveBtn, isLast && styles.moveBtnDisabled]}
                >
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={28}
                    color={isLast ? colors.outlineVariant : colors.onSurfaceVariant}
                  />
                </Pressable>
              </>
            )}
            <Pressable
              onPress={() => onSwap(eid)}
              accessibilityLabel={`Swap ${group.name}`}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <MaterialCommunityIcons
                name="swap-horizontal"
                size={24}
                color={colors.onSurfaceVariant}
              />
            </Pressable>
            {/* BLD-1028: pinned note pencil icon */}
            <Pressable
              onPress={() => setPinnedNoteOpen((o) => !o)}
              accessibilityLabel={`Edit pinned note for ${group.name}`}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <MaterialCommunityIcons
                name={group.pinnedNote ? "pin" : "pin-outline"}
                size={24}
                color={group.pinnedNote ? colors.primary : colors.onSurfaceVariant}
              />
            </Pressable>
          </View>
        </View>

        {/* Row 3a: BLD-2561 preferred substitute fast-path chip.
            Renders when:
              (a) a resolved preferred name exists (idle + swap-ready state), OR
              (b) a preferred swap was just applied in this session (swapped+undo state)
                  — even if the target exercise itself has no preferred substitute.
            Placed between the icon row (Row 2) and the Last/Next row (Row 3)
            following the pinnedNotePreview placement pattern (ux-designer ruling). */}
        {(preferredSubstituteName || isPreferredSwapApplied) ? (
          <PreferredSwapChip
            preferredName={preferredSubstituteName ?? preferredSwappedToName ?? ""}
            exerciseName={group.name}
            isSwapped={isPreferredSwapApplied}
            swappedToName={preferredSwappedToName}
            onPress={() => onPreferredSwap?.(eid)}
          />
        ) : null}

        {/* Row 3: Last | Next */}
        {showLastNextRow && (
          <LastNextRow
            previousPerformance={previousPerformance}
            previousPerformanceA11y={previousPerformanceA11y}
            previousSetupPhotoUri={previousSetupPhotoUri}
            suggestion={suggestion ?? null}
            sets={group.sets}
            step={safeStep}
            onPrefillLast={() => onPrefill?.(eid)}
            onUpdate={(setId, field, val) => safeOnUpdate(setId, field, val)}
            onOpenExplainer={() => setExplainerVisible(true)}
            exerciseName={group.name}
            plateauHint={plateauHint}
            unit={unit}
            onApplyBreakThrough={
              onApplyBreakThrough
                ? (updates) => onApplyBreakThrough(eid, updates)
                : undefined
            }
          />
        )}
        {/* BLD-1028: pinned note read surface — always visible when a note exists */}
        {/* BLD-2386 Item A: removed persistent "+ Add pinned note" empty-state CTA.
            The pin-outline icon (above) is the sole affordance when no note exists.
            No tooltip/instructional chrome reintroduced. */}
        {!pinnedNoteOpen && group.pinnedNote ? (
          <Pressable
            onPress={() => setPinnedNoteOpen(true)}
            accessibilityLabel={`📌 Pinned note for ${group.name}: ${group.pinnedNote}`}
            accessibilityRole="button"
          >
            <Text style={[styles.pinnedNotePreview, { color: colors.onSurfaceVariant, borderColor: colors.outlineVariant }]}>
              📌 {group.pinnedNote}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <SuggestionExplainerModal
        visible={explainerVisible}
        onClose={() => setExplainerVisible(false)}
        plateauMode={plateauHint != null}
      />
      {/* BLD-1028: backfill suggestion chip */}
      {group.pinnedNoteBackfill && !group.pinnedNote && (
        <BackfillNoteSuggestion
          exerciseId={eid}
          exerciseName={group.name}
          candidateText={group.pinnedNoteBackfill.text}
          candidateDate={group.pinnedNoteBackfill.date}
          onCopy={(exId, text) => {
            onBackfillCopy(exId, text);
            setPinnedNoteOpen(false);
          }}
          onDismiss={onBackfillDismiss}
        />
      )}
      {/* BLD-1028: inline pinned note editor */}
      {pinnedNoteOpen && (
        <PinnedExerciseNoteEditor
          exerciseId={eid}
          exerciseName={group.name}
          value={pinnedNoteValue}
          onDraftChange={onPinnedNoteDraftChange}
          onSave={(exId, text) => {
            onPinnedNoteSave(exId, text);
            setPinnedNoteOpen(false);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 6, marginBottom: 8 },
  groupTitle: { fontWeight: "700" },

  // Row 2
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  detailsBtn: { marginLeft: -24 },
  controlsCluster: { flexDirection: "row", alignItems: "center" },
  // BLD-2386 Item C: padding 8→10 gives a visible 44×44dp box (24dp icon + 2×10 padding = 44dp).
  // hitSlop is unchanged at 8 so effective hit target is 60dp (≥WCAG 2.5.5).
  iconBtn: { padding: 10 },
  moveBtn: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  moveBtnDisabled: { opacity: 0.4 },
  // BLD-1028: pinned note
  pinnedNotePreview: {
    fontSize: 13,
    lineHeight: 18,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});

/**
 * BLD-560: wrapped in React.memo + narrowed currentMode prop so unrelated
 * exercise mode changes don't cascade re-renders across every group header.
 *
 * Measurement (jest harness: __tests__/components/session/GroupCardHeader.memo.test.tsx):
 *   Before: 11 renders per 10 unrelated-mode-change cycles (initial + 10).
 *   After:   1 render  per 10 unrelated-mode-change cycles (initial only).
 *   Delta:  -91% — well above the ≥30% bar in the BLD-560 QD pre-criteria.
 *
 * BLD-850: header now also owns `suggestion`, `step`, `onUpdate` as optional
 * props — these come from `ExerciseGroupCard` which already uses stable
 * callback identities (the session screen passes `onUpdate` via a ref-stable
 * handler, and `suggestion` is per-group / scalar). Memo-friendly by default.
 */
export const GroupCardHeader = React.memo(GroupCardHeaderInner);
