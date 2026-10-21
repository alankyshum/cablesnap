import { t } from "@lingui/core/macro";
import { Image, StyleSheet, Switch, View } from "react-native";
import { Camera, RefreshCw, Share2, Trash2 } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { radii, spacing } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { FeedbackScreenshotState, FeedbackScreenshotUri } from "@/hooks/useFeedbackScreenshot";
import { useLayout } from "@/lib/layout";

type Props = {
  colors: ThemeColors;
  state: FeedbackScreenshotState;
  uri: FeedbackScreenshotUri | null;
  included: boolean;
  capturing: boolean;
  onIncludedChange: (value: boolean) => void;
  onCapture: () => void;
  onRemove: () => void;
  onShare: () => void;
};

export function ScreenshotSection(props: Props) {
  const { colors, state, uri, included, capturing } = props;
  const layout = useLayout();
  if (state === "none") return null;

  return (
    <View style={styles.section} testID="feedback-screenshot-section">
      <Text variant="subtitle" style={{ color: colors.onSurface }}>
        {t({ id: "feedback.screenshot.title", message: "Screenshot" })}
      </Text>
      {state === "ready" && uri ? (
        <>
          <View style={[styles.previewLayout, layout.compact && styles.previewLayoutCompact]}>
            <Image
              source={typeof uri === "string" ? { uri } : uri}
              resizeMode="contain"
              style={[styles.thumbnail, layout.compact && styles.thumbnailCompact, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              accessibilityRole="image"
              accessibilityLabel={t({ id: "feedback.screenshot.previewA11y", message: "Screenshot preview" })}
              testID="feedback-screenshot-preview"
            />
            <View style={[styles.actions, layout.compact && styles.actionsCompact]} testID="feedback-screenshot-actions">
              <Button variant="outline" icon={RefreshCw} onPress={props.onCapture} loading={capturing} style={styles.action} testID="feedback-retake-screenshot" label={t({ id: "feedback.screenshot.retake", message: "Retake" })} accessibilityHint={t({ id: "feedback.screenshot.retakeHint", message: "Replaces the current screenshot" })} />
              <Button variant="outline" icon={Share2} onPress={props.onShare} style={styles.action} testID="feedback-share-screenshot" label={t({ id: "feedback.screenshot.share", message: "Share Screenshot" })} accessibilityHint={t({ id: "feedback.screenshot.shareHint", message: "Shares the PNG separately from the report" })} />
              <Button variant="ghost" icon={Trash2} onPress={props.onRemove} style={styles.action} testID="feedback-remove-screenshot" label={t({ id: "feedback.screenshot.remove", message: "Remove" })} accessibilityHint={t({ id: "feedback.screenshot.removeHint", message: "Removes and deletes the temporary screenshot" })} />
            </View>
          </View>
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
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {t({ id: "feedback.screenshot.privacy", message: "Review the screenshot for sensitive information before sharing." })}
          </Text>
        </>
      ) : (
        <View style={[styles.failure, { backgroundColor: colors.surfaceVariant }]} accessibilityLiveRegion="polite">
          <Text variant="body" style={{ color: colors.onSurface }}>
            {t({ id: "feedback.screenshot.unavailable", message: "Screenshot unavailable" })}
          </Text>
          <Button variant="outline" icon={Camera} onPress={props.onCapture} loading={capturing} style={styles.tryAgain} testID="feedback-screenshot-try-again" label={t({ id: "feedback.screenshot.tryAgain", message: "Try Again" })} accessibilityHint={t({ id: "feedback.screenshot.tryAgainHint", message: "Attempts to capture the current screen again" })} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.base, gap: spacing.sm },
  previewLayout: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  previewLayoutCompact: { flexDirection: "column" },
  thumbnail: { width: "65%", maxHeight: 280, minHeight: 180, borderWidth: 1, borderRadius: radii.md },
  thumbnailCompact: { width: "100%" },
  actions: { flex: 1, gap: spacing.sm },
  actionsCompact: { width: "100%" },
  action: { minHeight: 48, width: "100%" },
  includeRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  failure: { padding: spacing.md, borderRadius: radii.md, gap: spacing.sm },
  tryAgain: { minHeight: 48, alignSelf: "flex-start" },
});
