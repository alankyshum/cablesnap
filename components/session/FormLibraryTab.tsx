import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
/**
 * FormLibraryTab.tsx
 *
 * "Form clips" tab rendered inside ExerciseDetailDrawer.
 * Shows a reverse-chrono thumbnail grid with a count badge.
 * Has an explicit "Select" / "Compare" mode toggle in the header.
 *
 * AC3: count badge visible even when count is 0 (empty state).
 * AC4: Select mode with checkboxes; selecting two enables Compare CTA;
 *      selecting one shows Delete. Long-press also enters Select mode.
 * useMediaSurfaceMounted() called at root (AC12 Sentry gate).
 *
 * Dev-only harness bypass: when `window.__FORM_CLIPS_HARNESS__` is set in a
 * `__DEV__` + web context (see `app/__test__/form-clips.tsx`), the three
 * `Platform.OS === "web"` early-returns are skipped and state is hydrated
 * directly from the seed object. Metro DCE removes this branch in production.
 */
/* eslint-disable max-lines */
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useMediaSurfaceMounted } from "@/hooks/useMediaSurfaceMounted";
import { getClipsForExercise, softDeleteClip } from "@/lib/media/form-clips";
import { getMostRecentCompletedSetForExercise } from "@/lib/db/session-sets";
import { CompareView } from "./CompareView";
import { FormClipsPlayer } from "./FormClipsPlayer";
import { ClipThumbImage } from "./ClipThumbImage";
import { FormVideoSheet } from "./FormVideoSheet";
import type { SetMediaRow } from "@/lib/db/form-clips";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";

type SheetProps = {
  setId: string;
  setNumber: number;
  mode: "replace" | "add";
  visible: boolean;
  replaceTarget?: { id: string; rel_path: string };
};

function computeSheetProps(
  replaceTarget: { id: string; rel_path: string } | null,
  replaceSetId: string | null,
  replaceSetNumber: number,
  recordTarget: { id: string; set_number: number; completed_at: number } | null,
  recordSheetVisible: boolean,
): SheetProps {
  return {
    setId: replaceTarget ? (replaceSetId ?? "") : (recordTarget?.id ?? ""),
    setNumber: replaceTarget ? replaceSetNumber : (recordTarget?.set_number ?? 1),
    mode: replaceTarget ? "replace" : "add",
    visible: recordSheetVisible && Boolean(replaceTarget ? replaceSetId : recordTarget),
    replaceTarget: replaceTarget ?? undefined,
  };
}

type Props = {
  exerciseId: string;
  unit?: "kg" | "lb";
  onClipsChanged?: () => void;
};

