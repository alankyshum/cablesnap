import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { useToast } from "@/components/ui/bna-toast";
import {
  captureFeedbackScreenshot,
  removeFeedbackScreenshot,
  takePendingFeedbackScreenshot,
} from "@/lib/feedback-screenshot";

export type FeedbackScreenshotState = "none" | "ready" | "failed";
export type FeedbackScreenshotUri = string | number;

export function useFeedbackScreenshot(auditState?: string) {
  const [initial] = useState(() => takePendingFeedbackScreenshot());
  const auditEnabled = Platform.OS === "web" && typeof navigator !== "undefined" && navigator.webdriver;
  const auditReady = auditEnabled && auditState === "ready";
  const auditFailed = auditEnabled && auditState === "failed";
  const initialUri: FeedbackScreenshotUri | null = auditReady
    ? require("../assets/store-screenshots/workouts-store-pixel9.png")
    : initial?.status === "ready" ? initial.uri : null;
  const [uri, setUri] = useState<FeedbackScreenshotUri | null>(initialUri);
  const [state, setState] = useState<FeedbackScreenshotState>(
    auditFailed || initial?.status === "failed" ? "failed" : initialUri ? "ready" : "none",
  );
  const [included, setIncluded] = useState(Boolean(initialUri));
  const [capturing, setCapturing] = useState(false);
  const currentUri = useRef(uri);
  const toast = useToast();

  useEffect(() => { currentUri.current = uri; }, [uri]);
  useEffect(() => () => {
    if (typeof currentUri.current === "string") removeFeedbackScreenshot(currentUri.current);
  }, []);

  const capture = useCallback(async () => {
    setCapturing(true);
    try {
      const nextUri = await captureFeedbackScreenshot();
      if (typeof currentUri.current === "string") removeFeedbackScreenshot(currentUri.current);
      currentUri.current = nextUri;
      setUri(nextUri);
      setState("ready");
      setIncluded(true);
      AccessibilityInfo.announceForAccessibility(
        t({ id: "feedback.screenshot.captureSuccess", message: "Screenshot captured" }),
      );
    } catch {
      if (!currentUri.current) setState("failed");
      const message = t({ id: "feedback.screenshot.unavailable", message: "Screenshot unavailable" });
      toast.info(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setCapturing(false);
    }
  }, [toast]);

  const remove = useCallback(() => {
    if (typeof currentUri.current === "string") removeFeedbackScreenshot(currentUri.current);
    currentUri.current = null;
    setUri(null);
    setState("none");
    setIncluded(false);
  }, []);

  return { uri, state, included, setIncluded, capturing, capture, remove };
}
