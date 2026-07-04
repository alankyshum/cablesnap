import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '@/components/ui/bna-toast';
import {
  getAppSetting,
  getSchedule,
  getBodySettings,
  getStravaConnection,
} from '@/lib/db';
import { getErrorCount } from '@/lib/errors';
import { getPermissionStatus } from '@/lib/notifications';

export function useSettingsData() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [restNotifications, setRestNotifications] = useState(true);
  const [reminders, setReminders] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [permDenied, setPermDenied] = useState(false);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [measureUnit, setMeasureUnit] = useState<'cm' | 'in'>('cm');
  const [weightGoal, setWeightGoal] = useState<number | null>(null);
  const [fatGoal, setFatGoal] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [stravaAthlete, setStravaAthlete] = useState<string | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      getErrorCount().then(setCount);
      getBodySettings()
        .then((s) => {
          setWeightUnit(s.weight_unit);
          setMeasureUnit(s.measurement_unit as 'cm' | 'in');
          setWeightGoal(s.weight_goal);
          setFatGoal(s.body_fat_goal);
        })
        .catch(() => {});
      getAppSetting('rest_notification_enabled')
        .then((val) => {
          setRestNotifications(val !== 'false');
        })
        .catch(() => {
          setRestNotifications(true);
        });
      getAppSetting('weekly_training_goal')
        .then((val) => {
          if (val != null) {
            const n = parseInt(val, 10);
            setWeeklyGoal(n >= 1 && n <= 7 ? n : null);
          } else {
            setWeeklyGoal(null);
          }
        })
        .catch(() => {
          setWeeklyGoal(null);
        });
      Promise.all([
        getAppSetting('reminders_enabled'),
        getAppSetting('reminder_time'),
        getPermissionStatus(),
        getSchedule(),
      ])
        .then(([enabled, time, perm, sched]) => {
          setReminders(enabled === 'true' && perm === 'granted');
          if (time) setReminderTime(time);
          setPermDenied(perm === 'denied');
          setScheduleCount(sched.length);
        })
        .catch(() => {});
      if (Platform.OS !== 'web') {
        getStravaConnection()
          .then((conn) => setStravaAthlete(conn?.athlete_name ?? null))
          .catch(() => {});
      }
    }, []),
  );

  return {
    toast,
    loading, setLoading,
    count,
    restNotifications, setRestNotifications,
    reminders, setReminders,
    reminderTime, setReminderTime,
    permDenied, setPermDenied,
    scheduleCount,
    weightUnit, setWeightUnit,
    measureUnit, setMeasureUnit,
    weightGoal, fatGoal,
    exportProgress, setExportProgress,
    stravaAthlete, setStravaAthlete,
    stravaLoading, setStravaLoading,
    weeklyGoal, setWeeklyGoal,
  };
}
