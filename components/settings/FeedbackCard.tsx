import { StyleSheet, View } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Bug, Lightbulb, List } from 'lucide-react-native';
import { flowCardStyle } from '@/components/ui/FlowContainer';
import { fontSizes } from '@/constants/design-tokens';
import type { ThemeColors } from '@/hooks/useThemeColors';

type Props = {
  colors: ThemeColors;
  count: number;
  onBug: () => void;
  onFeature: () => void;
  onErrors: () => void;
};

export default function FeedbackCard({ colors, count, onBug, onFeature, onErrors }: Props) {
  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text
          variant="body"
          style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}
        >
          Feedback &amp; Reports
        </Text>
        <View style={styles.buttonFlow}>
          <Button variant="default" size="sm" icon={Bug} onPress={onBug} accessibilityLabel="Report a bug">
            Report Bug
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Lightbulb}
            onPress={onFeature}
            accessibilityLabel="Request a feature"
          >
            Feature Request
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={List}
            onPress={onErrors}
            accessibilityLabel={`View error log, ${count} ${count === 1 ? 'error' : 'errors'}`}
          >{`Errors (${count})`}</Button>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  buttonFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
