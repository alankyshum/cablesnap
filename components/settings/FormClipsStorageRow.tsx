/**
 * FormClipsStorageRow.tsx
 *
 * Settings → Storage row showing total clip size + count.
 * "Manage" button opens a manage sheet (future: list view with delete).
 *
 * AC8: total MB and count derived from set_media.size_bytes sum.
 * AC16: hidden on web.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getStorageStats } from "@/lib/media/form-clips";
import { fontSizes } from "@/constants/design-tokens";

export function FormClipsStorageRow() {
  const colors = useThemeColors();
  const [stats, setStats] = useState<{ totalBytes: number; count: number } | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const s = await getStorageStats();
      setStats(s);
    } catch {
      // Non-fatal.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
  }, [loadStats]);

  if (Platform.OS === "web") return null;

  const mb = stats ? (stats.totalBytes / (1024 * 1024)).toFixed(1) : "…";
  const count = stats?.count ?? 0;

  return (
    <View style={[styles.row, { borderBottomColor: colors.outline }]}>
      <MaterialCommunityIcons
        name="video-outline"
        size={22}
        color={colors.onSurfaceVariant}
        style={styles.icon}
      />
      <View style={styles.info}>
        <Text style={[styles.label, { color: colors.onSurface }]}>Form clips</Text>
        <Text style={[styles.sub, { color: colors.onSurfaceVariant }]}>
          {stats === null ? "Loading…" : `${mb} MB across ${count} clip${count !== 1 ? "s" : ""}`}
        </Text>
      </View>
    </View>
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