export function FormLibraryTab({ exerciseId, onClipsChanged }: Props) {
  const colors = useThemeColors();
  const [clips, setClips] = useState<SetMediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareClips, setCompareClips] = useState<[SetMediaRow, SetMediaRow] | null>(null);
  const [playerClip, setPlayerClip] = useState<SetMediaRow | null>(null);

  // BLD-1105: Record CTA state.
  // recordTargetResolved=false means the async resolution hasn't completed yet (hide CTA).
  type RecordTarget = { id: string; set_number: number; completed_at: number };
  const [recordTargetResolved, setRecordTargetResolved] = useState(false);
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
  const [recordDisabledReason, setRecordDisabledReason] = useState<"no_sets" | "all_have_clips" | null>(null);
  const [recordSheetVisible, setRecordSheetVisible] = useState(false);

  // BLD-1105: Replace overflow state
  const [replaceTarget, setReplaceTarget] = useState<{ id: string; rel_path: string } | null>(null);
  const [replaceSetId, setReplaceSetId] = useState<string | null>(null);
  const [replaceSetNumber, setReplaceSetNumber] = useState<number>(1);

  // Dev-only harness bypass (BLD-1123). Metro DCE folds this to false in prod
  // because it is inside an `if (__DEV__)` branch in the caller harness and
  // the string `__FORM_CLIPS_HARNESS__` never leaks to the production bundle
  // (enforced by scripts/verify-scenario-hook-not-in-bundle.sh).
  const harnessActive =
    __DEV__ &&
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>)["__FORM_CLIPS_HARNESS__"] != null;

  // AC12: increment replay-gate counter while thumbnail grid is mounted.
  useMediaSurfaceMounted();

  const loadClips = useCallback(async () => {
    if (Platform.OS === "web" && !harnessActive) {
      setClips([]);
      setLoading(false);
      return;
    }
    if (harnessActive) {
      // Hydrate from harness seed — no native data-layer call.
      const seed = (window as unknown as Record<string, unknown>)[
        "__FORM_CLIPS_HARNESS__"
      ] as { clips: SetMediaRow[] };
      setClips(seed.clips ?? []);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await getClipsForExercise(exerciseId);
      setClips(rows);
    } catch {
      // Non-fatal.
    } finally {
      setLoading(false);
    }
  }, [exerciseId, harnessActive]);

  // BLD-1105: Resolve record target on mount + after clips change.
  const loadRecordTarget = useCallback(async () => {
    if (Platform.OS === "web" && !harnessActive) return;
    if (harnessActive) {
      // Hydrate from harness seed — no native data-layer call.
      const seed = (window as unknown as Record<string, unknown>)[
        "__FORM_CLIPS_HARNESS__"
      ] as {
        recordTarget: { id: string; set_number: number; completed_at: number } | null;
        recordDisabledReason: "no_sets" | "all_have_clips" | null;
      };
      setRecordTarget(seed.recordTarget ?? null);
      setRecordDisabledReason(seed.recordDisabledReason ?? null);
      setRecordTargetResolved(true);
      return;
    }
    try {
      // Check if any completed kind='workout' sets exist at all.
      const anySet = await getMostRecentCompletedSetForExercise(exerciseId);
      if (!anySet) {
        setRecordTarget(null);
        setRecordDisabledReason("no_sets");
        setRecordTargetResolved(true);
        return;
      }
      // Check if any free (no clip) set exists.
      const freeSet = await getMostRecentCompletedSetForExercise(exerciseId, { mustHaveNoClip: true });
      if (!freeSet) {
        setRecordTarget(null);
        setRecordDisabledReason("all_have_clips");
        setRecordTargetResolved(true);
        return;
      }
      setRecordTarget(freeSet);
      setRecordDisabledReason(null);
      setRecordTargetResolved(true);
    } catch {
      // Non-fatal — hide CTA.
      setRecordTargetResolved(true);
    }
  }, [exerciseId, harnessActive]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClips();
  }, [loadClips]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecordTarget();
  }, [loadRecordTarget]);

  const handleClipSaved = useCallback(() => {
    loadClips();
    loadRecordTarget();
    onClipsChanged?.();
  }, [loadClips, loadRecordTarget, onClipsChanged]);

  const enterSelectMode = useCallback(() => {
    setSelectMode(true);
    setSelected(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    Alert.alert(t({ id: "session.formlibrarytab.str17", message: "Delete clip" }), t({ id: "session.formlibrarytab.str18", message: "Delete this form clip? This cannot be undone." }), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await softDeleteClip(id);
          exitSelectMode();
          loadClips();
          loadRecordTarget();
          onClipsChanged?.();
        },
      },
    ]);
  }, [exitSelectMode, loadClips, loadRecordTarget, onClipsChanged]);

  const handleOverflowReplace = useCallback((clip: SetMediaRow) => {
    setReplaceTarget({ id: clip.id, rel_path: clip.rel_path });
    setReplaceSetId(clip.set_id);
    setReplaceSetNumber(1); // set_number not stored on clip; use placeholder
    setRecordSheetVisible(true);
  }, []);

  const handleCompare = useCallback(() => {
    if (selected.size !== 2) return;
    const [idA, idB] = [...selected];
    const clipA = clips.find((c) => c.id === idA);
    const clipB = clips.find((c) => c.id === idB);
    if (clipA && clipB) {
      setCompareClips([clipA, clipB]);
    }
  }, [selected, clips]);

  // Pre-compute sheet + selection state.
  const selectedClip = selected.size === 1 ? clips.find((c) => c.id === [...selected][0]) : undefined;
  const sheet = computeSheetProps(replaceTarget, replaceSetId, replaceSetNumber, recordTarget, recordSheetVisible);

  if (Platform.OS === "web" && !harnessActive) {
    return null;
  }

  const recordCTAEnabled = recordTarget !== null;
  const isRecordTargetResolved = recordTargetResolved;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t({ id: "session.formlibrarytab.str7", message: "Form clips" })}</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primaryContainer }]}>
            <Text style={[styles.countBadgeText, { color: colors.onPrimaryContainer }]}>
              {loading ? "…" : clips.length}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <RecordCTAButton
            isResolved={isRecordTargetResolved}
            isEnabled={recordCTAEnabled}
            reason={recordDisabledReason}
            onRecord={() => setRecordSheetVisible(true)}
          />
          <Pressable
            onPress={selectMode ? exitSelectMode : enterSelectMode}
            accessibilityRole="button"
            accessibilityLabel={selectMode ? "Exit select mode" : "Select clips"}
            style={styles.selectTogglePressable}
          >
            <Text style={[styles.selectToggle, { color: colors.primary }]}>
              {selectMode ? "Done" : "Select"}
            </Text>
          </Pressable>
        </View>
      </View>

      <RecordHelperText
        isResolved={isRecordTargetResolved}
        isEnabled={recordCTAEnabled}
        reason={recordDisabledReason}
        hasClips={clips.length > 0}
      />

      <SelectActionsBar
        isVisible={selectMode}
        selectedCount={selected.size}
        selectedClip={selectedClip}
        onCompare={handleCompare}
        onDelete={handleDelete}
      />

      {/* Grid or empty state */}
      {!loading && clips.length === 0 ? (
        <LibraryEmptyState
          isResolved={isRecordTargetResolved}
          isEnabled={recordCTAEnabled}
          recordTarget={recordTarget}
          reason={recordDisabledReason}
          onRecord={() => setRecordSheetVisible(true)}
        />
      ) : (
        <FlatList
          data={clips}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <ClipThumbnail
              clip={item}
              selectMode={selectMode}
              selected={selected.has(item.id)}
              onPress={selectMode ? () => toggleSelect(item.id) : () => setPlayerClip(item)}
              onLongPress={!selectMode ? () => { enterSelectMode(); toggleSelect(item.id); } : undefined}
              onReplace={!selectMode ? () => handleOverflowReplace(item) : undefined}
              onDelete={!selectMode ? () => handleDelete(item.id) : undefined}
            />
          )}
          contentContainerStyle={styles.grid}
        />
      )}

      {/* Compare view */}
      {compareClips && (
        <CompareView
          isVisible
          clipA={compareClips[0]}
          clipB={compareClips[1]}
          exerciseId={exerciseId}
          onClose={() => setCompareClips(null)}
        />
      )}

      {/* BLD-1105: Record / Replace sheet */}
      <FormVideoSheet
        isVisible={sheet.visible}
        setId={sheet.setId}
        exerciseId={exerciseId}
        setNumber={sheet.setNumber}
        mode={sheet.mode}
        replaceTarget={sheet.replaceTarget}
        onClose={() => {
          setRecordSheetVisible(false);
          setReplaceTarget(null);
          setReplaceSetId(null);
        }}
        onClipSaved={(clipId) => {
          setRecordSheetVisible(false);
          setReplaceTarget(null);
          setReplaceSetId(null);
          handleClipSaved();
          void clipId; // consumed upstream
        }}
      />
      {/* Clip player — opened by tapping a thumbnail */}
      <FormClipsPlayer
        isVisible={playerClip !== null}
        clip={playerClip}
        onClose={() => setPlayerClip(null)}
        onDelete={(c) => { setPlayerClip(null); handleDelete(c.id); }}
        siblingClipCount={clips.length}
      />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type RecordCTAButtonProps = {
  isResolved: boolean;
  isEnabled: boolean;
  reason: "no_sets" | "all_have_clips" | null;
  onRecord: () => void;
};

