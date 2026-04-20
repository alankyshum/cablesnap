import { StyleSheet, View } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react-native';
import { flowCardStyle } from '@/components/ui/FlowContainer';
import { fontSizes } from '@/constants/design-tokens';
import type { ThemeColors } from '@/hooks/useThemeColors';

type Props = {
  colors: ThemeColors;
  loading: boolean;
  exportProgress: string | null;
  onExport: () => void;
  onImport: () => void;
};

export default function DataManagementCard({
  colors,
  loading,
  exportProgress,
  onExport,
  onImport,
}: Props) {
  return (
    <Card
      style={StyleSheet.flatten([
        styles.flowCard,
        styles.wideCard,
        { backgroundColor: colors.surface },
      ])}
    >
      <CardContent>
        <Text
          variant="body"
          style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}
        >
          Data Management
        </Text>
        <View style={styles.buttonFlow}>
          <Button
            variant="default"
            size="sm"
            icon={Download}
            onPress={onExport}
            loading={loading}
            disabled={loading}
            accessibilityLabel="Export all data as JSON"
            accessibilityRole="button"
          >
            Export All Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Upload}
            onPress={onImport}
            loading={loading}
            disabled={loading}
            accessibilityLabel="Import data"
            accessibilityRole="button"
          >
            Import CableSnap Backup
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
          Export your complete CableSnap data as a JSON backup file, or restore from a previous
          backup. Duplicates are skipped.
        </Text>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  wideCard: { minWidth: 340, flexBasis: 340 },
  buttonFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
