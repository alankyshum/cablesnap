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
 */
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
import { CompareView } from "./CompareView";
import type { SetMediaRow } from "@/lib/db/form-clips";
import { fontSizes, radii } from "@/constants/design-tokens";

type Props = {
  exerciseId: string;
  unit?: "kg" | "lb";
};

export function FormLibraryTab({ exerciseId }: Props) {
  const colors = useThemeColors();
  const [clips, setClips] = useState<SetMediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareClips, setCompareClips] = useState<[SetMediaRow, SetMediaRow] | null>(null);

  // AC12: increment replay-gate counter while thumbnail grid is mounted.
  useMediaSurfaceMounted();

  const loadClips = useCallback(async () => {
    if (Platform.OS === "web") {
      setClips([]);
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
  }, [exerciseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClips();
  }, [loadClips]);

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
    Alert.alert("Delete clip", "Delete this form clip? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await softDeleteClip(id);
          exitSelectMode();
          loadClips();
        },
      },
    ]);
  }, [exitSelectMode, loadClips]);

  const handleCompare = useCallback(() => {
    if (selected.size !== 2) return;
    const [idA, idB] = [...selected];
    const clipA = clips.find((c) => c.id === idA);
    const clipB = clips.find((c) => c.id === idB);
    if (clipA && clipB) {
      setCompareClips([clipA, clipB]);
    }
  }, [selected, clips]);

  const selectedClip = selected.size === 1
    ? clips.find((c) => c.id === [...selected][0])
    : undefined;

  if (Platform.OS === "web") {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>
            Form clips
          </Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primaryContainer }]}>
            <Text style={[styles.countBadgeText, { color: colors.onPrimaryContainer }]}>
              {loading ? "…" : clips.length}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={selectMode ? exitSelectMode : enterSelectMode}
          accessibilityRole="button"
          accessibilityLabel={selectMode ? "Exit select mode" : "Select clips"}
          hitSlop={8}
        >
          <Text style={[styles.selectToggle, { color: colors.primary }]}>
            {selectMode ? "Done" : "Select"}
          </Text>
        </Pressable>
      </View>

      {/* Select-mode CTAs */}
      {selectMode && (
        <View style={styles.selectActions}>
          {selected.size === 2 && (
            <Pressable
              style={[styles.cta, { backgroundColor: colors.primary }]}
              onPress={handleCompare}
              accessibilityRole="button"
              accessibilityLabel="Compare selected clips"
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>Compare</Text>
            </Pressable>
          )}
          {selected.size === 1 && selectedClip && (
            <Pressable
              style={[styles.cta, { backgroundColor: colors.errorContainer }]}
              onPress={() => handleDelete(selectedClip.id)}
              accessibilityRole="button"
              accessibilityLabel="Delete selected clip"
            >
              <Text style={{ color: colors.onErrorContainer, fontWeight: "600" }}>Delete</Text>
            </Pressable>
          )}
          {selected.size === 0 && (
            <Text style={[styles.selectHint, { color: colors.onSurfaceVariant }]}>
              Tap a clip to select (max 2 for compare)
            </Text>
          )}
        </View>
      )}

      {/* Grid or empty state */}
      {!loading && clips.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="video-outline" size={40} color={colors.onSurfaceVariant} />
          <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
            No clips yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.onSurfaceVariant }]}>
            Tap the video icon on a completed set to record one
          </Text>
        </View>
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
              onPress={selectMode ? () => toggleSelect(item.id) : undefined}
              onLongPress={!selectMode ? () => { enterSelectMode(); toggleSelect(item.id); } : undefined}
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
          onClose={() => setCompareClips(null)}
        />
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
};

function ClipThumbnail({ clip, selectMode, selected, onPress, onLongPress }: ThumbnailProps) {
  const colors = useThemeColors();
  const dateStr = new Date(clip.created_at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <Pressable
      style={[
        styles.thumb,
        { backgroundColor: colors.surfaceVariant, borderColor: selected ? colors.primary : colors.outline },
        selected && { borderWidth: 2 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Clip from ${dateStr}${selectMode ? (selected ? ", selected" : ", not selected") : ""}`}
      accessibilityState={selectMode ? { selected } : undefined}
    >
      {/* Placeholder — real thumbnail generation deferred to post-save */}
      <View style={styles.thumbPlaceholder}>
        <MaterialCommunityIcons name="video" size={24} color={colors.onSurfaceVariant} />
      </View>
      <View style={[styles.thumbOverlay, { backgroundColor: "rgba(0,0,0,0.35)" }]}>
        <Text style={styles.thumbDate}>{dateStr}</Text>
        {clip.duration_ms && (
          <Text style={styles.thumbDuration}>{Math.round(clip.duration_ms / 1000)}s</Text>
        )}
      </View>
      {selectMode && (
        <View style={[styles.checkOverlay, selected && { backgroundColor: colors.primary }]}>
          {selected && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: fontSizes.base, fontWeight: "600" },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: { fontSize: fontSizes.xs, fontWeight: "700" },
  selectToggle: { fontSize: fontSizes.sm, fontWeight: "600" },
  selectActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  grid: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 32 },
  row: { gap: 8, marginBottom: 8 },
  thumb: {
    flex: 1,
    aspectRatio: 9 / 16,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
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
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  thumbDate: { color: "#fff", fontSize: 10 },
  thumbDuration: { color: "rgba(255,255,255,0.8)", fontSize: 10 },
  checkOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