function RecordCTAButton({ isResolved, isEnabled, reason, onRecord }: RecordCTAButtonProps) {
  const colors = useThemeColors();
  if (!isResolved) return null;
  const hint = reason === "no_sets"
    ? "Log a workout set first to attach a form clip."
    : reason === "all_have_clips"
    ? "Replace or delete an existing clip below to record a new one."
    : undefined;
  const iconColor = isEnabled ? colors.onPrimary : colors.onSurfaceVariant;
  return (
    <Pressable
      onPress={isEnabled ? onRecord : undefined}
      accessibilityRole="button"
      accessibilityLabel={t({ id: "session.formlibrarytab.str1", message: "Record new form clip" })}
      accessibilityState={{ disabled: !isEnabled }}
      accessibilityHint={hint}
      hitSlop={8}
      style={[
        styles.recordCTA,
        isEnabled
          ? // BLD-4036: add a luminance-based border on the enabled state so the
            // button edge is distinguishable from the header surface under all CVD
            // modes (including protanopia, where the coral #FF6038 background loses
            // hue contrast against light surfaces).  The secondary token (#1A2138)
            // is a near-black navy that provides >7:1 luminance contrast against
            // the coral fill regardless of colour-vision type.
            { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.secondary }
          : [styles.recordCTADisabled, { borderColor: colors.outline }],
      ]}
      disabled={!isEnabled}
    >
      <MaterialCommunityIcons name="video-plus-outline" size={16} color={iconColor} />
      <Text style={[styles.recordCTAText, { color: iconColor }]}>{t({ id: "session.formlibrarytab.str8", message: "Record" })}</Text>
    </Pressable>
  );
}

