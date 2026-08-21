import React from "react";
import { StyleSheet, View, TextInput, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { spacing, fontSizes } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { GITHUB_REPO_URL } from "@/constants/github";
import { useLingui } from "@lingui/react/macro";

type Props = {
  caption: string;
  enabled: boolean;
  interactive?: boolean;
  onCaptionChange?: (text: string) => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onCaptionBlur?: () => void;
};

export function StravaShareCardPromo({
  caption,
  enabled,
  interactive = false,
  onCaptionChange,
  onToggleEnabled,
  onCaptionBlur,
}: Props) {
  const colors = useThemeColors();
  const { t } = useLingui();

  if (!interactive) {
    if (!enabled) return null;
    return (
      <View style={styles.footer} testID="strava-promo-static-footer">
        <Text
          style={[styles.caption, { color: colors.onSurfaceVariant }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {caption || `Tracked with CableSnap · ${GITHUB_REPO_URL}`}
        </Text>
        <Text style={[styles.url, { color: colors.onSurfaceVariant }]}>
          {GITHUB_REPO_URL}
        </Text>
      </View>
    );
  }

  // Interactive preview mode
  if (!enabled) {
    return (
      <View style={[styles.footer, styles.footerInteractive]}>
        <Pressable
          onPress={() => onToggleEnabled?.(true)}
          style={[styles.addAffordance, { borderColor: colors.outlineVariant }]}
          testID="strava-promo-add-affordance"
          accessibilityRole="button"
           accessibilityLabel={t({ id: "share.strava.addPromoA11y", message: "Add promo caption" })}
        >
          <Text style={[styles.addText, { color: colors.primary }]}>
             {t({ id: "share.strava.addPromo", message: "+ Add promo caption" })}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.footer} testID="strava-promo-interactive-footer">
      <View style={styles.inputContainer}>
        <TextInput
          value={caption}
          onChangeText={(t) => onCaptionChange?.(t.slice(0, 200))}
          onBlur={onCaptionBlur}
           placeholder={t({ id: "share.strava.captionPlaceholder", message: "Add promo caption..." })}
          placeholderTextColor={colors.onSurfaceVariant}
          maxLength={200}
          style={[
            styles.captionInput,
            { color: colors.onSurface, borderColor: colors.outline },
          ]}
          testID="strava-promo-caption-input"
           accessibilityLabel={t({ id: "share.strava.captionInputA11y", message: "Promo caption input" })}
        />
        <Pressable
          onPress={() => onToggleEnabled?.(false)}
          style={styles.disableBtn}
          testID="strava-promo-disable-btn"
          accessibilityRole="button"
           accessibilityLabel={t({ id: "share.strava.removePromoA11y", message: "Remove promo caption" })}
        >
           <Text style={[styles.disableText, { color: colors.error }]}>{t({ id: "common.remove", message: "Remove" })}</Text>
        </Pressable>
      </View>
      <Text style={[styles.url, { color: colors.onSurfaceVariant }]}>
        {GITHUB_REPO_URL}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.2)",
    paddingTop: spacing.lg,
    marginTop: spacing.md,
  },
  footerInteractive: {
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.2)",
    paddingTop: spacing.lg,
    marginTop: spacing.md,
    justifyContent: "center",
  },
  caption: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  url: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  addAffordance: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  addText: {
    fontSize: fontSizes.base,
    fontWeight: "600",
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing.lg,
    gap: spacing.md,
  },
  captionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.base,
  },
  disableBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  disableText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
});
