import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { useLayout } from '../../lib/layout';
import { useFloatingTabBarHeight } from '../../components/FloatingTabBar';
import Masonry from '../../components/ui/Masonry';
import BodyProfileCard from '../../components/BodyProfileCard';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react-native';
import PreferencesCard from '../../components/settings/PreferencesCard';
import HydrationCard from '../../components/settings/HydrationCard';
import FrequencyGoalPicker from '../../components/settings/FrequencyGoalPicker';
import IntegrationsCard from '../../components/settings/IntegrationsCard';
import CSVExportCard from '../../components/settings/CSVExportCard';
import AppearanceCard from '../../components/settings/AppearanceCard';
import UnitsCard from '../../components/settings/UnitsCard';
import DataManagementCard from '../../components/settings/DataManagementCard';
import AutoBackupSection from '../../components/settings/AutoBackupSection';
import { FormClipsStorageRow } from '../../components/settings/FormClipsStorageRow';
import { SettingsLinkRow } from '../../components/settings/SettingsLinkRow';
import { SettingsTile } from '../../components/settings/SettingsTile';
import FeedbackCard from '../../components/settings/FeedbackCard';
import ReminderSection from '../../components/settings/ReminderSection';
import ReleaseNotesModal from '../../components/ReleaseNotesModal';
import { useThemeColors } from '@/hooks/useThemeColors';
import { spacing } from '@/constants/design-tokens';
import { useSettingsData } from '@/hooks/useSettingsData';
import BackupCategorySheet from '@/components/settings/BackupCategorySheet';
import { handleExport, pickImportBackup } from './_settings-handlers';
import {
  BACKUP_CATEGORY_ORDER,
  deleteAppSetting,
  getBackupCategoryCounts,
  getPresentBackupCategories,
  setAppSetting,
  type BackupCategoryName,
} from '@/lib/db';
import { getEnabled as getMacroCoachEnabled } from '@/lib/db/macro-coach-settings';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Extra bottom clearance below the floating tab bar zone, derived from spacing
 * tokens (`spacing.xxl * 5` = 160) rather than an ad-hoc magic number
 * (BLD-2034, epic BLD-2028 P1-6: "no stray magic numbers").
 *
 * The numeric clearance (160) is intentionally preserved from the prior literal,
 * NOT reduced — git history shows it was raised 48 → 96 → 160 because the
 * absolutely-positioned floating tab bar was still overlapping and blocking
 * interaction on the bottom cards on Android gesture-nav / foldables, where
 * `insets.bottom` is frequently reported as 0 (BLD-1106 → BLD-1124, GitHub #533
 * Z Fold6 regression). This pass only de-magic-numbers the value by expressing
 * it through tokens; it deliberately keeps the validated clearance so there is
 * zero behavioral change to the foldable scroll-cutoff guard.
 */
export const SETTINGS_SCROLL_EXTRA_BOTTOM = spacing.xxl * 5;

