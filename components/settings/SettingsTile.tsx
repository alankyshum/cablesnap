import { StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { spacing } from '@/constants/design-tokens';
import type { ThemeColors } from '@/hooks/useThemeColors';

type Props = {
  /**
   * Optional tile heading, rendered at `subtitle` scale (18/600). Omit for
   * tiles whose child component supplies its own heading.
   */
  title?: string;
  children: ReactNode;
  colors: ThemeColors;
  /** Extra style merged onto the underlying Card (e.g. masonry cell sizing). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * SettingsTile — the standard flat container for one Settings section.
 *
 * BLD-2032 (epic BLD-2028, P0-4): centralizes tile padding (`spacing.base`) and
 * title type (`subtitle` 18/600) so density is tuned in one place rather than
 * per-card. The tile *is* the Card — children must not nest another Card inside
 * (the declutter epic bans card-in-card).
 */
export function SettingsTile({ title, children, colors, style, testID }: Props) {
  return (
    <Card
      testID={testID}
      style={StyleSheet.flatten([
        styles.tile,
        { backgroundColor: colors.surface },
        style,
      ])}
    >
      {title ? (
        <Text variant="subtitle" style={[styles.title, { color: colors.onSurface }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    padding: spacing.base,
  },
  title: {
    marginBottom: spacing.sm,
  },
});
