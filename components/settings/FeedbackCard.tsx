import { StyleSheet, View } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Bug, Lightbulb, List } from 'lucide-react-native';
import { fontSizes } from '@/constants/design-tokens';
import type { ThemeColors } from '@/hooks/useThemeColors';
import { t } from '@lingui/core/macro';
import { i18n } from '@lingui/core';

type Props = {
  colors: ThemeColors;
  count: number;
  onBug: () => void;
  onFeature: () => void;
  onErrors: () => void;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function FeedbackCard({ colors, count, onBug, onFeature, onErrors, bareContent = false }: Props) {
  const content = (
    <>
      {!bareContent && (
        <Text
          variant="body"
          style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}
        >
          {t({ id: "settings.feedback.title", message: "Feedback & Reports" })}
        </Text>
      )}
      <View style={styles.buttonFlow}>
        <Button
          variant="default"
          size="sm"
          icon={Bug}
          onPress={onBug}
          accessibilityLabel={t({ id: "settings.feedback.bugA11y", message: "Report a bug" })}
          style={{ minHeight: 44 }}
        >
          {t({ id: "settings.feedback.reportBug", message: "Report Bug" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={Lightbulb}
          onPress={onFeature}
          accessibilityLabel={t({ id: "settings.feedback.featureA11y", message: "Request a feature" })}
          style={{ minHeight: 44 }}
        >
          {t({ id: "settings.feedback.featureRequest", message: "Feature Request" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={List}
          onPress={onErrors}
          accessibilityLabel={i18n._({ id: "settings.feedback.errorsA11y", message: "View error log, {count, plural, one {# error} other {# errors}}", values: { count } })}
          style={{ minHeight: 44 }}
        >{i18n._({ id: "settings.feedback.errors", message: "Errors ({count})", values: { count } })}</Button>
      </View>
    </>
  );

  if (bareContent) return <View>{content}</View>;

  return (
    <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  buttonFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