type RecordHelperTextProps = {
  isResolved: boolean;
  isEnabled: boolean;
  reason: "no_sets" | "all_have_clips" | null;
  hasClips: boolean;
};

function RecordHelperText({ isResolved, isEnabled, reason, hasClips }: RecordHelperTextProps) {
  const colors = useThemeColors();
  if (!isResolved || isEnabled || !reason || !hasClips) return null;
  const copy = reason === "no_sets"
    ? "Log a workout set first to attach a form clip."
    : "Replace or delete an existing clip below to record a new one.";
  return (
    <View style={[styles.recordHelperBanner, { backgroundColor: colors.surfaceVariant }]}>
      <Text style={[styles.recordHelperText, { color: colors.onSurface }]}>{copy}</Text>
    </View>
  );
}

type SelectActionsBarProps = {
  isVisible: boolean;
  selectedCount: number;
  selectedClip?: SetMediaRow;
  onCompare: () => void;
  onDelete: (id: string) => void;
};

function SelectActionsBar({ isVisible, selectedCount, selectedClip, onCompare, onDelete }: SelectActionsBarProps) {
  const colors = useThemeColors();
  if (!isVisible) return null;
  return (
    <View style={styles.selectActions}>
      {selectedCount === 2 && (
        <Pressable
          style={[styles.cta, { backgroundColor: colors.primary }]}
          onPress={onCompare}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "session.formlibrarytab.str2", message: "Compare selected clips" })}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t({ id: "session.formlibrarytab.str9", message: "Compare" })}</Text>
        </Pressable>
      )}
      {selectedCount === 1 && selectedClip && (
        <Pressable
          style={[styles.cta, { backgroundColor: colors.errorContainer }]}
          onPress={() => onDelete(selectedClip.id)}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "session.formlibrarytab.str3", message: "Delete selected clip" })}
        >
          <Text style={{ color: colors.onErrorContainer, fontWeight: "600" }}>{t({ id: "session.formlibrarytab.str10", message: "Delete" })}</Text>
        </Pressable>
      )}
      {selectedCount === 0 && (
        <Text style={[styles.selectHint, { color: colors.onSurfaceVariant }]}>{t({ id: "session.formlibrarytab.str11", message: "Tap a clip to select (max 2 for compare)" })}</Text>
      )}
    </View>
  );
}

type LibraryEmptyStateProps = {
  isResolved: boolean;
  isEnabled: boolean;
  recordTarget: { id: string; set_number: number; completed_at: number } | null;
  reason: "no_sets" | "all_have_clips" | null;
  onRecord: () => void;
};

