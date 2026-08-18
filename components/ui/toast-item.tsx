/* eslint-disable */
import { Text } from '@/components/ui/text';
import { Colors } from '@/theme/colors';
import { AlertCircle, Check, Info, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ToastData, ToastVariant } from './toast-types';
import { useToastGesture } from '@/hooks/useToastGesture';
import { elevation, fontSizes, radii, spacing } from "@/constants/design-tokens";

interface ToastProps extends ToastData { onDismiss: (id: string) => void; index: number; }

// BLD-1872: increased from 52 to 68 to accommodate 2-line titles without
// adjacent toasts overlapping when text wraps.
const TOAST_HEIGHT = 68;
const TOAST_MARGIN = 8;
// BLD-569: keep toast above primary-action / FAB zone at bottom of screen
// without overlapping the tab bar or the set-complete button.
const BOTTOM_ACTION_CLEARANCE = 64;
// BLD-569: width cap for at-a-glance legibility on large / foldable displays.
const TOAST_MAX_WIDTH = 360;
// Toast island always renders on a dark surface (Colors.dark.card), so semantic
// colors are sourced from the dark palette to guarantee legibility.
const MUTED = Colors.dark.textMuted;
const VARIANT_COLORS: Record<ToastVariant, string> = {
  success: Colors.dark.green,
  error: Colors.dark.red,
  warning: Colors.dark.orange,
  info: Colors.dark.blue,
  default: MUTED,
};
const VARIANT_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = { success: Check, error: X, warning: AlertCircle, info: Info };

export function Toast({ id, title, description, variant = 'default', onDismiss, index, action }: ToastProps) {
  const variantColor = VARIANT_COLORS[variant];
  const IconComponent = VARIANT_ICONS[variant] ?? null;
  const { dismiss, panGesture, animatedStyle } = useToastGesture(id, onDismiss);
  const insets = useSafeAreaInsets();
  // BLD-569: bottom-anchored, safe-area aware. Newest toast (index 0) is
  // closest to the primary action area; additional toasts stack upward.
  const bottom = insets.bottom + BOTTOM_ACTION_CLEARANCE + index * (TOAST_HEIGHT + TOAST_MARGIN);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, { bottom, zIndex: 1000 + index }, animatedStyle]}>
        <View style={styles.island}>
          {IconComponent && <View style={{ marginRight: 10 }}><IconComponent size={16} color={variantColor} /></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            {title && <Text variant='subtitle' style={{ color: Colors.light.onToast, fontSize: fontSizes.sm, fontWeight: '600', marginBottom: description ? 2 : 0 }} numberOfLines={2} ellipsizeMode='tail'>{title}</Text>}
            {description && <Text variant='caption' style={{ color: MUTED, fontSize: fontSizes.sm }} numberOfLines={2} ellipsizeMode='tail'>{description}</Text>}
            {action && (
              <TouchableOpacity
                onPress={action.onPress}
                style={styles.actionLink}
                accessibilityRole='link'
                accessibilityLabel={action.label}
                testID='toast-action'
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text variant='caption' style={styles.actionLinkText}>{action.label}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={dismiss} style={styles.dismissBtn}><X size={14} color={MUTED} /></TouchableOpacity>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: spacing.base, right: spacing.base, alignItems: 'center', ...elevation.high },
  island: { width: '100%', maxWidth: TOAST_MAX_WIDTH, borderRadius: radii.xl, backgroundColor: Colors.dark.card, paddingHorizontal: spacing.base, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  // BLD-513: Support CTA renders as a subdued underlined link below the
  // description (per design brief: colors.primary, fontSizes.xs, 4px above).
  // Intentionally no backgroundColor/padding/borderRadius — it's a link, not a pill.
  actionLink: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  actionLinkText: { color: Colors.dark.primary, fontSize: fontSizes.xs, fontWeight: '600', textDecorationLine: 'underline' },
  dismissBtn: { marginLeft: spacing.sm, padding: spacing.xs, borderRadius: radii.md, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
