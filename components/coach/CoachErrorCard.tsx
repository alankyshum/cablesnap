import React from "react";
import { Linking, StyleSheet, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle, ExternalLink, RefreshCw, X } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
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
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`Error: ${error.message}`}
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
            accessibilityLabel="Dismiss error"
            accessibilityRole="button"
            style={styles.dismissButton}
            hitSlop={{ top: spacing.xs, bottom: spacing.xs, left: spacing.xs, right: spacing.xs }}
          >
            <X size={18} color={colors.onErrorContainer} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionRow}>
        <Button
          variant="destructive"
          size="sm"
          onPress={handleRecoveryPress}
          accessibilityLabel={error.recovery.label}
          style={styles.recoveryButton}
        >
          {isExternal ? (
            <ExternalLink size={14} color={colors.onError} style={styles.buttonIcon} />
          ) : (
            <RefreshCw size={14} color={colors.onError} style={styles.buttonIcon} />
          )}
          <Text style={[styles.recoveryButtonText, { color: colors.onError }]}>
            {error.recovery.label}
          </Text>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  iconMessageRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  alertIcon: {
    marginTop: spacing.xxs,
  },
  errorMessage: {
    flex: 1,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    fontWeight: "500",
  },
  dismissButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  recoveryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  buttonIcon: {
    marginRight: spacing.xs,
  },
  recoveryButtonText: {
    fontSize: fontSizes.xs,
    fontWeight: "700",
  },
});
