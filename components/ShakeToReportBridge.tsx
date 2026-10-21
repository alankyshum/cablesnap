import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Accelerometer } from "expo-sensors";
import { useToast } from "@/components/ui/bna-toast";
import {
  captureFeedbackScreenshot,
  removeFeedbackScreenshot,
  setPendingFeedbackScreenshot,
} from "@/lib/feedback-screenshot";
import {
  canListenForShake,
  getShakeToReportEnabled,
  ShakeDetector,
  ShakeLaunchGate,
  subscribeShakeToReport,
} from "@/lib/shake-to-report";

export function ShakeToReportBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const gate = useRef(new ShakeLaunchGate());
  const wasOnFeedback = useRef(pathname === "/feedback");
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (wasOnFeedback.current && pathname !== "/feedback") {
      gate.current.resetAfterFeedbackExit();
    }
    wasOnFeedback.current = pathname === "/feedback";
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    getShakeToReportEnabled().then(setEnabled).catch(() => setEnabled(false));
    return subscribeShakeToReport(setEnabled);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (next) => {
      setForeground(next === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!canListenForShake(Platform.OS, enabled, foreground, true) || pathname === "/feedback") return;
    let mounted = true;
    let activeToken: number | null = null;
    let navigationCommitted = false;
    let sensorSubscription: { remove: () => void } | null = null;
    const detector = new ShakeDetector();
    const launchGate = gate.current;

    void Accelerometer.isAvailableAsync().then((available) => {
      if (!mounted || !canListenForShake(Platform.OS, enabled, foreground, available)) return;
      Accelerometer.setUpdateInterval(100);
      sensorSubscription = Accelerometer.addListener((sample) => {
        if (!detector.add(sample, Date.now())) return;
        const token = launchGate.begin();
        if (token === null) return;
        activeToken = token;
        const capturePromise = captureFeedbackScreenshot();
        AccessibilityInfo.announceForAccessibility(
          t({ id: "feedback.shake.preparing", message: "Preparing feedback" }),
        );

        void (async () => {
          let result: { status: "ready"; uri: string } | { status: "failed"; uri: null };
          try {
            result = { status: "ready", uri: await capturePromise };
            AccessibilityInfo.announceForAccessibility(
              t({ id: "feedback.screenshot.captureSuccess", message: "Screenshot captured" }),
            );
          } catch {
            result = { status: "failed", uri: null };
            const message = t({ id: "feedback.screenshot.unavailable", message: "Screenshot unavailable" });
            toast.info(message);
            AccessibilityInfo.announceForAccessibility(message);
          }

          if (!mounted || !launchGate.owns(token)) {
            if (result.status === "ready") removeFeedbackScreenshot(result.uri);
            return;
          }

          setPendingFeedbackScreenshot(result);
          try {
            navigationCommitted = true;
            router.push({ pathname: "/feedback", params: { source: "shake", type: "bug" } });
          } catch {
            navigationCommitted = false;
            setPendingFeedbackScreenshot({ status: "failed", uri: null });
            launchGate.cancel(token);
          }
        })();
      });
    }).catch(() => undefined);

    return () => {
      mounted = false;
      if (activeToken !== null && !navigationCommitted) launchGate.cancel(activeToken);
      sensorSubscription?.remove();
    };
  }, [enabled, foreground, pathname, router, toast]);

  return null;
}
