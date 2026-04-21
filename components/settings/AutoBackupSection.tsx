import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";

const RETENTION_OPTIONS = [3, 5, 10, 20] as const;
const CIRCLE_SIZE = 40;
const HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
};

function formatLastBackup(iso: string | null): string {
  if (!iso) return "No backups yet";
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Last backup: Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return `Last backup: Yesterday at ${time}`;

  return `Last backup: ${date.toLocaleDateString()} at ${time}`;
}

export default function AutoBackupSection({ colors, toast }: Props) {
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
      toast.error("Failed to update setting");
      setEnabled(!value);
    }
  }, [toast]);

  const handleRetentionChange = useCallback(async (value: number) => {
    setRetention(value);
    try {
      const { setBackupRetention } = await import("../../lib/backup");
      await setBackupRetention(value);
    } catch {
      toast.error("Failed to update retention");
    }
  }, [toast]);

  const handleBackupNow = useCallback(async () => {
    setLoading(true);
    try {
      const { performAutoBackup } = await import("../../lib/backup");
      const result = await performAutoBackup();
      if (result.success) {
        setLastBackup(new Date().toISOString());
        toast.success("Backup created successfully");
      } else {
        toast.error("Backup failed");
      }
    } catch {
      toast.error("Backup failed");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  if (!ready) return null;

  return (
    <Card style={StyleSheet.flatten([styles.flowCard, styles.wideCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text
          variant="body"
          style={{ color: colors.onSurface, fontWeight: "600", fontSize: fontSizes.sm, marginBottom: 8 }}
        >
          Auto-Backup
        </Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
              Auto-Backup
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              Automatically saves your data after each workout
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            accessibilityRole="switch"
            accessibilityLabel="Toggle auto-backup after workouts"
          />
        </View>

        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}
          accessibilityLabel={formatLastBackup(lastBackup)}
        >
          {formatLastBackup(lastBackup)}
        </Text>

        {enabled && (
          <>
            <Text
              variant="caption"
              style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}
            >
              Keep last N backups
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Backup retention count"
              style={styles.circleRow}
            >
              {RETENTION_OPTIONS.map((opt) => {
                const selected = retention === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => handleRetentionChange(opt)}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Keep ${opt} backups`}
                    style={[
                      styles.circle,
                      selected
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.onSurfaceVariant },
                    ]}
                  >
                    <Text
                      variant="body"
                      style={{
                        color: selected ? colors.onPrimary : colors.onSurface,
                        fontWeight: "700",
                        fontSize: fontSizes.sm,
                      }}
                    >
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.buttonRow}>
          <Button
            variant="outline"
            size="sm"
            onPress={handleBackupNow}
            loading={loading}
            disabled={loading}
            accessibilityLabel="Create a backup now"
            accessibilityRole="button"
          >
            Backup Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => router.push("/settings/backups")}
            accessibilityLabel="View all backups"
            accessibilityRole="button"
          >
            View Backups
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  wideCard: { minWidth: 340, flexBasis: 340 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  circleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 4 },
});
