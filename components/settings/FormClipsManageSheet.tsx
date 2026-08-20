/**
 * FormClipsManageSheet.tsx
 *
 * BLD-1105: Settings → Form clips manage sheet.
 *
 * Lists all clips grouped by exercise with per-row soft-delete and a footer
 * "Delete all clips" hard-delete that reclaims disk space immediately (AC7).
 *
 * AC8: hidden on web (caller guards with Platform.OS check on FormClipsStorageRow).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  listAllClipsGroupedByExercise,
  deleteAllClips,
  softDeleteClip,
  getStorageStats,
  type ClipGroupedByExercise,
} from "@/lib/media/form-clips";
import type { SetMediaRow } from "@/lib/db/form-clips";
import { fontSizes, radii } from "@/constants/design-tokens";
import { FormClipsPlayer } from "@/components/session/FormClipsPlayer";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import { ClipThumbImage } from "@/components/session/ClipThumbImage";

type Props = {
  isVisible: boolean;
  onClose: () => void;
  onClipsChanged?: () => void;
};

export function FormClipsManageSheet({ isVisible, onClose, onClipsChanged }: Props) {
  if (!isVisible || Platform.OS === "web") return null;
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <FormClipsManageSheetBody onClose={onClose} onClipsChanged={onClipsChanged} />
    </Modal>
  );
}

type BodyProps = {
  onClose: () => void;
  onClipsChanged?: () => void;
};

function FormClipsManageSheetBody({ onClose, onClipsChanged }: BodyProps) {
  const colors = useThemeColors();
  const [groups, setGroups] = useState<ClipGroupedByExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ totalBytes: number; count: number } | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [playerClip, setPlayerClip] = useState<SetMediaRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([listAllClipsGroupedByExercise(), getStorageStats()]);
      setGroups(g);
      setStats(s);
    } catch {
      // Non-fatal.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleDeleteClip = useCallback(async (clip: SetMediaRow) => {
    const dateStr = new Date(clip.created_at).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    Alert.alert(i18n._({ id: "settings.formClips.deleteTitle", message: "Delete clip" }), i18n._({ id: "settings.formClips.deleteMessage", message: "Delete clip from {date}?", values: { date: dateStr } }), [
      { text: i18n._({ id: "common.cancel", message: "Cancel" }), style: "cancel" },
      {
        text: i18n._({ id: "common.delete", message: "Delete" }),
        style: "destructive",
        onPress: async () => {
          try {
            await softDeleteClip(clip.id);
            await loadData();
            onClipsChanged?.();
          } catch {
            Alert.alert(i18n._({ id: "settings.formClips.deleteFailedTitle", message: "Couldn't delete clip" }), i18n._({ id: "settings.formClips.tryAgain", message: "Please try again." }));
          }
        },
      },
    ]);
  }, [loadData, onClipsChanged]);

  const handleDeleteAll = useCallback(async () => {
    const totalCount = groups.reduce((sum, g) => sum + g.clips.length, 0);
    Alert.alert(
      i18n._({ id: "settings.formClips.deleteAllTitle", message: "Delete all clips" }),
      i18n._({ id: "settings.formClips.deleteAllMessage", message: "Delete {count, plural, one {# clip} other {# clips}}? This permanently removes them from this device. This cannot be undone.", values: { count: totalCount } }),
      [
        { text: i18n._({ id: "common.cancel", message: "Cancel" }), style: "cancel" },
        {
          text: i18n._({ id: "settings.formClips.deleteAllAction", message: "Delete all" }),
          style: "destructive",
          onPress: async () => {
            setDeletingAll(true);
            try {
              await deleteAllClips();
              await loadData();
              onClipsChanged?.();
            } catch {
              Alert.alert(i18n._({ id: "settings.formClips.deleteAllFailedTitle", message: "Couldn't delete all clips" }), i18n._({ id: "settings.formClips.tryAgain", message: "Please try again." }));
            } finally {
              setDeletingAll(false);
            }
          },
        },
      ]
    );
  }, [groups, loadData, onClipsChanged]);

  const allClipCount = groups.reduce((sum, g) => sum + g.clips.length, 0);
  const mb = stats ? (stats.totalBytes / (1024 * 1024)).toFixed(1) : "…";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.outline }]}>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t({ id: "settings.formClips.title", message: "Form clips" })}</Text>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "settings.formClips.closeA11y", message: "Close form clips manage sheet" })}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Stats strip */}
      {stats !== null && (
        <View style={[styles.statsStrip, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[styles.statItem, { color: colors.onSurfaceVariant }]}>
            {mb} MB
          </Text>
          <Text style={[styles.statDivider, { color: colors.onSurfaceVariant }]}>·</Text>
          <Text style={[styles.statItem, { color: colors.onSurfaceVariant }]}>
            {i18n._({ id: "settings.formClips.clipCount", message: "{count, plural, one {# clip} other {# clips}}", values: { count: allClipCount } })}
          </Text>
          <Text style={[styles.statDivider, { color: colors.onSurfaceVariant }]}>·</Text>
          <Text style={[styles.statItem, { color: colors.onSurfaceVariant }]}>
            {i18n._({ id: "settings.formClips.exerciseCount", message: "{count, plural, one {# exercise} other {# exercises}}", values: { count: groups.length } })}
          </Text>
        </View>
      )}

      {/* Clip list */}
      {loading ? (
        <View style={styles.center}>
          <Text style={{ color: colors.onSurfaceVariant }}>{t({ id: "settings.formClips.loading", message: "Loading…" })}</Text>
        </View>
      ) : allClipCount === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="video-outline" size={40} color={colors.onSurfaceVariant} />
          <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>{t({ id: "settings.formClips.emptyTitle", message: "No clips recorded yet" })}</Text>
          <Text style={[styles.emptyBody, { color: colors.onSurfaceVariant }]}>
            {t({ id: "settings.formClips.emptyBody", message: "Record one from any exercise's Form clips tab." })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.exerciseId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ExerciseClipGroup
              group={item}
              onDeleteClip={handleDeleteClip}
              onPlayClip={setPlayerClip}
            />
          )}
        />
      )}

      {/* Footer: Delete all */}
      {allClipCount > 0 && (
        <View style={[styles.footer, { borderTopColor: colors.outline }]}>
          <Pressable
            style={[styles.deleteAllBtn, { backgroundColor: colors.errorContainer }, deletingAll && styles.deletingAllBtn]}
            onPress={handleDeleteAll}
            disabled={deletingAll}
            accessibilityRole="button"
            accessibilityLabel={i18n._({ id: "settings.formClips.deleteAllA11y", message: "Delete all {count} form clips", values: { count: allClipCount } })}
            accessibilityHint={i18n._({ id: "settings.formClips.deleteAllHint", message: "Permanently removes all clips from this device. This cannot be undone." })}
          >
            <MaterialCommunityIcons
              name="delete-sweep-outline"
              size={18}
              color={colors.onErrorContainer}
            />
            <Text style={[styles.deleteAllText, { color: colors.onErrorContainer }]}>
              {deletingAll ? t({ id: "common.deleting", message: "Deleting…" }) : t({ id: "settings.formClips.deleteAll", message: "Delete all clips" })}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Clip player — opened by tapping a thumbnail */}
      <FormClipsPlayer
        isVisible={playerClip !== null}
        clip={playerClip}
        onClose={() => setPlayerClip(null)}
        onDelete={(c) => { setPlayerClip(null); handleDeleteClip(c); }}
      />
    </View>
  );
}

