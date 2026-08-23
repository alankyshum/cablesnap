import React from "react";
import { Linking, StyleSheet, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle, ExternalLink, RefreshCw, X } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { elevation, fontSizes, radii, spacing } from "@/constants/design-tokens";
import { i18n, t } from "@/lib/i18n";
import type { ChatErrorState } from "@/lib/ai/errors";

export type CoachErrorCardProps = {
  error: ChatErrorState;
  onDismiss?: () => void;
  onPickModel?: () => void;
  onRefreshCatalog?: () => void;
  onRetry?: () => void;
};

export function CoachErrorCard({
  error,
  onDismiss,
  onPickModel,
  onRefreshCatalog,
  onRetry,
}: CoachErrorCardProps) {
  const colors = useThemeColors();
  const router = useRouter();

  const handleRecoveryPress = async () => {
    const { recovery } = error;

    if (recovery.href === "settings/ai-key" || recovery.kind === "open_key_settings") {
      router.push("/settings/ai-key");
      return;
    }

    if (recovery.href) {
      Linking.openURL(recovery.href).catch(() => {});
      return;
    }

    switch (recovery.kind) {
      case "pick_another_model":
        onPickModel?.();
        break;
      case "refresh_catalog":
        onRefreshCatalog?.();
        break;
      case "retry_network":
      case "retry_rate_limit":
      case "retry_empty_response":
      case "retry_step_limit":
        onRetry?.();
        break;
      case "use_cached_catalog":
      case "dismiss":
      default:
        onDismiss?.();
        break;
    }
  };

  const isExternal = Boolean(error.recovery.href?.startsWith("http"));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.errorContainer,
          borderColor: colors.error,
          shadowColor: colors.shadow,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={i18n._({
        id: "components.coach.errorA11y",
        message: "Error: {message}",
        values: { message: error.message },
      })}
    >
      <View style={styles.topRow}>
        <View style={styles.iconMessageRow}>
          <AlertTriangle size={20} color={colors.onErrorContainer} style={styles.alertIcon} />
          <Text
            style={[
              styles.errorMessage,
              { color: colors.onErrorContainer },
            ]}
          >
            {error.message}
          </Text>
        </View>
        {onDismiss && (
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityLabel={t({ id: "components.coach.dismissError", message: "Dismiss error" })}
            accessibilityRole="button"
            style={styles.dismissButton}
            hitSlop={{ top: spacing.xs, bottom: spacing.xs, left: spacing.xs, right: spacing.xs }}
          >
            <X size={18} color={colors.onErrorContainer} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={handleRecoveryPress}
          accessibilityRole="button"
          accessibilityLabel={error.recovery.label}
          style={[styles.recoveryButton, { backgroundColor: colors.error }]}
        >
          {isExternal ? (
            <ExternalLink size={14} color={colors.onError} style={styles.buttonIcon} />
          ) : (
            <RefreshCw size={14} color={colors.onError} style={styles.buttonIcon} />
          )}
          <Text style={[styles.recoveryButtonText, { color: colors.onError }]}>
            {error.recovery.label}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
    gap: spacing.md,
    ...elevation.low,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  iconMessageRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  alertIcon: {
    marginTop: spacing.xs,
  },
  errorMessage: {
    flex: 1,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    fontWeight: "500",
  },
  dismissButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    marginLeft: spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  recoveryButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    gap: spacing.xs,
  },
  buttonIcon: {
    marginRight: spacing.xs,
  },
  recoveryButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: "700",
  },
});
