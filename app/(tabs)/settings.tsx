import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useLayout } from '../../lib/layout';
import { useFloatingTabBarHeight } from '../../components/FloatingTabBar';
import FlowContainer from '../../components/ui/FlowContainer';
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
import { fontSizes, spacing } from '@/constants/design-tokens';
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
 * Extra bottom clearance beyond the floating tab bar zone.
 * On wide/foldable screens the FlowContainer produces a multi-column layout
 * that reduces total content height; this extra padding ensures the About
 * card (with badge images) is always comfortably scrollable into view.
 *
 * On Android with gesture navigation, `insets.bottom` is often 0, so the
 * floating tab bar (which is `position: absolute`) can overlay the bottom
 * cards and block interaction unless we add generous extra clearance here.
 *
 * Set to 160px (was 96px) to guarantee the last interactive card sits
 * comfortably above the floating tab bar on Android phones with gesture
 * navigation, foldables, and other form factors where safe-area-inset
 * reporting may understate the actual visual clearance needed.
 */
export const SETTINGS_SCROLL_EXTRA_BOTTOM = 160;

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
        paddingTop: 16,
        paddingHorizontal: layout.horizontalPadding,
        paddingBottom: tabBarHeight + SETTINGS_SCROLL_EXTRA_BOTTOM,
      }}
    >
      <FlowContainer gap={16}>
        <UnitsCard
          colors={colors}
          toast={toast}
          weightUnit={weightUnit}
          setWeightUnit={setWeightUnit}
          measureUnit={measureUnit}
          setMeasureUnit={setMeasureUnit}
          weightGoal={weightGoal}
          fatGoal={fatGoal}
        />
        <AppearanceCard colors={colors} />
        <SettingsTile colors={colors}>
          <SettingsLinkRow
            colors={colors}
            title="Gym Profiles"
            caption="Manage gyms, cable stacks, and marker calibrations."
            accessibilityLabel="Open gym profiles settings"
            onPress={() => router.push('/settings/gym-profiles')}
          />
        </SettingsTile>
        <SettingsTile colors={colors}>
          <SettingsLinkRow
            colors={colors}
            title="Advanced Set Types"
            caption="How to use rest-pause, cluster, and myo-rep sets."
            accessibilityLabel="Open advanced set types help"
            onPress={() => router.push('/settings/advanced-sets')}
          />
        </SettingsTile>
        <SettingsTile colors={colors}>
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
        </SettingsTile>
        <BodyProfileCard weightUnit={weightUnit} heightUnit={measureUnit} />
        <FrequencyGoalPicker
          colors={colors}
          value={weeklyGoal}
          onChange={handleWeeklyGoalChange}
        />
        <PreferencesCard
          colors={colors}
          toast={toast}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
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
        <HydrationCard colors={colors} toast={toast} />
        <IntegrationsCard
          colors={colors}
          toast={toast}
          stravaAthlete={stravaAthlete}
          setStravaAthlete={setStravaAthlete}
          stravaLoading={stravaLoading}
          setStravaLoading={setStravaLoading}
        />
        <AutoBackupSection colors={colors} toast={toast} />
        <FormClipsStorageRow onClipsChanged={() => {}} />
        <DataManagementCard
          colors={colors}
          loading={loading}
          exportProgress={exportProgress}
          onExport={() => setExportSheetVisible(true)}
          onImport={openImportSheet}
        />
        <CSVExportCard colors={colors} />
        <FeedbackCard
          colors={colors}
          count={count}
          onBug={() => router.push({ pathname: '/feedback', params: { type: 'bug' } })}
          onFeature={() => router.push({ pathname: '/feedback', params: { type: 'feature' } })}
          onErrors={() => router.push('/errors')}
        />
        <SettingsTile colors={colors} title="About">
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
              style={{ color: colors.onSurface, fontSize: fontSizes.sm, fontWeight: '600' }}
            >
              {`CableSnap v${appVersion}`}
            </Text>
            <View style={styles.versionRowRight}>
              <Text
                variant="body"
                style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm, marginRight: 4 }}
              >
                What&apos;s new
              </Text>
              <ChevronRight size={18} color={colors.onSurfaceVariant} />
            </View>
          </Pressable>
          <View style={styles.aboutBlock}>
            <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}>
              Free & open-source workout tracker — optimized for cable machines, supports all major exercises.
            </Text>
            <Text
              variant="body"
              style={{ color: colors.primary, marginTop: 4 }}
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
              style={{ marginTop: 8 }}
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
              style={{ marginTop: 8 }}
            >
              <Image
                source={require('../../assets/badges/thanks-dev-button.png')}
                style={{ width: 180, height: 24, resizeMode: 'contain' }}
              />
            </Pressable>
          </View>
        </SettingsTile>
      </FlowContainer>
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
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  settingsRowLabel: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  versionRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aboutBlock: {
    marginTop: 4,
  },
});