function LibraryEmptyState({ isResolved, isEnabled, recordTarget, reason, onRecord }: LibraryEmptyStateProps) {
  const colors = useThemeColors();
  const subtextCopy = reason === "no_sets"
    ? "Log a workout set first to attach a form clip."
    : reason === "all_have_clips"
    ? "Replace or delete an existing clip to record a new one."
    : "Tap the video icon on a completed set to record one";
  return (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="video-outline" size={40} color={colors.onSurfaceVariant} />
      <Text style={[styles.emptyText, { color: colors.onSurface }]}>{t({ id: "session.formlibrarytab.str12", message: "No clips yet" })}</Text>
      {isResolved && isEnabled && recordTarget ? (
        <Pressable
          style={[
            styles.emptyRecordBtn,
            {
              backgroundColor: colors.primary,
              borderColor: colors.onPrimary,
            },
          ]}
          onPress={onRecord}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "session.formlibrarytab.str4", message: "Record a clip" })}
        >
          {/*
            BLD-4099 — CVD/contrast hardening for the empty-state 'Record a clip' button.
            
            Light Theme (brand coral #FF6038 fill + #1A2138 border vs #FAFAFA background):
              - Text-on-fill: overridden to #101524 to pass 4.5:1 WCAG AA across all modes:
                  Normal: 6.05:1 | Protanopia: 9.03:1 | Deuteranopia: 11.11:1 | Tritanopia: 4.90:1
              - Border-vs-background (non-text 3:1):
                  Normal: 15.26:1 | Protanopia: 15.81:1 | Deuteranopia: 15.98:1 | Tritanopia: 13.66:1
              - Border-vs-fill (non-text 3:1):
                  Normal: 5.30:1 | Protanopia: 8.04:1 | Deuteranopia: 9.92:1 | Tritanopia: 4.08:1

            Dark Theme (#FF7A55 fill + #1A2138 border vs #0D1117 background):
              - Text-on-fill (colors.onPrimary):
                  Normal: 6.19:1 | Protanopia: 9.09:1 | Deuteranopia: 10.86:1 | Tritanopia: 4.79:1
              - Fill-vs-background (non-text 3:1):
                  Normal: 7.36:1 | Protanopia: 5.24:1 | Deuteranopia: 7.12:1 | Tritanopia: 6.66:1
              - Fill-vs-border (non-text 3:1):
                  Normal: 6.19:1 | Protanopia: 9.09:1 | Deuteranopia: 10.86:1 | Tritanopia: 4.79:1
          */}
          <Text
            style={{
              color: colors.background === "#0D1117" ? colors.onPrimary : "#101524",
              fontWeight: "600",
            }}
          >{t({ id: "session.formlibrarytab.str13", message: "Record a clip" })}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.emptySubtext, { color: colors.onSurfaceVariant }]}>{subtextCopy}</Text>
      )}
    </View>
  );
}

type ThumbnailProps = {
  clip: SetMediaRow;
  selectMode: boolean;
  selected: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onReplace?: () => void;
  onDelete?: () => void;
};

function ClipThumbnail({ clip, selectMode, selected, onPress, onLongPress, onReplace, onDelete }: ThumbnailProps) {
  const colors = useThemeColors();
  const [menuVisible, setMenuVisible] = useState(false);
  const dateStr = new Date(clip.created_at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  const handleOverflowPress = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handleReplace = useCallback(() => {
    setMenuVisible(false);
    onReplace?.();
  }, [onReplace]);

  const handleDelete = useCallback(() => {
    setMenuVisible(false);
    onDelete?.();
  }, [onDelete]);

  return (
    <View style={[
      styles.thumb,
      { backgroundColor: colors.surfaceVariant, borderColor: selected ? colors.primary : colors.outline },
      selected && { borderWidth: 2 },
    ]}>
      <Pressable
        style={styles.thumbPressable}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={selectMode
          ? selected
            ? i18n._({ id: "session.formlibrarytab.dynamic1-v2-selected", message: "Clip from {date}, selected", values: { date: dateStr } })
            : i18n._({ id: "session.formlibrarytab.dynamic1-v2-not-selected", message: "Clip from {date}, not selected", values: { date: dateStr } })
          : i18n._({ id: "session.formlibrarytab.dynamic1-v2", message: "Clip from {date}", values: { date: dateStr } })}
        accessibilityState={selectMode ? { selected } : undefined}
      >
        {/* Real thumbnail from expo-video-thumbnails, cached */}
        <ClipThumbImage setId={clip.id} relPath={clip.rel_path} />
        <View style={[styles.thumbOverlay, { backgroundColor: "rgba(0,0,0,0.35)" }]}>
          <Text style={styles.thumbDate}>{dateStr}</Text>
          {clip.duration_ms && (
            <Text style={styles.thumbDuration}>{Math.round(clip.duration_ms / 1000)}s</Text>
          )}
        </View>
        {/* BLD-2724: dark fill on unselected so dot is visible on light card bg */}
        {selectMode && (
          <View style={[styles.checkOverlay, selected ? { backgroundColor: colors.primary } : styles.checkOverlayUnselected]}>
            {selected && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
          </View>
        )}
      </Pressable>
      {/* BLD-1105: Per-clip overflow button (hidden in select mode) */}
      {!selectMode && (onReplace || onDelete) && (
        <Pressable
          style={[styles.overflowBtn, { backgroundColor: "rgba(0,0,0,0.45)" }]}
          onPress={handleOverflowPress}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "session.formlibrarytab.dynamic2", message: `More options for clip from ${dateStr}` })}
          hitSlop={4}
        >
          <MaterialCommunityIcons name="dots-vertical" size={16} color="#fff" />
        </Pressable>
      )}
      <ClipOverflowMenu
        visible={menuVisible}
        dateStr={dateStr}
        onReplace={onReplace ? handleReplace : undefined}
        onDelete={onDelete ? handleDelete : undefined}
        onClose={() => setMenuVisible(false)}
      />
    </View>
  );
}

