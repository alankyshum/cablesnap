import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { useLayout } from '../../lib/layout';
import { useFloatingTabBarHeight } from '../../components/FloatingTabBar';
import FlowContainer, { flowCardStyle } from '../../components/ui/FlowContainer';
import BodyProfileCard from '../../components/BodyProfileCard';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react-native';
import PreferencesCard from '../../components/settings/PreferencesCard';
import FrequencyGoalPicker from '../../components/settings/FrequencyGoalPicker';
import IntegrationsCard from '../../components/settings/IntegrationsCard';
import CSVExportCard from '../../components/settings/CSVExportCard';
import AppearanceCard from '../../components/settings/AppearanceCard';
import UnitsCard from '../../components/settings/UnitsCard';
import DataManagementCard from '../../components/settings/DataManagementCard';
import AutoBackupSection from '../../components/settings/AutoBackupSection';
import FeedbackCard from '../../components/settings/FeedbackCard';
import ReminderSection from '../../components/settings/ReminderSection';
import ReleaseNotesModal from '../../components/ReleaseNotesModal';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fontSizes } from '@/constants/design-tokens';
import { useSettingsData } from '@/hooks/useSettingsData';
import { handleExport, handleImport } from './_settings-handlers';
import { setAppSetting, deleteAppSetting } from '@/lib/db';
import { useQueryClient } from '@tanstack/react-query';

export default function Settings() {
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const queryClient = useQueryClient();
  const [releaseNotesVisible, setReleaseNotesVisible] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';
  const {
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

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: layout.horizontalPadding, paddingBottom: tabBarHeight + 16 },
      ]}
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
          />
        </PreferencesCard>
        <IntegrationsCard
          colors={colors}
          toast={toast}
          stravaAthlete={stravaAthlete}
          setStravaAthlete={setStravaAthlete}
          stravaLoading={stravaLoading}
          setStravaLoading={setStravaLoading}
          hcEnabled={hcEnabled}
          setHcEnabled={setHcEnabled}
          hcLoading={hcLoading}
          setHcLoading={setHcLoading}
          hcSdkStatus={hcSdkStatus}
        />
        <AutoBackupSection colors={colors} toast={toast} />
        <DataManagementCard
          colors={colors}
          loading={loading}
          exportProgress={exportProgress}
          onExport={() => handleExport(deps)}
          onImport={() => handleImport(deps)}
        />
        <CSVExportCard colors={colors} />
        <FeedbackCard
          colors={colors}
          count={count}
          onBug={() => router.push({ pathname: '/feedback', params: { type: 'bug' } })}
          onFeature={() => router.push({ pathname: '/feedback', params: { type: 'feature' } })}
          onErrors={() => router.push('/errors')}
        />
        <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
          <CardContent>
            <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>
              About
            </Text>
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
          </CardContent>
        </Card>
      </FlowContainer>
      <ReleaseNotesModal
        visible={releaseNotesVisible}
        onClose={() => setReleaseNotesVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 48 },
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
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
