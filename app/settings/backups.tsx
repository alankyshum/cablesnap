import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { useToast } from "@/components/ui/bna-toast";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { BackupFileInfo } from "@/lib/backup";

export default function BackupList() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const toast = useToast();
  const [files, setFiles] = useState<BackupFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const { getBackupFiles } = await import("@/lib/backup");
      const result = await getBackupFiles();
      setFiles(result);
    } catch {
      toast.error("Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadFiles();
  }, [loadFiles]);

  const handleDelete = useCallback(
    (item: BackupFileInfo) => {
      const dateStr = item.date.toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      Alert.alert(
        "Delete Backup",
        `Delete backup from ${dateStr}? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const { deleteBackup } = await import("@/lib/backup");
                await deleteBackup(item.filename);
                setFiles((prev) => prev.filter((f) => f.filename !== item.filename));
                toast.success("Backup deleted");
              } catch {
                toast.error("Failed to delete backup");
              }
            },
          },
        ]
      );
    },
    [toast]
  );

  const handleRestore = useCallback(
    (item: BackupFileInfo) => {
      router.push({
        pathname: "/settings/import-backup",
        params: { filePath: item.uri },
      });
    },
    [router]
  );

  const handleShare = useCallback(
    async (item: BackupFileInfo) => {
      try {
        await Sharing.shareAsync(item.uri, {
          mimeType: "application/json",
          dialogTitle: "Share Backup",
        });
      } catch {
        toast.error("Failed to share backup");
      }
    },
    [toast]
  );

  const handleBackupNow = useCallback(async () => {
    setBackingUp(true);
    try {
      const { performAutoBackup } = await import("@/lib/backup");
      const result = await performAutoBackup();
      if (result.success) {
        toast.success("Backup created successfully");
        await loadFiles();
      } else {
        toast.error("Backup failed");
      }
    } catch {
      toast.error("Backup failed");
    } finally {
      setBackingUp(false);
    }
  }, [toast, loadFiles]);

  const renderItem = useCallback(
    ({ item }: { item: BackupFileInfo }) => {
      const dateStr = item.date.toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return (
        <View style={styles.itemContainer}>
          <View style={styles.itemInfo}>
            <Text variant="body" style={{ color: colors.onSurface }}>
              {dateStr}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              {item.sizeLabel}
            </Text>
          </View>
          <View style={styles.itemActions}>
            <Button
              variant="outline"
              size="sm"
              onPress={() => handleRestore(item)}
              accessibilityLabel={`Restore backup from ${dateStr}`}
              accessibilityRole="button"
            >
              Restore
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => handleShare(item)}
              accessibilityLabel={`Share backup from ${dateStr}`}
              accessibilityRole="button"
            >
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => handleDelete(item)}
              accessibilityLabel={`Delete backup from ${dateStr}`}
              accessibilityRole="button"
            >
              Delete
            </Button>
          </View>
          <Separator style={{ marginTop: 12 }} />
        </View>
      );
    },
    [colors, handleDelete, handleRestore, handleShare]
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="body" style={{ color: colors.onSurfaceVariant }}>Loading backups…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={files}
        keyExtractor={(item) => item.filename}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.horizontalPadding },
        ]}
        ListHeaderComponent={
          <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }}>
            Backups
          </Text>
        }
        ListEmptyComponent={
          <Card style={styles.card}>
            <CardContent>
              <Text
                variant="body"
                style={{ color: colors.onSurfaceVariant, textAlign: "center", marginBottom: 12 }}
              >
                No backups yet — your first backup will be created after your next workout.
              </Text>
              <Button
                variant="default"
                onPress={handleBackupNow}
                loading={backingUp}
                disabled={backingUp}
                accessibilityLabel="Create a backup now"
                accessibilityRole="button"
              >
                Backup Now
              </Button>
            </CardContent>
          </Card>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 48 },
  card: { marginBottom: 16, borderRadius: 12 },
  itemContainer: { paddingVertical: 12 },
  itemInfo: { marginBottom: 8 },
  itemActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
