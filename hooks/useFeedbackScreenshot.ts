import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useToast } from "@/components/ui/bna-toast";
import {
  captureFeedbackScreenshot,
  removeFeedbackScreenshot,
  takePendingFeedbackScreenshot,
} from "@/lib/feedback-screenshot";

export function useFeedbackScreenshot(auditState?: string) {
  const [initial] = useState(() => takePendingFeedbackScreenshot());
  const auditEnabled = __DEV__ || process.env.EXPO_PUBLIC_SCREENSHOT_AUDIT === "1";
  const auditAttached = auditEnabled && auditState === "attached";
  const auditFailed = auditEnabled && auditState === "failed";
  const [uri, setUri] = useState<string | null>(
    auditAttached
      ? "https://placehold.co/1200x800/png?text=CableSnap+screen"
      : initial?.uri ?? null,
  );
  const [unavailable, setUnavailable] = useState(auditFailed || Boolean(initial?.unavailable));
  const [included, setIncluded] = useState(Boolean(uri));
  const [capturing, setCapturing] = useState(false);
  const currentUri = useRef(uri);
  const toast = useToast();

  useEffect(() => {
    currentUri.current = uri;
  }, [uri]);
  useEffect(() => () => removeFeedbackScreenshot(currentUri.current), []);

  const capture = useCallback(async () => {
    setCapturing(true);
    try {
      const nextUri = await captureFeedbackScreenshot();
      removeFeedbackScreenshot(currentUri.current);
      setUri(nextUri);
      setUnavailable(false);
      setIncluded(true);
      AccessibilityInfo.announceForAccessibility(t({ id: "feedback.screenshot.captured", message: "Screenshot captured" }));
    } catch {
      setUnavailable(true);
      const message = t({ id: "feedback.screenshot.unavailable", message: "Screenshot unavailable" });
      toast.info(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setCapturing(false);
    }
  }, [toast]);

  const remove = useCallback(() => {
    removeFeedbackScreenshot(currentUri.current);
    setUri(null);
    setIncluded(false);
    setUnavailable(false);
  }, []);

  return { uri, unavailable, included, setIncluded, capturing, capture, remove };
}
