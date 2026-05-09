/**
 * FormClipsStorageRow.tsx
 *
 * Settings → Storage row showing total clip size + count plus setup-photo usage.
 * BLD-1105: Now tappable — opens FormClipsManageSheet for per-clip and bulk delete.
 *
 * AC8: total MB and count derived from set_media.size_bytes sum.
 * AC16: hidden on web.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getStorageStats } from "@/lib/media/form-clips";
import { getSetupPhotoStats } from "@/lib/media/setup-photos";
import { fontSizes } from "@/constants/design-tokens";
import { FormClipsManageSheet } from "./FormClipsManageSheet";

type Props = {
  onClipsChanged?: () => void;
};

export function FormClipsStorageRow({ onClipsChanged }: Props) {
  const colors = useThemeColors();
  const [stats, setStats] = useState<{
    clips: { totalBytes: number; count: number };
    setupPhotos: { totalBytes: number; count: number };
  } | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [clips, setupPhotos] = await Promise.all([getStorageStats(), getSetupPhotoStats()]);
      setStats({ clips, setupPhotos });
    } catch {
      // Non-fatal.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
  }, [loadStats]);

  const handleSheetClose = useCallback(() => {
    setSheetVisible(false);
    loadStats();
    onClipsChanged?.();
  }, [loadStats, onClipsChanged]);

  const handleClipsChanged = useCallback(() => {
    loadStats();
    onClipsChanged?.();
  }, [loadStats, onClipsChanged]);

  if (Platform.OS === "web") return null;

  const clipMb = stats ? (stats.clips.totalBytes / (1024 * 1024)).toFixed(1) : "…";
  const clipCount = stats?.clips.count ?? 0;
  const setupMb = stats ? (stats.setupPhotos.totalBytes / (1024 * 1024)).toFixed(1) : "…";
  const setupCount = stats?.setupPhotos.count ?? 0;

  return (
    <>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.outline }]}
        onPress={() => setSheetVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Manage form clips"
        accessibilityHint="Opens a list of all recorded form clips where you can delete individual or all clips"
      >
        <MaterialCommunityIcons
          name="video-outline"
          size={22}
          color={colors.onSurfaceVariant}
          style={styles.icon}
        />
        <View style={styles.info}>
          <Text style={[styles.label, { color: colors.onSurface }]}>Form clips</Text>
          <Text style={[styles.sub, { color: colors.onSurfaceVariant }]}>
            {stats === null ? "Loading…" : `${clipMb} MB across ${clipCount} clip${clipCount !== 1 ? "s" : ""}`}
          </Text>
          <Text style={[styles.sub, { color: colors.onSurfaceVariant }]}>
            {stats === null ? "Loading…" : `Setup photos: ${setupMb} MB across ${setupCount} photo${setupCount !== 1 ? "s" : ""}`}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={colors.onSurfaceVariant}
        />
      </Pressable>

      <FormClipsManageSheet
        isVisible={sheetVisible}
        onClose={handleSheetClose}
        onClipsChanged={handleClipsChanged}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginRight: 12 },
  info: { flex: 1 },
  label: { fontSize: fontSizes.base, fontWeight: "500" },
  sub: { fontSize: fontSizes.sm, marginTop: 2 },
});