type GroupProps = {
  group: ClipGroupedByExercise;
  onDeleteClip: (clip: SetMediaRow) => void;
  onPlayClip: (clip: SetMediaRow) => void;
};

function ExerciseClipGroup({ group, onDeleteClip, onPlayClip }: GroupProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.exerciseGroup}>
      <Text style={[styles.exerciseName, { color: colors.onSurface }]} numberOfLines={1}>
        {group.exerciseName}
      </Text>
      {group.clips.map((clip) => (
        <ClipRow key={clip.id} clip={clip} onDelete={onDeleteClip} onPlay={onPlayClip} />
      ))}
    </View>
  );
}

type ClipRowProps = {
  clip: SetMediaRow;
  onDelete: (clip: SetMediaRow) => void;
  onPlay: (clip: SetMediaRow) => void;
};

function ClipRow({ clip, onDelete, onPlay }: ClipRowProps) {
  const colors = useThemeColors();
  const dateStr = new Date(clip.created_at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const durationStr = clip.duration_ms
    ? i18n._({ id: "settings.formClips.durationSeconds", message: "{seconds}s", values: { seconds: Math.round(clip.duration_ms / 1000) } })
    : null;
  const sizeStr = clip.size_bytes
    ? clip.size_bytes > 1024 * 1024
      ? i18n._({ id: "settings.formClips.sizeMegabytes", message: "{size} MB", values: { size: (clip.size_bytes / (1024 * 1024)).toFixed(1) } })
      : i18n._({ id: "settings.formClips.sizeKilobytes", message: "{size} KB", values: { size: Math.round(clip.size_bytes / 1024) } })
    : null;

  return (
    <View style={[styles.clipRow, { borderBottomColor: colors.outline }]}>
      {/* Tappable thumbnail that opens the player */}
      <Pressable
        style={[styles.clipThumb, { backgroundColor: colors.surfaceVariant }]}
        onPress={() => onPlay(clip)}
        accessibilityRole="button"
        accessibilityLabel={i18n._({ id: "settings.formClips.playA11y", message: "Play clip from {date}", values: { date: dateStr } })}
      >
        <ClipThumbImage setId={clip.id} relPath={clip.rel_path} iconSize={20} />
      </Pressable>
      {/* Meta */}
      <View style={styles.clipMeta}>
        <Text style={[styles.clipDate, { color: colors.onSurface }]}>{dateStr}</Text>
        <Text style={[styles.clipSub, { color: colors.onSurfaceVariant }]}>
          {[durationStr, sizeStr].filter(Boolean).join(" · ") || t({ id: "settings.formClips.video", message: "video" })}
        </Text>
      </View>
      {/* Delete */}
      <Pressable
        style={styles.clipDeleteBtn}
        onPress={() => onDelete(clip)}
        accessibilityRole="button"
         accessibilityLabel={i18n._({ id: "settings.formClips.deleteA11y", message: "Delete clip from {date}", values: { date: dateStr } })}
         accessibilityHint={t({ id: "settings.formClips.deleteHint", message: "Removes this clip from your device" })}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  statItem: { fontSize: fontSizes.sm },
  statDivider: { fontSize: fontSizes.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  emptyTitle: { fontSize: fontSizes.base, fontWeight: "600" },
  emptyBody: { fontSize: fontSizes.sm, textAlign: "center" },
  listContent: { paddingBottom: 16 },
  exerciseGroup: { paddingTop: 12 },
  exerciseName: {
    fontSize: fontSizes.sm,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  clipRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  clipThumb: {
    width: 44,
    height: 44,
    borderRadius: radii.sm ?? 6,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  clipMeta: { flex: 1, gap: 2 },
  clipDate: { fontSize: fontSizes.sm, fontWeight: "500" },
  clipSub: { fontSize: fontSizes.xs },
  clipDeleteBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  deletingAllBtn: { opacity: 0.6 },
  deleteAllText: { fontSize: fontSizes.base, fontWeight: "600" },
});
