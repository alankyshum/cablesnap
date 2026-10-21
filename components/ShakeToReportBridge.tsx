import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Accelerometer } from "expo-sensors";
import { useToast } from "@/components/ui/bna-toast";
import {
  captureFeedbackScreenshot,
  setPendingFeedbackScreenshot,
} from "@/lib/feedback-screenshot";
import {
  getShakeToReportEnabled,
  canLaunchShakeFeedback,
  canListenForShake,
  ShakeDetector,
  subscribeShakeToReport,
} from "@/lib/shake-to-report";

export function ShakeToReportBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const launching = useRef(false);
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    getShakeToReportEnabled().then(setEnabled).catch(() => setEnabled(false));
    return subscribeShakeToReport(setEnabled);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!canListenForShake(Platform.OS, enabled, foreground, true)) return;
    let active = true;
    let sensorSubscription: { remove: () => void } | null = null;
    const detector = new ShakeDetector();
    Accelerometer.isAvailableAsync().then((available) => {
      if (!active || !canListenForShake(Platform.OS, enabled, foreground, available)) return;
      Accelerometer.setUpdateInterval(100);
      sensorSubscription = Accelerometer.addListener(async (sample) => {
        if (!detector.add(sample, Date.now()) || !canLaunchShakeFeedback(pathRef.current, launching.current)) return;
        launching.current = true;
        try {
          const uri = await captureFeedbackScreenshot();
          setPendingFeedbackScreenshot({ uri, unavailable: false });
          AccessibilityInfo.announceForAccessibility(t({ id: "feedback.screenshot.captured", message: "Screenshot captured" }));
        } catch {
          setPendingFeedbackScreenshot({ uri: null, unavailable: true });
          const message = t({ id: "feedback.screenshot.unavailable", message: "Screenshot unavailable" });
          toast.info(message);
          AccessibilityInfo.announceForAccessibility(message);
        }
        router.push("/feedback");
        setTimeout(() => { launching.current = false; }, 1000);
      });
    }).catch(() => undefined);
    return () => {
      active = false;
      sensorSubscription?.remove();
    };
  }, [enabled, foreground, router, toast]);

  return null;
}