type OverflowMenuProps = {
  visible: boolean;
  dateStr: string;
  onReplace?: () => void;
  onDelete?: () => void;
  onClose: () => void;
};

function ClipOverflowMenu({ visible, dateStr, onReplace, onDelete, onClose }: OverflowMenuProps) {
  const colors = useThemeColors();
  if (!visible) return null;
  return (
    <View style={[styles.overflowMenu, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
      {onReplace && (
        <Pressable
          style={styles.overflowMenuItem}
          onPress={onReplace}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "session.formlibrarytab.dynamic3", message: `Replace clip from ${dateStr}` })}
        >
          <MaterialCommunityIcons name="refresh" size={16} color={colors.onSurface} />
          <Text style={[styles.overflowMenuText, { color: colors.onSurface }]}>{t({ id: "session.formlibrarytab.str14", message: "Replace" })}</Text>
        </Pressable>
      )}
      {onDelete && (
        <Pressable
          style={styles.overflowMenuItem}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "session.formlibrarytab.dynamic4", message: `Delete clip from ${dateStr}` })}
          accessibilityHint={t({ id: "session.formlibrarytab.str5", message: "Permanently removes this clip from your device" })}
        >
          <MaterialCommunityIcons name="delete-outline" size={16} color={colors.error} />
          <Text style={[styles.overflowMenuText, { color: colors.error }]}>{t({ id: "session.formlibrarytab.str15", message: "Delete" })}</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.overflowMenuItem}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t({ id: "session.formlibrarytab.str6", message: "Cancel" })}
      >
        <Text style={[styles.overflowMenuText, { color: colors.onSurfaceVariant }]}>{t({ id: "session.formlibrarytab.str16", message: "Cancel" })}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: fontSizes.base, fontWeight: "600" },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  countBadgeText: { fontSize: fontSizes.xs, fontWeight: "700" },
  selectTogglePressable: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  selectToggle: { fontSize: fontSizes.sm, fontWeight: "600" },
  recordCTA: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.md,
  },
  recordCTADisabled: { backgroundColor: "transparent", borderWidth: 1 },
  recordCTAText: { fontSize: fontSizes.xs, fontWeight: "600" },
  recordHelperBanner: {
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  recordHelperText: {
    fontSize: fontSizes.xs,
  },
  selectActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    alignItems: "center",
  },
  cta: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  selectHint: { fontSize: fontSizes.xs },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  emptyText: { fontSize: fontSizes.base, fontWeight: "600" },
  emptySubtext: { fontSize: fontSizes.sm, textAlign: "center" },
  emptyRecordBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.md,
    marginTop: 4,
    borderWidth: 1,
  },
  grid: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 32 },
  // BLD-2741: Use space-between + fixed 48% width instead of gap+flex:1.
  // Under react-native-web@0.21, gap+flex:1 in a FlatList columnWrapperStyle
  // over-allocates the right cell past the container's right padding, leaving
  // the right card flush to the viewport edge. space-between distributes the
  // two 48% cards evenly, giving symmetric ~12px gutters on both sides.
  // Two 48% cards = 96% of the 366px inner width (390-24 padding) → ~4% (~14px)
  // centre gap, with ~7px natural left/right margins from space-between.
  // This is cross-platform: RN native honours both width:"48%" and
  // justifyContent:"space-between" identically to web.
  row: { justifyContent: "space-between", marginBottom: 8 },
  thumb: {
    width: "48%",
    aspectRatio: 9 / 16,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  thumbPressable: { flex: 1 },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  thumbDate: { color: "white", fontSize: 10 },
  thumbDuration: { color: "rgba(255,255,255,0.8)", fontSize: 10 },
  // BLD-2724: 22→24px; dark fill for unselected state on light card bg.
  checkOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOverlayUnselected: { backgroundColor: "rgba(0,0,0,0.45)" },
  overflowBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  overflowMenu: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: 20,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 4,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  overflowMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  overflowMenuText: { fontSize: fontSizes.sm },
});
