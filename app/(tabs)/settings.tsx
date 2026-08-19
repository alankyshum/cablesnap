import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
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
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ChevronRight } from 'lucide-react-native';
import SessionPreferencesCard from '../../components/settings/SessionPreferencesCard';
import HydrationCard from '../../components/settings/HydrationCard';
import FrequencyGoalPicker from '../../components/settings/FrequencyGoalPicker';
import IntegrationsCard from '../../components/settings/IntegrationsCard';
import ShareSettingsCard from '../../components/settings/ShareSettingsCard';
import CSVExportCard from '../../components/settings/CSVExportCard';
import AppearanceCard from '../../components/settings/AppearanceCard';
import UnitsCard from '../../components/settings/UnitsCard';
import DataManagementCard from '../../components/settings/DataManagementCard';
import ImportWorkoutsCard from '../../components/settings/ImportWorkoutsCard';
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
import { handleExport, pickImportBackup, pickImportWorkoutsCsv } from '@/lib/settings-handlers';
import {
  BACKUP_CATEGORY_ORDER,
  deleteAppSetting,
  getBackupCategoryCounts,
  getPresentBackupCategories,
  setAppSetting,
  type BackupCategoryName,
} from '@/lib/db';
import { getEnabled as getMacroCoachEnabled } from '@/lib/db/macro-coach-settings';
import { getEnabled as getTrainingDayMacrosEnabled } from '@/lib/db/training-day-settings';
import { useQueryClient } from '@tanstack/react-query';
import { clearImportSession, createImportSession } from '@/lib/import-session';

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
  const [pendingImportToken, setPendingImportToken] = useState<string | null>(null);
  const [navigatingToImport, setNavigatingToImport] = useState(false);
  const [importCategories, setImportCategories] = useState<BackupCategoryName[]>([]);
  const [importCategoryCounts, setImportCategoryCounts] = useState<Partial<Record<BackupCategoryName, number>>>({});
  const [macroCoachEnabled, setMacroCoachEnabled] = useState<boolean | null>(null);
  const [trainingDayMacrosEnabled, setTrainingDayMacrosEnabled] = useState<boolean | null>(null);
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  // Reload coaching feature flags every time the Settings tab regains focus, so
  // the Coaching module captions reflect toggles made on the sub-screens after
  // the user navigates back (the tab stays mounted, so a mount-only effect went
  // stale). See app/settings/macro-coach + training-day-macros.
  const refreshCoachingStatus = useCallback(() => {
    getMacroCoachEnabled().then(setMacroCoachEnabled).catch(() => setMacroCoachEnabled(false));
    getTrainingDayMacrosEnabled().then(setTrainingDayMacrosEnabled).catch(() => setTrainingDayMacrosEnabled(false));
  }, []);

  useFocusEffect(refreshCoachingStatus);

  const {
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
      toast.error(t({ id: 'settings.trainingGoal.saveFailure', message: 'Failed to save training goal' }));
    }
  };

  const openImportSheet = async () => {
    const picked = await pickImportBackup({ toast, setLoading });
    if (!picked) return;

    const presentCategories = getPresentBackupCategories(picked.data);
    if (presentCategories.length === 0) {
      toast.info(t({ id: 'settings.import.noCategories', message: 'No importable backup categories found' }));
      return;
    }

    setPendingImportToken(createImportSession(picked.raw));
    setImportCategories(presentCategories);
    setImportCategoryCounts(getBackupCategoryCounts(picked.data));
    setImportSheetVisible(true);
  };

  const closeImportSheet = () => {
    setImportSheetVisible(false);
    clearImportSession(pendingImportToken ?? undefined);
    setPendingImportToken(null);
    setImportCategories([]);
    setImportCategoryCounts({});
    setNavigatingToImport(false);
  };

  const openImportWorkoutsSheet = async () => {
    const filePath = await pickImportWorkoutsCsv({ toast });
    if (!filePath) return;
    router.push({ pathname: '/settings/import-workouts', params: { filePath } });
  };

  const confirmImportCategories = (selectedCategories: BackupCategoryName[]) => {
    const importToken = pendingImportToken;
    if (!importToken) return;
    // Paint the confirmation spinner before starting router work. In particular,
    // do not close the sheet before the user has feedback.
    setNavigatingToImport(true);
    requestAnimationFrame(() => {
      setImportSheetVisible(false);
      setPendingImportToken(null);
      setImportCategories([]);
      setImportCategoryCounts({});
      router.push({
        pathname: '/settings/import-backup',
        params: { importToken, selectedCategories: selectedCategories.join(',') },
      });
      setNavigatingToImport(false);
    });
  };

  return (
    <ScrollView
      testID="settings-scroll-view"
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          marginBottom: tabBarHeight,
        },
      ]}
      contentContainerStyle={{
        paddingTop: spacing.base,
        paddingHorizontal: layout.horizontalPadding,
        paddingBottom: SETTINGS_SCROLL_EXTRA_BOTTOM,
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
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.profile', message: 'Profile' })} testID="settings-tile-profile" index={0}>
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
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.unitsAppearance', message: 'Units & Appearance' })} testID="settings-tile-units-appearance" index={1}>
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
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.training', message: 'Training' })} testID="settings-tile-training" index={2}>
          <SettingsLinkRow
            colors={colors}
            title={t({ id: 'settings.training.gymProfiles', message: 'Gym Profiles' })}
            caption={t({ id: 'settings.training.gymProfilesCaption', message: 'Manage gyms, cable stacks, and marker calibrations.' })}
            accessibilityLabel={t({ id: 'settings.training.gymProfilesA11y', message: 'Open gym profiles settings' })}
            onPress={() => router.push('/settings/gym-profiles')}
          />
          <SettingsLinkRow
            colors={colors}
            title={t({ id: 'settings.training.advancedSetTypes', message: 'Advanced Set Types' })}
            caption={t({ id: 'settings.training.advancedSetTypesCaption', message: 'How to use rest-pause, cluster, and myo-rep sets.' })}
            accessibilityLabel={t({ id: 'settings.training.advancedSetTypesA11y', message: 'Open advanced set types help' })}
            onPress={() => router.push('/settings/advanced-sets')}
          />
          <Separator style={styles.tileDivider} />
          <SessionPreferencesCard
            colors={colors}
            toast={toast}
            bareContent
          />
        </SettingsTile>

        {/* ── 4. Notifications ── */}
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.notifications', message: 'Notifications' })} testID="settings-tile-notifications" index={3}>
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
          />
        </SettingsTile>

        {/* ── 5. Coaching ── */}
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.coaching', message: 'Coaching' })} testID="settings-tile-coaching" index={4}>
          <SettingsLinkRow
            colors={colors}
            title={t({ id: 'settings.coaching.adaptiveMacroCoach', message: 'Adaptive Macro Coach' })}
            caption={
              macroCoachEnabled === null
                ? ''
                : macroCoachEnabled
                  ? t({ id: 'settings.coaching.macroCoachOn', message: 'On — weekly advisory card on Nutrition tab' })
                  : t({ id: 'settings.coaching.macroCoachOff', message: 'Off — tap to set up' })
            }
            accessibilityLabel={t({ id: 'settings.coaching.adaptiveMacroCoachA11y', message: 'Open Adaptive Macro Coach settings' })}
            onPress={() => router.push('/settings/macro-coach')}
          />
          <Separator style={styles.tileDivider} />
          <SettingsLinkRow
            colors={colors}
            title={t({ id: 'settings.coaching.trainingDayMacros', message: 'Training-Day Macros' })}
            caption={
              trainingDayMacrosEnabled === null
                ? ''
                : trainingDayMacrosEnabled
                  ? t({ id: 'settings.coaching.trainingDayOn', message: 'On — different targets on training vs rest days' })
                  : t({ id: 'settings.coaching.trainingDayOff', message: 'Off — tap to set up' })
            }
            accessibilityLabel={t({ id: 'settings.coaching.trainingDayMacrosA11y', message: 'Open Training-Day Macro Adjustment settings' })}
            onPress={() => router.push('/settings/training-day-macros')}
          />
          <Separator style={styles.tileDivider} />
          <HydrationCard colors={colors} toast={toast} bareContent />
        </SettingsTile>

        {/* ── 6. Integrations ── */}
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.integrations', message: 'Integrations' })} testID="settings-tile-integrations" index={5}>
          <IntegrationsCard
            colors={colors}
            toast={toast}
            stravaAthlete={stravaAthlete}
            setStravaAthlete={setStravaAthlete}
            stravaLoading={stravaLoading}
            setStravaLoading={setStravaLoading}
            bareContent
          />
          <Separator style={styles.tileDivider} />
          <ShareSettingsCard colors={colors} bareContent />
        </SettingsTile>

        {/* ── 7. Data & Backup ── */}
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.dataBackup', message: 'Data & Backup' })} testID="settings-tile-data-backup" index={6}>
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
          <Separator style={styles.tileDivider} />
          <ImportWorkoutsCard
            colors={colors}
            onPick={openImportWorkoutsSheet}
            bareContent
          />
        </SettingsTile>

        {/* ── 8. Feedback ── */}
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.feedback', message: 'Feedback & Reports' })} testID="settings-tile-feedback" index={7}>
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
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.about', message: 'About' })} testID="settings-tile-about" index={8}>
          <Pressable
            onPress={() => setReleaseNotesVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'settings.about.releaseNotesA11y', message: `View release notes, current version ${appVersion}` })}
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
              {i18n._({ id: 'settings.about.version', message: 'CableSnap v{version}', values: { version: appVersion } })}
            </Text>
            <View style={styles.versionRowRight}>
              <Text variant="caption" style={{ marginRight: spacing.xs }}>
                {t({ id: 'settings.about.whatsNew', message: "What's new" })}
              </Text>
              <ChevronRight size={18} color={colors.onSurfaceVariant} />
            </View>
          </Pressable>
          <View style={styles.aboutBlock}>
            <Text variant="caption">
              {t({ id: 'settings.about.description', message: 'Free & open-source workout tracker — optimized for cable machines, supports all major exercises.' })}
            </Text>
            <Text
              variant="body"
              style={{ color: colors.primary, marginTop: spacing.xs }}
              onPress={() =>
                Linking.openURL('https://github.com/alankyshum/cablesnap/blob/main/LICENSE')
              }
            >
              {t({ id: 'settings.about.license', message: 'AGPL-3.0 License' })}
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: spacing.xs,
                marginTop: spacing.sm,
                alignSelf: 'flex-start',
              }}
            >
              <Pressable
                onPress={() => Linking.openURL('https://buymeacoffee.com/alankyshum')}
                accessibilityRole="link"
                accessibilityLabel="Buy me a coffee"
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Image
                  source={require('../../assets/badges/bmc-button.png')}
                  style={{ width: 180, height: 50, resizeMode: 'contain' }}
                />
              </Pressable>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: spacing.xs,
                marginTop: spacing.md,
                alignSelf: 'flex-start',
              }}
            >
              <Pressable
                onPress={() => Linking.openURL('https://thanks.dev/u/gh/alankyshum')}
                accessibilityRole="link"
                accessibilityLabel={t({ id: 'settings.about.sponsorA11y', message: 'Sponsor on thanks.dev' })}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Image
                  source={require('../../assets/badges/thanks-dev-button.png')}
                  style={{ width: 180, height: 24, resizeMode: 'contain' }}
                />
              </Pressable>
            </View>
          </View>
        </SettingsTile>

        {/* ── 10. Language ── */}
        <SettingsTile colors={colors} title={t({ id: 'settings.tiles.language', message: 'Language' })} testID="settings-tile-language" index={9}>
          <SettingsLinkRow
            colors={colors}
            title={t({ id: 'settings.language.title', message: 'Language' })}
            caption={t({ id: 'settings.language.caption', message: 'Choose the language used throughout the app.' })}
            accessibilityLabel={t({ id: 'settings.language.a11y', message: 'Open language settings' })}
            onPress={() => router.push('/settings/language')}
          />
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
        loading={navigatingToImport}
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
