import { t } from "@lingui/core/macro";
import { Image, StyleSheet, Switch, View } from "react-native";
import { Camera, RefreshCw, Share2, Trash2 } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useLayout } from "@/lib/layout";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { radii, spacing } from "@/constants/design-tokens";

type Props = {
  colors: ThemeColors;
  uri: string | null;
  unavailable: boolean;
  included: boolean;
  capturing: boolean;
  onIncludedChange: (value: boolean) => void;
  onCapture: () => void;
  onRemove: () => void;
  onShare: () => void;
};

export function ScreenshotSection(props: Props) {
  const { colors, uri, unavailable, included, capturing } = props;
  const layout = useLayout();
  if (!uri && !unavailable) return null;

  return (
    <View style={styles.section} testID="feedback-screenshot-section">
      <Text variant="subtitle" style={{ color: colors.onSurface }}>
        {t({ id: "feedback.screenshot.title", message: "Screenshot" })}
      </Text>
      {uri ? (
        <View style={[styles.previewLayout, layout.compact && styles.previewLayoutCompact]}>
          <Image
            source={{ uri }}
            resizeMode="contain"
            style={[styles.thumbnail, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
            accessibilityRole="image"
            accessibilityLabel={t({ id: "feedback.screenshot.previewA11y", message: "Screenshot preview" })}
            testID="feedback-screenshot-thumbnail"
          />
          <View style={[styles.actions, layout.compact && styles.actionsCompact]}>
            <Button variant="outline" icon={RefreshCw} onPress={props.onCapture} loading={capturing} style={styles.action} label={t({ id: "feedback.screenshot.retake", message: "Retake" })} accessibilityHint={t({ id: "feedback.screenshot.retakeHint", message: "Replaces the current screenshot" })} />
            <Button variant="outline" icon={Share2} onPress={props.onShare} style={styles.action} label={t({ id: "feedback.screenshot.share", message: "Share Screenshot" })} accessibilityHint={t({ id: "feedback.screenshot.shareHint", message: "Shares the PNG separately from the report" })} />
            <Button variant="ghost" icon={Trash2} onPress={props.onRemove} style={styles.action} label={t({ id: "feedback.screenshot.remove", message: "Remove" })} accessibilityHint={t({ id: "feedback.screenshot.removeHint", message: "Removes and deletes the temporary screenshot" })} />
          </View>
        </View>
      ) : (
        <View style={[styles.failure, { backgroundColor: colors.surfaceVariant }]}>
          <Text variant="body" style={{ color: colors.onSurface }}>
            {t({ id: "feedback.screenshot.unavailable", message: "Screenshot unavailable" })}
          </Text>
          <Button variant="outline" icon={Camera} onPress={props.onCapture} loading={capturing} style={styles.tryAgain} label={t({ id: "feedback.screenshot.tryAgain", message: "Try Again" })} accessibilityHint={t({ id: "feedback.screenshot.tryAgainHint", message: "Attempts to capture the current screen again" })} />
        </View>
      )}
      {uri && (
        <View style={styles.includeRow}>
          <Text variant="body" style={{ color: colors.onSurface }}>
            {t({ id: "feedback.screenshot.include", message: "Include screenshot" })}
          </Text>
          <Switch
            value={included}
            onValueChange={props.onIncludedChange}
            accessibilityRole="switch"
            accessibilityLabel={t({ id: "feedback.screenshot.includeA11y", message: "Include screenshot when sharing" })}
            accessibilityState={{ checked: included }}
            testID="feedback-include-screenshot"
          />
        </View>
      )}
      {uri && (
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          {t({ id: "feedback.screenshot.privacy", message: "Review the screenshot for sensitive information before sharing." })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.base, gap: spacing.sm },
  previewLayout: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  previewLayoutCompact: { flexDirection: "column" },
  thumbnail: { width: "65%", maxHeight: 280, minHeight: 180, borderWidth: 1, borderRadius: radii.md },
  actions: { flex: 1, gap: spacing.sm },
  actionsCompact: { width: "100%" },
  action: { minHeight: 48, width: "100%" },
  includeRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  failure: { padding: spacing.md, borderRadius: radii.md, gap: spacing.sm },
  tryAgain: { minHeight: 48, alignSelf: "flex-start" },
});
