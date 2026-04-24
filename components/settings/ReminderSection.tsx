import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { setAppSetting } from "@/lib/db";
import { requestPermission, scheduleReminders, cancelAll } from "@/lib/notifications";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  reminders: boolean;
  setReminders: (v: boolean) => void;
  reminderTime: string;
  setReminderTime: (v: string) => void;
  permDenied: boolean;
  setPermDenied: (v: boolean) => void;
  scheduleCount: number;
  restNotifications: boolean;
  setRestNotifications: (v: boolean) => void;
};

export default function ReminderSection({
  colors, toast,
  reminders, setReminders, reminderTime, setReminderTime,
  permDenied, setPermDenied, scheduleCount,
  restNotifications, setRestNotifications,
}: Props) {
  const [restTooltipVisible, setRestTooltipVisible] = useState(false);
  return (
    <>
      <View style={styles.row}>
        <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>Workout Reminders</Text>
        <Switch
          value={reminders}
          onValueChange={async (val) => {
            if (val) {
              if (scheduleCount === 0) { toast.info("No workout schedule set", "Add one to your active program first"); return; }
              try {
                const granted = await requestPermission();
                if (!granted) { setPermDenied(true); toast.error("Notifications blocked", "Tap 'Open Settings' below to enable"); return; }
                setPermDenied(false);
                const parts = reminderTime.split(":"); const h = Number(parts[0]); const m = Number(parts[1]);
                const count = await scheduleReminders({ hour: h, minute: m });
                await setAppSetting("reminders_enabled", "true");
                setReminders(true);
                toast.success(`Reminders set for ${count} day${count !== 1 ? "s" : ""}`);
              } catch { toast.error("Couldn't set reminders. Try again later."); }
            } else {
              try { await cancelAll(); await setAppSetting("reminders_enabled", "false"); setReminders(false); }
              catch { toast.error("Couldn't disable reminders. Try again later."); }
            }
          }}
          accessibilityLabel="Workout Reminders"
          accessibilityRole="switch"
          accessibilityHint="Enable or disable push notifications for scheduled workout days"
        />
      </View>

      {reminders && (
        <>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
            {`You'll be reminded at ${reminderTime} on days with scheduled workouts`}
          </Text>
          <View style={styles.row}>
            <Text variant="body" style={{ color: colors.onSurface, marginRight: 12, fontSize: fontSizes.sm }}>Time</Text>
            <TextInput
              value={reminderTime}
              onChangeText={setReminderTime}
              onBlur={async () => {
                const match = reminderTime.match(/^(\d{1,2}):(\d{2})$/);
                if (!match) { setReminderTime("08:00"); toast.error("Invalid time format. Use HH:MM"); return; }
                const h = Number(match[1]); const m = Number(match[2]);
                if (h > 23 || m > 59) { setReminderTime("08:00"); toast.error("Invalid time. Hours 0-23, minutes 0-59"); return; }
                const padded = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                setReminderTime(padded);
                try { await setAppSetting("reminder_time", padded); await scheduleReminders({ hour: h, minute: m }); }
                catch { toast.error("Couldn't set reminders. Try again later."); }
              }}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              style={[styles.timeInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceVariant }]}
              accessibilityLabel="Reminder time"
              accessibilityValue={{ text: reminderTime }}
            />
          </View>
        </>
      )}

      {!reminders && scheduleCount === 0 && (
        <Text variant="caption" style={{ color: colors.error, marginTop: 4 }}>No workout days scheduled. Set a weekly schedule on your active program to enable reminders.</Text>
      )}

      {permDenied && !reminders && (
        <View style={{ marginTop: 8 }}>
          <Text variant="caption" style={{ color: colors.error, marginBottom: 8 }}>Notification permission is denied. Enable it in your device settings to use reminders.</Text>
          <Button variant="outline" size="sm" onPress={() => Linking.openSettings()} style={{ alignSelf: "flex-start" }} accessibilityLabel="Open device notification settings">Open Settings</Button>
        </View>
      )}

      <View style={[styles.row, { marginTop: 16 }]}>
        <Pressable
          onPress={() => setRestTooltipVisible(!restTooltipVisible)}
          accessibilityRole="button"
          accessibilityLabel="Rest Timer Notifications. Tap for more info"
          style={{ flex: 1 }}
        >
          <View style={styles.labelWithIcon}>
            <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>Rest Timer Notifications</Text>
            <Text variant="caption" style={{ color: colors.primary, fontSize: fontSizes.xs, marginLeft: 4 }}>ⓘ</Text>
          </View>
        </Pressable>
        <Switch
          value={restNotifications}
          onValueChange={async (val) => {
            if (val) {
              try {
                const granted = await requestPermission();
                if (!granted) { setPermDenied(true); toast.error("Notifications blocked", "Tap 'Open Settings' below to enable"); return; }
                setPermDenied(false);
                await setAppSetting("rest_notification_enabled", "true");
                setRestNotifications(true);
              } catch { toast.error("Couldn't enable rest notifications. Try again later."); }
            } else {
              try { await setAppSetting("rest_notification_enabled", "false"); setRestNotifications(false); }
              catch { toast.error("Couldn't disable rest notifications. Try again later."); }
            }
          }}
          accessibilityLabel="Rest Timer Notifications"
          accessibilityRole="switch"
          accessibilityHint="Enable or disable push notifications when rest timer completes while app is in background"
        />
      </View>
      {restTooltipVisible && (
        <Text variant="caption" style={[styles.tooltipText, { color: colors.onSurfaceVariant, backgroundColor: colors.surfaceVariant }]}>
          Get notified when rest is done while using other apps.
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  labelWithIcon: { flexDirection: "row", alignItems: "center" },
  tooltipText: { fontSize: fontSizes.xs, padding: 10, borderRadius: 6, marginBottom: 8, lineHeight: 18 },
  timeInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fontSizes.sm, textAlign: "center", width: 80 },
});
