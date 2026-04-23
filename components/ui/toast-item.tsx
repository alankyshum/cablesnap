/* eslint-disable */
import { Text } from '@/components/ui/text';
import { Colors } from '@/theme/colors';
import { AlertCircle, Check, Info, X } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { ToastData, ToastVariant } from './toast-types';
import { useToastGesture } from '@/hooks/useToastGesture';
import { fontSizes } from "@/constants/design-tokens";

interface ToastProps extends ToastData { onDismiss: (id: string) => void; index: number; }

const TOAST_HEIGHT = 52;
const TOAST_MARGIN = 8;
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
  const top = (Platform.OS === 'ios' ? 59 : 20) + index * (TOAST_HEIGHT + TOAST_MARGIN);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, { top, zIndex: 1000 + index }, animatedStyle]}>
        <View style={styles.island}>
          {IconComponent && <View style={{ marginRight: 10 }}><IconComponent size={16} color={variantColor} /></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            {title && <Text variant='subtitle' style={{ color: Colors.light.onToast, fontSize: fontSizes.sm, fontWeight: '600', marginBottom: description ? 2 : 0 }} numberOfLines={1} ellipsizeMode='tail'>{title}</Text>}
            {description && <Text variant='caption' style={{ color: MUTED, fontSize: fontSizes.sm }} numberOfLines={2} ellipsizeMode='tail'>{description}</Text>}
          </View>
          {action && <TouchableOpacity onPress={action.onPress} style={[styles.actionBtn, { backgroundColor: variantColor }]} accessibilityRole='link' accessibilityLabel={action.label} testID='toast-action'><Text variant='caption' style={{ color: Colors.light.onToast, fontSize: fontSizes.xs, fontWeight: '600' }}>{action.label}</Text></TouchableOpacity>}
          <TouchableOpacity onPress={dismiss} style={styles.dismissBtn}><X size={14} color={MUTED} /></TouchableOpacity>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 32, right: 32, shadowColor: Colors.light.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  island: { borderRadius: 14, backgroundColor: Colors.dark.card, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  actionBtn: { marginLeft: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  dismissBtn: { marginLeft: 8, padding: 4, borderRadius: 8 },
});
