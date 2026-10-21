import { t } from "@lingui/core/macro";
import { Image, StyleSheet, Switch, useWindowDimensions, View } from "react-native";
import { Share2, Trash2 } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { FeedbackScreenshotState, FeedbackScreenshotUri } from "@/hooks/useFeedbackScreenshot";

type Props = {
  colors: ThemeColors;
  state: FeedbackScreenshotState;
  uri: FeedbackScreenshotUri | null;
  consented: boolean;
  onConsentChange: (value: boolean) => void;
  onRemove: () => void;
  onShare: () => void;
};

export function ScreenshotSection(props: Props) {
  const { colors, state, uri, consented } = props;
  const compact = useWindowDimensions().width <= 320;
  if (state === "none") return null;

  return (
    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]} testID="feedback-screenshot-section">
      <Text variant="subtitle" style={{ color: colors.onSurface }}>
        {t({ id: "feedback.screenshot.title", message: "Screenshot" })}
      </Text>
      {state === "ready" && uri ? (
        <>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }} accessibilityLiveRegion="polite">
            {t({ id: "feedback.screenshot.captured", message: "Screenshot captured. Review it before sharing." })}
          </Text>
          <Image
            source={typeof uri === "string" ? { uri } : uri}
            resizeMode="contain"
            style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}
            accessibilityRole="image"
            accessibilityLabel={t({ id: "feedback.screenshot.previewA11y", message: "Preview of the screen captured before feedback opened" })}
            testID="feedback-screenshot-preview"
          />
          <View style={styles.consentRow}>
            <View style={styles.consentCopy}>
              <Text variant="body" style={{ color: colors.onSurface }}>
                {t({ id: "feedback.screenshot.consent", message: "I reviewed this screenshot and consent to sharing it" })}
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {t({ id: "feedback.screenshot.privacy", message: "Screenshots can contain names, notifications, workout details, or other visible personal information. It is never attached automatically." })}
              </Text>
            </View>
            <Switch
              value={consented}
              onValueChange={props.onConsentChange}
              accessibilityRole="switch"
              accessibilityLabel={t({ id: "feedback.screenshot.consentA11y", message: "Consent to share reviewed screenshot" })}
              accessibilityState={{ checked: consented }}
              testID="feedback-screenshot-consent"
            />
          </View>
          <View style={[styles.actions, compact && styles.actionsCompact]}>
            <Button
              variant="outline"
              icon={Share2}
              onPress={props.onShare}
              disabled={!consented}
              style={styles.action}
              testID="feedback-share-screenshot"
              label={t({ id: "feedback.screenshot.share", message: "Share screenshot separately" })}
              accessibilityHint={t({ id: "feedback.screenshot.shareHint", message: "Opens the system share sheet for this PNG after consent" })}
            />
            <Button
              variant="ghost"
              icon={Trash2}
              onPress={props.onRemove}
              style={styles.action}
              label={t({ id: "feedback.screenshot.remove", message: "Remove screenshot" })}
              accessibilityHint={t({ id: "feedback.screenshot.removeHint", message: "Deletes the temporary screenshot now" })}
            />
          </View>
        </>
      ) : (
        <View accessibilityLiveRegion="polite" accessible>
          <Text variant="body" style={{ color: colors.onSurface }}>
            {t({ id: "feedback.screenshot.failed", message: "Screenshot unavailable. You can still send feedback and diagnostics." })}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {t({ id: "feedback.screenshot.noRetry", message: "Capture was not retried because the feedback overlay is now visible." })}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, padding: 12, borderWidth: 1, borderRadius: 12, gap: 12 },
  preview: { width: "100%", height: 240, borderWidth: 1, borderRadius: 8 },
  consentRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  consentCopy: { flex: 1, gap: 4 },
  actions: { flexDirection: "row", gap: 8 },
  actionsCompact: { flexDirection: "column" },
  action: { flex: 1, minHeight: 44 },
});