export default function Settings() {
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const queryClient = useQueryClient();
  const [releaseNotesVisible, setReleaseNotesVisible] = useState(false);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const [importSheetVisible, setImportSheetVisible] = useState(false);
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);
  const [importCategories, setImportCategories] = useState<BackupCategoryName[]>([]);
  const [importCategoryCounts, setImportCategoryCounts] = useState<Partial<Record<BackupCategoryName, number>>>({});
  const [macroCoachEnabled, setMacroCoachEnabled] = useState<boolean | null>(null);
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  useEffect(() => {
    getMacroCoachEnabled().then(setMacroCoachEnabled).catch(() => setMacroCoachEnabled(false));
  }, []);

  const {
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
  } = useSettingsData();

  const deps = { toast, setLoading, setExportProgress, router };

  const handleWeeklyGoalChange = async (goal: number | null) => {
    setWeeklyGoal(goal);
    try {
      if (goal != null) {
        await setAppSetting('weekly_training_goal', String(goal));
      } else {
        await deleteAppSetting('weekly_training_goal');
      }
      queryClient.invalidateQueries({ queryKey: ['home'] });
    } catch {
      toast.error('Failed to save training goal');
    }
  };

  const openImportSheet = async () => {
    const picked = await pickImportBackup({ toast, setLoading });
    if (!picked) return;

    const presentCategories = getPresentBackupCategories(picked.data);
    if (presentCategories.length === 0) {
      toast.info('No importable backup categories found');
      return;
    }

    setPendingImportJson(picked.raw);
    setImportCategories(presentCategories);
    setImportCategoryCounts(getBackupCategoryCounts(picked.data));
    setImportSheetVisible(true);
  };

  const closeImportSheet = () => {
    setImportSheetVisible(false);
    setPendingImportJson(null);
    setImportCategories([]);
    setImportCategoryCounts({});
  };

  const confirmImportCategories = (selectedCategories: BackupCategoryName[]) => {
    const backupJson = pendingImportJson;
    closeImportSheet();
    if (!backupJson) return;
    router.push({
      pathname: '/settings/import-backup',
      params: {
        backupJson,
        selectedCategories: selectedCategories.join(','),
      },
    });
  };

  return (
    <ScrollView
      testID="settings-scroll-view"
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: spacing.base,
        paddingHorizontal: layout.horizontalPadding,
        paddingBottom: tabBarHeight + SETTINGS_SCROLL_EXTRA_BOTTOM,
      }}
    >
      {/*
       * P0-3: Settings IA — ~18 individual cards consolidated into ~8 themed
       * masonry tiles (BLD-2031). FlowContainer replaced with Masonry so tiles
       * pack shortest-column-first on wide screens instead of flex-wrap rows.
       *
       * Watch-outs (from BLD-2028 plan):
       *   - No card-in-card nesting: child components use bareContent={true}
       *   - Keep logging path untouched (session screen not affected here)
       *   - Do not gate tile visibility on reveal transitions (headless-safe)
       */}
      <Masonry gap={spacing.base} testID="settings-masonry">

        {/* ── 1. Profile ── */}
        <SettingsTile colors={colors} title="Profile" testID="settings-tile-profile" index={0}>
          <BodyProfileCard
            weightUnit={weightUnit}
            heightUnit={measureUnit}
            bareContent
          />
          <Separator style={styles.tileDivider} />
          <FrequencyGoalPicker
            colors={colors}
            value={weeklyGoal}
            onChange={handleWeeklyGoalChange}
            bareContent
          />
        </SettingsTile>

        {/* ── 2. Units & Appearance ── */}
        <SettingsTile colors={colors} title="Units & Appearance" testID="settings-tile-units-appearance" index={1}>
          <UnitsCard
            colors={colors}
            toast={toast}
            weightUnit={weightUnit}
            setWeightUnit={setWeightUnit}
            measureUnit={measureUnit}
            setMeasureUnit={setMeasureUnit}
            weightGoal={weightGoal}
            fatGoal={fatGoal}
            bareContent
          />
          <Separator style={styles.tileDivider} />
          <AppearanceCard colors={colors} bareContent />
        </SettingsTile>

        {/* ── 3. Training ── */}
        <SettingsTile colors={colors} title="Training" testID="settings-tile-training" index={2}>
          <SettingsLinkRow
            colors={colors}
            title="Gym Profiles"
            caption="Manage gyms, cable stacks, and marker calibrations."
            accessibilityLabel="Open gym profiles settings"
            onPress={() => router.push('/settings/gym-profiles')}
          />
          <SettingsLinkRow
            colors={colors}
            title="Advanced Set Types"
            caption="How to use rest-pause, cluster, and myo-rep sets."
            accessibilityLabel="Open advanced set types help"
            onPress={() => router.push('/settings/advanced-sets')}
          />
        </SettingsTile>

        {/* ── 4. Notifications ── */}
        <SettingsTile colors={colors} title="Notifications" testID="settings-tile-notifications" index={3}>
          <PreferencesCard
            colors={colors}
            toast={toast}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
            bareContent
          >
            <ReminderSection
              colors={colors}
              toast={toast}
              reminders={reminders}
              setReminders={setReminders}
              reminderTime={reminderTime}
              setReminderTime={setReminderTime}
              permDenied={permDenied}
              setPermDenied={setPermDenied}
              scheduleCount={scheduleCount}
              restNotifications={restNotifications}
              setRestNotifications={setRestNotifications}
              restPreEndCueSeconds={restPreEndCueSeconds}
              setRestPreEndCueSeconds={setRestPreEndCueSeconds}
              restLiveCountdown={restLiveCountdown}
              setRestLiveCountdown={setRestLiveCountdown}
              restShowNextSet={restShowNextSet}
              setRestShowNextSet={setRestShowNextSet}
            />
          </PreferencesCard>
        </SettingsTile>

        {/* ── 5. Coaching ── */}
        <SettingsTile colors={colors} title="Coaching" testID="settings-tile-coaching" index={4}>
          <SettingsLinkRow
            colors={colors}
            title="Adaptive Macro Coach"
            caption={
              macroCoachEnabled === null
                ? ''
                : macroCoachEnabled
                  ? 'On — weekly advisory card on Nutrition tab'
                  : 'Off — tap to set up'
            }
            accessibilityLabel="Open Adaptive Macro Coach settings"
            onPress={() => router.push('/settings/macro-coach')}
          />
          <Separator style={styles.tileDivider} />
          <HydrationCard colors={colors} toast={toast} bareContent />
        </SettingsTile>

        {/* ── 6. Integrations ── */}
        <SettingsTile colors={colors} title="Integrations" testID="settings-tile-integrations" index={5}>
          <IntegrationsCard
            colors={colors}
            toast={toast}
            stravaAthlete={stravaAthlete}
            setStravaAthlete={setStravaAthlete}
            stravaLoading={stravaLoading}
            setStravaLoading={setStravaLoading}
            bareContent
          />
        </SettingsTile>

        {/* ── 7. Data & Backup ── */}
        <SettingsTile colors={colors} title="Data & Backup" testID="settings-tile-data-backup" index={6}>
          <AutoBackupSection colors={colors} toast={toast} bareContent />
          <Separator style={styles.tileDivider} />
          <FormClipsStorageRow onClipsChanged={() => {}} />
          <Separator style={styles.tileDivider} />
          <DataManagementCard
            colors={colors}
            loading={loading}
            exportProgress={exportProgress}
            onExport={() => setExportSheetVisible(true)}
            onImport={openImportSheet}
            bareContent
          />
          <Separator style={styles.tileDivider} />
          <CSVExportCard colors={colors} bareContent />
        </SettingsTile>

        {/* ── 8. Feedback ── */}
        <SettingsTile colors={colors} title="Feedback & Reports" testID="settings-tile-feedback" index={7}>
          <FeedbackCard
            colors={colors}
            count={count}
            onBug={() => router.push({ pathname: '/feedback', params: { type: 'bug' } })}
            onFeature={() => router.push({ pathname: '/feedback', params: { type: 'feature' } })}
            onErrors={() => router.push('/errors')}
            bareContent
          />
        </SettingsTile>

        {/* ── 9. About ── */}
        <SettingsTile colors={colors} title="About" testID="settings-tile-about" index={8}>
          <Pressable
            onPress={() => setReleaseNotesVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`View release notes, current version ${appVersion}`}
            testID="settings-version-row"
            android_ripple={{ color: colors.surfaceVariant }}
            style={({ pressed }) => [
              styles.versionRow,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text
              variant="body"
              style={{ color: colors.onSurface, fontWeight: '500' }}
            >
              {`CableSnap v${appVersion}`}
            </Text>
            <View style={styles.versionRowRight}>
              <Text variant="caption" style={{ marginRight: spacing.xs }}>
                What&apos;s new
              </Text>
              <ChevronRight size={18} color={colors.onSurfaceVariant} />
            </View>
          </Pressable>
          <View style={styles.aboutBlock}>
            <Text variant="caption">
              Free & open-source workout tracker — optimized for cable machines, supports all major exercises.
            </Text>
            <Text
              variant="body"
              style={{ color: colors.primary, marginTop: spacing.xs }}
              onPress={() =>
                Linking.openURL('https://github.com/alankyshum/cablesnap/blob/main/LICENSE')
              }
            >
              AGPL-3.0 License
            </Text>
            <Pressable
              onPress={() => Linking.openURL('https://buymeacoffee.com/alankyshum')}
              accessibilityRole="link"
              accessibilityLabel="Buy me a coffee"
              style={{ marginTop: spacing.sm }}
            >
              <Image
                source={require('../../assets/badges/bmc-button.png')}
                style={{ width: 180, height: 50, resizeMode: 'contain' }}
              />
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL('https://thanks.dev/u/gh/alankyshum')}
              accessibilityRole="link"
              accessibilityLabel="Sponsor on thanks.dev"
              style={{ marginTop: spacing.sm }}
            >
              <Image
                source={require('../../assets/badges/thanks-dev-button.png')}
                style={{ width: 180, height: 24, resizeMode: 'contain' }}
              />
            </Pressable>
          </View>
        </SettingsTile>

      </Masonry>
      <ReleaseNotesModal
        visible={releaseNotesVisible}
        onClose={() => setReleaseNotesVisible(false)}
      />
      <BackupCategorySheet
        visible={exportSheetVisible}
        mode="export"
        categories={BACKUP_CATEGORY_ORDER}
        initialSelected={BACKUP_CATEGORY_ORDER}
        loading={loading}
        onClose={() => setExportSheetVisible(false)}
        onConfirm={(selectedCategories) => {
          setExportSheetVisible(false);
          void handleExport(deps, selectedCategories);
        }}
      />
      <BackupCategorySheet
        visible={importSheetVisible}
        mode="import"
        categories={importCategories}
        initialSelected={importCategories}
        counts={importCategoryCounts}
        loading={loading}
        onClose={closeImportSheet}
        onConfirm={confirmImportCategories}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  versionRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aboutBlock: {
    marginTop: spacing.xs,
  },
  /** Vertical margin around the hairline Separator between sub-sections within a tile. */
  tileDivider: {
    marginVertical: spacing.sm,
  },
});
