import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { useLingui } from "@lingui/react/macro";
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
  const { i18n, t } = useLingui();
  const [files, setFiles] = useState<BackupFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const { getBackupFiles } = await import("@/lib/backup");
      const result = await getBackupFiles();
      setFiles(result);
    } catch {
       toast.error(t({ id: "settings.backups.loadFailed", message: "Failed to load backups" }));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

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
         t({ id: "settings.backups.deleteTitle", message: "Delete Backup" }),
         t({ id: "settings.backups.deleteMessage", message: `Delete backup from ${dateStr}? This cannot be undone.` }),
        [
           { text: t({ id: "common.cancel", message: "Cancel" }), style: "cancel" },
          {
             text: t({ id: "common.delete", message: "Delete" }),
            style: "destructive",
            onPress: async () => {
              try {
                const { deleteBackup } = await import("@/lib/backup");
                await deleteBackup(item.filename);
                setFiles((prev) => prev.filter((f) => f.filename !== item.filename));
                 toast.success(t({ id: "settings.backups.deleted", message: "Backup deleted" }));
              } catch {
                 toast.error(t({ id: "settings.backups.deleteFailed", message: "Failed to delete backup" }));
              }
            },
          },
        ]
      );
    },
    [t, toast]
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
           dialogTitle: t({ id: "settings.backups.shareTitle", message: "Share Backup" }),
        });
      } catch {
         toast.error(t({ id: "settings.backups.shareFailed", message: "Failed to share backup" }));
      }
    },
    [t, toast]
  );

  const handleBackupNow = useCallback(async () => {
    setBackingUp(true);
    try {
      const { performAutoBackup } = await import("@/lib/backup");
      const result = await performAutoBackup();
      if (result.success) {
         toast.success(t({ id: "settings.backups.created", message: "Backup created successfully" }));
        await loadFiles();
      } else {
         toast.error(t({ id: "settings.backups.failed", message: "Backup failed" }));
      }
    } catch {
       toast.error(t({ id: "settings.backups.failed", message: "Backup failed" }));
    } finally {
      setBackingUp(false);
    }
  }, [toast, loadFiles, t]);

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
              accessibilityLabel={i18n._({ id: "settings.backups.restoreA11y", message: "Restore backup from {dateStr}", values: { dateStr } })}
              accessibilityRole="button"
            >
              {t({ id: "settings.backups.restore", message: "Restore" })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => handleShare(item)}
               accessibilityLabel={i18n._({ id: "settings.backups.shareA11y", message: "Share backup from {dateStr}", values: { dateStr } })}
              accessibilityRole="button"
            >
              {t({ id: "common.share", message: "Share" })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => handleDelete(item)}
              accessibilityLabel={i18n._({ id: "settings.backups.deleteA11y", message: "Delete backup from {dateStr}", values: { dateStr } })}
              accessibilityRole="button"
            >
              {t({ id: "common.delete", message: "Delete" })}
            </Button>
          </View>
          <Separator style={{ marginTop: 12 }} />
        </View>
      );
    },
    [colors, handleDelete, handleRestore, handleShare, i18n, t]
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "settings.backups.loading", message: "Loading backups…" })}</Text>
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
             {t({ id: "settings.backups.title", message: "Backups" })}
          </Text>
        }
        ListEmptyComponent={
          <Card style={styles.card}>
            <CardContent>
              <Text
                variant="body"
                style={{ color: colors.onSurfaceVariant, textAlign: "center", marginBottom: 12 }}
              >
                 {t({ id: "settings.backups.empty", message: "No backups yet — your first backup will be created after your next workout." })}
              </Text>
              <Button
                variant="default"
                onPress={handleBackupNow}
                loading={backingUp}
                disabled={backingUp}
                accessibilityLabel={t({ id: "settings.backups.createA11y", message: "Create a backup now" })}
                accessibilityRole="button"
              >
                 {t({ id: "settings.backups.create", message: "Backup Now" })}
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
