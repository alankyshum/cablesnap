import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/**
 * BLD-1130 G1 (closes BLD-1127 AC4): one-time inline hint shown next to the
 * numeric weight keypad on cable rows when the user's session gym has zero
 * stack calibrations. The hint is dismissible and the dismissal is persisted
 * via `app_settings.stackMarkerHintDismissedAt`, so it never re-appears on
 * any cable row across any session on this device.
 *
 * Mounting & visibility:
 *   - Caller (`SetWeightCell`) decides WHEN to mount this component (only the
 *     `case C uncalibrated cable` branch). The component itself is responsible
 *     for self-suppressing once dismissed.
 *   - Renders nothing while the dismissal status is loading or already
 *     dismissed — no layout flash.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { QueryClientContext } from "@tanstack/react-query";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { useStackMarkerHint } from "@/hooks/useStackMarkerHint";

const HINT_LABEL = "Calibrate this gym's stacks in Settings to log cable sets by marker.";

export function StackMarkerHint() {
  // Defensive context check: SetRow is rendered standalone in many unit tests
  // without a QueryClientProvider. Without this guard the hook below would
  // throw and crash unrelated SetRow assertions. In production the session
  // screen always provides a client, so this branch never executes.
  const hasQueryClient = React.useContext(QueryClientContext) !== undefined;
  if (!hasQueryClient) return null;
  return <StackMarkerHintInner />;
}

function StackMarkerHintInner() {
  const colors = useThemeColors();
  const { dismissed, dismiss, ready } = useStackMarkerHint();

  // BLD-1130 QD block (1bf6519c, 2026-05-10T07:40Z): suppress render until the
  // persisted dismissal timestamp has resolved, otherwise a previously-dismissed
  // hint flashes on mount while the settings query is still pending.
  if (!ready || dismissed) return null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant },
      ]}
      accessibilityRole="alert"
      testID="stack-marker-hint"
    >
      <Text style={[styles.text, { color: colors.onSurfaceVariant }]}>{HINT_LABEL}</Text>
      <Pressable
        onPress={dismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t({ id: "session.stackmarkerhint.str1", message: "Dismiss stack marker hint" })}
        testID="stack-marker-hint-dismiss"
        style={styles.dismissBtn}
      >
        <X size={16} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  text: {
    flex: 1,
    fontSize: fontSizes.xs,
    lineHeight: fontSizes.xs * 1.4,
  },
  dismissBtn: {
    padding: 2,
  },
});
