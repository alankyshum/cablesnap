import {
  Linking,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { useLayout } from '../../lib/layout';
import { useFloatingTabBarHeight } from '../../components/FloatingTabBar';
import FlowContainer, { flowCardStyle } from '../../components/ui/FlowContainer';
import BodyProfileCard from '../../components/BodyProfileCard';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import PreferencesCard from '../../components/settings/PreferencesCard';
import IntegrationsCard from '../../components/settings/IntegrationsCard';
import CSVExportCard from '../../components/settings/CSVExportCard';
import AppearanceCard from '../../components/settings/AppearanceCard';
import UnitsCard from '../../components/settings/UnitsCard';
import DataManagementCard from '../../components/settings/DataManagementCard';
import FeedbackCard from '../../components/settings/FeedbackCard';
import ReminderSection from '../../components/settings/ReminderSection';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fontSizes } from '@/constants/design-tokens';
import { useSettingsData } from '@/hooks/useSettingsData';
import { handleExport, handleImport } from './_settings-handlers';

export default function Settings() {
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
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
  } = useSettingsData();

  const deps = { toast, setLoading, setExportProgress, router };

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
        <BodyProfileCard />
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
            <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 4 }}>
              About
            </Text>
            <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}>
              FitForge v{Constants.expoConfig?.version ?? '0.0.0'}
              {'\n'}Free & open-source workout tracker.
            </Text>
            <Text
              variant="body"
              style={{ color: colors.primary, marginTop: 4 }}
              onPress={() =>
                Linking.openURL('https://github.com/alankyshum/fitforge/blob/main/LICENSE')
              }
            >
              AGPL-3.0 License
            </Text>
          </CardContent>
        </Card>
      </FlowContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 48 },
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
});
