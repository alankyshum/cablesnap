import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { spacing } from '@/constants/design-tokens';
import type { ThemeColors } from '@/hooks/useThemeColors';

/**
 * Minimum interactive height for a settings link row.
 *
 * BLD-2032 (epic BLD-2028, P0-4): the design plan calls for a 48px minimum
 * touch target on every settings link — larger than the app's older 44px rows —
 * to improve reachability and meet the "≥48px targets" acceptance criterion of
 * the declutter epic.
 */
export const SETTINGS_LINK_ROW_MIN_HEIGHT = 48;

type Props = {
  /** Primary label, rendered at `body` scale (17/600). */
  title: string;
  /**
   * Optional secondary line, rendered at `caption` scale (muted). When empty or
   * omitted the caption line is not rendered, but the row keeps its min height
   * so an async caption (e.g. Macro Coach enabled-state) cannot shift the
   * chevron's vertical center.
   */
  caption?: string;
  onPress: () => void;
  /** Required for screen readers; the row exposes `role="button"`. */
  accessibilityLabel: string;
  colors: ThemeColors;
  testID?: string;
};

/**
 * SettingsLinkRow — a single tappable settings entry: title + optional caption
 * on the left, a trailing chevron on the right.
 *
 * Replaces the hand-rolled `Pressable` link markup previously inlined three
 * times in `app/(tabs)/settings.tsx`. It renders a bare `Pressable` (no Card of
 * its own) so it can be composed inside a `SettingsTile` without nesting cards.
 */
export function SettingsLinkRow({
  title,
  caption,
  onPress,
  accessibilityLabel,
  colors,
  testID,
}: Props) {
  const hasCaption = typeof caption === 'string' && caption.length > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      android_ripple={{ color: colors.surfaceVariant }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.meta}>
        <Text variant="body" style={[styles.title, { color: colors.onSurface }]}>
          {title}
        </Text>
        {hasCaption ? (
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {caption}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: SETTINGS_LINK_ROW_MIN_HEIGHT,
  },
  meta: {
    flex: 1,
    marginRight: spacing.md,
  },
  title: {
    fontWeight: '600',
  },
});
