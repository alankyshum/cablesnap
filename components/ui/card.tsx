/* eslint-disable */
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { radii, spacing } from '@/constants/design-tokens';
import { Pressable, StyleProp, TextStyle, ViewStyle, type ViewProps } from 'react-native';

/**
 * Surface treatment for a {@link Card}.
 *
 * - `elevated` (default) — opaque `card` background with a soft drop shadow /
 *   `elevation`. This is the historical Card look; it remains the default so
 *   the ~95 existing call sites render unchanged.
 * - `outline` — opaque `card` background with a 1px `border` hairline and no
 *   shadow / no elevation. Used to declutter dense stacks of tiles (Settings)
 *   that otherwise read as a column of drop-shadowed boxes (BLD-2030).
 * - `ghost` — `muted` surface tint, no border, no shadow / no elevation. The
 *   lightest treatment, for grouping without a visible container edge.
 */
export type CardVariant = 'elevated' | 'outline' | 'ghost';

interface CardProps extends Omit<ViewProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Surface treatment. Defaults to `'elevated'` (backwards-compatible). */
  variant?: CardVariant;
}

export function Card({
  children,
  style,
  onPress,
  variant = 'elevated',
  ...viewProps
}: CardProps) {
  const cardColor = useColor('card');
  const mutedColor = useColor('muted');
  const borderColor = useColor('border');
  const foregroundColor = useColor('foreground');

  const getVariantStyle = (): ViewStyle => {
    // Shared across every variant: full-width tile, token radius/padding.
    const baseStyle: ViewStyle = {
      width: '100%',
      borderRadius: radii.lg,
      padding: spacing.base,
      backgroundColor: cardColor,
    };

    switch (variant) {
      case 'outline':
        return {
          ...baseStyle,
          borderWidth: 1,
          borderColor,
          // Explicitly flatten elevation/shadow so an `elevated` style higher
          // in a merge never bleeds through.
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        };
      case 'ghost':
        return {
          ...baseStyle,
          backgroundColor: mutedColor,
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        };
      case 'elevated':
      default:
        return {
          ...baseStyle,
          shadowColor: foregroundColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        };
    }
  };

  const content = (
    <View {...viewProps} style={[getVariantStyle(), style]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return content;
}

interface CardHeaderProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardHeader({ children, style }: CardHeaderProps) {
  return <View style={[{ marginBottom: 8 }, style]}>{children}</View>;
}

interface CardTitleProps {
  children: React.ReactNode;
  style?: TextStyle;
}

export function CardTitle({ children, style }: CardTitleProps) {
  return (
    <Text
      variant='title'
      style={[
        {
          marginBottom: 4,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

interface CardDescriptionProps {
  children: React.ReactNode;
  style?: TextStyle;
}

export function CardDescription({ children, style }: CardDescriptionProps) {
  return (
    <Text variant='caption' style={[style]}>
      {children}
    </Text>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardContent({ children, style }: CardContentProps) {
  return <View style={[style]}>{children}</View>;
}

interface CardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardFooter({ children, style }: CardFooterProps) {
  return (
    <View
      style={[
        {
          marginTop: 16,
          flexDirection: 'row',
          gap: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
