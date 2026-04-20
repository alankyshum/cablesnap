import { useCallback, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '@/components/ui/bna-toast';
import {
  getAppSetting,
  getSchedule,
  getBodySettings,
  getStravaConnection,
} from '@/lib/db';
import { getErrorCount } from '@/lib/errors';
import { setEnabled as setAudioEnabled } from '@/lib/audio';
import { getPermissionStatus } from '@/lib/notifications';

export function useSettingsData() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
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
  const [hcEnabled, setHcEnabled] = useState(false);
  const [hcLoading, setHcLoading] = useState(false);
  const [hcSdkStatus, setHcSdkStatus] = useState<
    'available' | 'needs_install' | 'needs_update' | 'unavailable'
  >('unavailable');

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
      getAppSetting('timer_sound_enabled')
        .then((val) => {
          const on = val !== 'false';
          setSoundEnabled(on);
          setAudioEnabled(on);
        })
        .catch(() => {
          setSoundEnabled(true);
          setAudioEnabled(true);
          toast.error('Could not load sound setting');
        });
      getAppSetting('rest_notification_enabled')
        .then((val) => {
          setRestNotifications(val !== 'false');
        })
        .catch(() => {
          setRestNotifications(true);
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
      if (Platform.OS === 'android') {
        (async () => {
          try {
            const { getHealthConnectSdkStatus, checkHealthConnectPermissionStatus } =
              await import('@/lib/health-connect');
            const status = await getHealthConnectSdkStatus();
            setHcSdkStatus(status);
            if (status === 'available') {
              const setting = await getAppSetting('health_connect_enabled');
              if (setting === 'true') {
                const hasPermission = await checkHealthConnectPermissionStatus();
                if (!hasPermission) {
                  await import('@/lib/db').then(({ setAppSetting: set }) =>
                    set('health_connect_enabled', 'false'),
                  );
                  setHcEnabled(false);
                  toast.error('Health Connect permission was revoked');
                  AccessibilityInfo.announceForAccessibility(
                    'Health Connect permission was revoked',
                  );
                } else {
                  setHcEnabled(true);
                }
              } else {
                setHcEnabled(false);
              }
            }
          } catch {
            setHcSdkStatus('unavailable');
          }
        })();
      }
    }, [toast]),
  );

  return {
    toast,
    loading, setLoading,
    count,
    soundEnabled, setSoundEnabled,
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
    hcEnabled, setHcEnabled,
    hcLoading, setHcLoading,
    hcSdkStatus,
  };
}
