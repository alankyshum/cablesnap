import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
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
  const [consented, setConsented] = useState(false);
  const currentUri = useRef(uri);

  useEffect(() => { currentUri.current = uri; }, [uri]);
  useEffect(() => () => {
    if (typeof currentUri.current === "string") removeFeedbackScreenshot(currentUri.current);
  }, []);

  const remove = useCallback(() => {
    if (typeof currentUri.current === "string") removeFeedbackScreenshot(currentUri.current);
    currentUri.current = null;
    setUri(null);
    setState("none");
    setConsented(false);
  }, []);

  return { uri, state, consented, setConsented, remove };
}
