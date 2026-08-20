import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { fontSizes } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import type { useToast } from "@/components/ui/bna-toast";

const MIN_RETENTION = 1;
const MAX_RETENTION = 50;
const STEP_BUTTON_SIZE = 32;

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

function formatLastBackup(iso: string | null): string {
  if (!iso) return t({ id: "settings.autoBackup.noBackups", message: "No backups yet" });
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return i18n._({ id: "settings.autoBackup.lastToday", message: "Last backup: Today at {time}", values: { time } });

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return i18n._({ id: "settings.autoBackup.lastYesterday", message: "Last backup: Yesterday at {time}", values: { time } });

  return i18n._({ id: "settings.autoBackup.lastDate", message: "Last backup: {date} at {time}", values: { date: date.toLocaleDateString(), time } });
}

export default function AutoBackupSection({ colors, toast, bareContent = false }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [retention, setRetention] = useState(5);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const backup = await import("../../lib/backup");
        const [isEnabled, ret, last] = await Promise.all([
          backup.isAutoBackupEnabled(),
          backup.getBackupRetention(),
          backup.getLastBackupTime(),
        ]);
        if (!mounted) return;
        setEnabled(isEnabled);
        setRetention(ret);
        setLastBackup(last);
        setReady(true);
      } catch {
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleToggle = useCallback(async (value: boolean) => {
    setEnabled(value);
    try {
      const { setAutoBackupEnabled } = await import("../../lib/backup");
      await setAutoBackupEnabled(value);
    } catch {
      toast.error(t({ id: "settings.autoBackup.updateFailed", message: "Failed to update setting" }));
      setEnabled(!value);
    }
  }, [toast]);

  const [tooltipVisible, setTooltipVisible] = useState(false);

  const handleRetentionChange = useCallback(async (value: number) => {
    const clamped = Math.min(MAX_RETENTION, Math.max(MIN_RETENTION, value));
    setRetention(clamped);
    try {
      const { setBackupRetention } = await import("../../lib/backup");
      await setBackupRetention(clamped);
    } catch {
      toast.error(t({ id: "settings.autoBackup.retentionFailed", message: "Failed to update retention" }));
    }
  }, [toast]);

  const handleBackupNow = useCallback(async () => {
    setLoading(true);
    try {
      const { performAutoBackup } = await import("../../lib/backup");
      const result = await performAutoBackup();
      if (result.success) {
        setLastBackup(new Date().toISOString());
        toast.success(t({ id: "settings.autoBackup.created", message: "Backup created successfully" }));
      } else {
        toast.error(t({ id: "settings.autoBackup.failed", message: "Backup failed" }));
      }
    } catch {
      toast.error(t({ id: "settings.autoBackup.failed", message: "Backup failed" }));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  if (!ready) return null;

  const content = (
    <>
      <Text
        variant="body"
        style={{ color: colors.onSurface, fontWeight: "600", fontSize: fontSizes.sm, marginBottom: 8 }}
      >
        {t({ id: "settings.autoBackup.title", message: "Auto-Backup" })}
      </Text>

      <View style={styles.row}>
        <Pressable
          onPress={() => setTooltipVisible(!tooltipVisible)}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "settings.autoBackup.infoA11y", message: "Auto-Backup. Tap for more info" })}
          style={{ flex: 1 }}
        >
          <View style={styles.labelWithIcon}>
            <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
              {t({ id: "settings.autoBackup.label", message: "Auto-Backup" })}
            </Text>
            <Text variant="caption" accessibilityElementsHidden importantForAccessibility="no" style={{ color: colors.primary, fontSize: fontSizes.xs, marginLeft: 4 }}>ⓘ</Text>
          </View>
        </Pressable>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          accessibilityRole="switch"
          accessibilityLabel={t({ id: "settings.autoBackup.toggleA11y", message: "Toggle auto-backup after workouts" })}
        />
      </View>

      {tooltipVisible && (
        <Text
          variant="caption"
          style={[styles.tooltipText, { color: colors.onSurfaceVariant, backgroundColor: colors.surfaceVariant }]}
        >
          {t({ id: "settings.autoBackup.tooltip", message: "Automatically saves your data after each workout." })}
        </Text>
      )}

      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}
        accessibilityLabel={formatLastBackup(lastBackup)}
      >
        {formatLastBackup(lastBackup)}
      </Text>

      {enabled && (
        <View style={styles.retentionRow} accessibilityLabel={i18n._({ id: "settings.autoBackup.retentionA11y", message: "Keep last {count} backups", values: { count: retention } })}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}>
            {t({ id: "settings.autoBackup.keepLast", message: "Keep last" })}
          </Text>
          <Pressable
            onPress={() => retention > MIN_RETENTION && handleRetentionChange(retention - 1)}
            disabled={retention <= MIN_RETENTION}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "settings.autoBackup.decreaseA11y", message: "Decrease backup retention" })}
            style={[styles.stepButton, { backgroundColor: colors.surfaceVariant, opacity: retention > MIN_RETENTION ? 1 : 0.35 }]}
          >
            <MaterialCommunityIcons name="minus" size={16} color={colors.onSurface} />
          </Pressable>
          <Text variant="body" style={[styles.retentionValue, { color: colors.onSurface }]}>
            {retention}
          </Text>
          <Pressable
            onPress={() => retention < MAX_RETENTION && handleRetentionChange(retention + 1)}
            disabled={retention >= MAX_RETENTION}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "settings.autoBackup.increaseA11y", message: "Increase backup retention" })}
            style={[styles.stepButton, { backgroundColor: colors.surfaceVariant, opacity: retention < MAX_RETENTION ? 1 : 0.35 }]}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.onSurface} />
          </Pressable>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}>
            {t({ id: "settings.autoBackup.backups", message: "backups" })}
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Button
          variant="outline"
          size="sm"
          onPress={handleBackupNow}
          loading={loading}
          disabled={loading}
          accessibilityLabel={t({ id: "settings.autoBackup.createA11y", message: "Create a backup now" })}
          accessibilityRole="button"
        >
          {t({ id: "settings.autoBackup.backupNow", message: "Backup Now" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => router.push("/settings/backups")}
          accessibilityLabel={t({ id: "settings.autoBackup.viewA11y", message: "View all backups" })}
          accessibilityRole="button"
        >
          {t({ id: "settings.autoBackup.viewBackups", message: "View Backups" })}
        </Button>
      </View>
    </>
  );

  if (bareContent) return <View>{content}</View>;

  return (
    <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  labelWithIcon: { flexDirection: "row", alignItems: "center" },
  tooltipText: { fontSize: fontSizes.xs, padding: 10, borderRadius: 6, marginBottom: 8, lineHeight: 18 },
  retentionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  stepButton: {
    width: STEP_BUTTON_SIZE,
    height: STEP_BUTTON_SIZE,
    borderRadius: STEP_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  retentionValue: { fontWeight: "700", fontSize: fontSizes.base, minWidth: 24, textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 4 },
});
