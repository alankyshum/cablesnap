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
import { setEnabled as setAudioCategoryEnabled } from '@/lib/audio';
import { getPermissionStatus } from '@/lib/notifications';

export function useSettingsData() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [restNotifications, setRestNotifications] = useState(true);
  // BLD-1137: Smart Rest Coach settings
  const [restPreEndCueSeconds, setRestPreEndCueSeconds] = useState<number>(10);
  const [restLiveCountdown, setRestLiveCountdown] = useState<boolean>(Platform.OS === 'android');
  const [restShowNextSet, setRestShowNextSet] = useState<boolean>(false);
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
      getAppSetting('timer_sound_enabled')
        .then((val) => {
          const on = val !== 'false';
          setSoundEnabled(on);
          setAudioCategoryEnabled('timer', on);
        })
        .catch(() => {
          setSoundEnabled(true);
          setAudioCategoryEnabled('timer', true);
          toast.error('Could not load sound setting');
        });
      getAppSetting('rest_notification_enabled')
        .then((val) => {
          setRestNotifications(val !== 'false');
        })
        .catch(() => {
          setRestNotifications(true);
        });
      // BLD-1137: Load Smart Rest Coach settings
      Promise.all([
        getAppSetting('rest_timer_pre_end_cue_seconds'),
        getAppSetting('rest_timer_live_countdown'),
        getAppSetting('rest_timer_show_next_set_preview'),
      ]).then(([cue, live, preview]) => {
        const cueVal = cue != null ? parseInt(cue, 10) : 10;
        setRestPreEndCueSeconds(Number.isFinite(cueVal) ? cueVal : 10);
        setRestLiveCountdown(live !== 'false');
        setRestShowNextSet(preview === 'true');
      }).catch(() => {});
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
    }, [toast]),
  );

  return {
    toast,
    loading, setLoading,
    count,
    soundEnabled, setSoundEnabled,
    restNotifications, setRestNotifications,
    restPreEndCueSeconds, setRestPreEndCueSeconds,
    restLiveCountdown, setRestLiveCountdown,
    restShowNextSet, setRestShowNextSet,
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
