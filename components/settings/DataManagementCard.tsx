import { StyleSheet, View } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react-native';
import { fontSizes } from '@/constants/design-tokens';
import type { ThemeColors } from '@/hooks/useThemeColors';
import { t } from '@lingui/core/macro';

type Props = {
  colors: ThemeColors;
  loading: boolean;
  exportProgress: string | null;
  onExport: () => void;
  onImport: () => void;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function DataManagementCard({
  colors,
  loading,
  exportProgress,
  onExport,
  onImport,
  bareContent = false,
}: Props) {
  const content = (
    <>
      <Text
        variant="body"
        style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}
      >
        {t({ id: "settings.data.title", message: "Data Management" })}
      </Text>
      <View style={styles.buttonFlow}>
        <Button
          variant="default"
          size="sm"
          icon={Download}
          onPress={onExport}
          loading={loading}
          disabled={loading}
          accessibilityLabel={t({ id: "settings.data.exportA11y", message: "Export all data as JSON" })}
          accessibilityRole="button"
        >
          {t({ id: "settings.data.exportAll", message: "Export All Data" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={Upload}
          onPress={onImport}
          loading={loading}
          disabled={loading}
          accessibilityLabel={t({ id: "settings.data.importA11y", message: "Import data" })}
          accessibilityRole="button"
        >
          {t({ id: "settings.data.importBackup", message: "Import CableSnap Backup" })}
        </Button>
      </View>
      {exportProgress && (
        <Text
          variant="caption"
          style={{ color: colors.primary, marginTop: 8 }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={exportProgress}
        >
          {exportProgress}
        </Text>
      )}
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginTop: 8, marginBottom: 16 }}
      >
        {t({ id: "settings.data.description", message: "Export your complete CableSnap data as a JSON backup file, or restore from a previous backup. Duplicates are skipped." })}
      </Text>
    </>
  );

  if (bareContent) return <View>{content}</View>;

  return (
    <Card
      variant="outline"
      style={StyleSheet.flatten([
        styles.flowCard,
        styles.wideCard,
        { backgroundColor: colors.surface },
      ])}
    >
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  wideCard: { minWidth: 340, flexBasis: 340 },
  buttonFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
