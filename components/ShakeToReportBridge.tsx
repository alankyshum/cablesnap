import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Accelerometer } from "expo-sensors";
import {
  captureFeedbackScreenshot,
  removeFeedbackScreenshot,
  setPendingFeedbackScreenshot,
} from "@/lib/feedback-screenshot";
import { ShakeDetector, ShakeLaunchGate } from "@/lib/shake-to-report";

export function ShakeToReportBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const gate = useRef(new ShakeLaunchGate());
  const [foreground, setForeground] = useState(AppState.currentState === "active");

  useEffect(() => {
    if (pathname !== "/feedback") gate.current.reset();
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = AppState.addEventListener("change", (next) => {
      setForeground(next === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || !foreground || pathname === "/feedback") return;
    let mounted = true;
    let sensorSubscription: { remove: () => void } | null = null;
    const detector = new ShakeDetector();

    void Accelerometer.isAvailableAsync().then((available) => {
      if (!mounted || !available) return;
      Accelerometer.setUpdateInterval(100);
      sensorSubscription = Accelerometer.addListener((sample) => {
        if (
          !detector.add(sample, Date.now()) ||
          !gate.current.begin()
        ) return;

        void captureFeedbackScreenshot()
          .then((uri) => {
            if (mounted) setPendingFeedbackScreenshot({ status: "ready", uri });
            else removeFeedbackScreenshot(uri);
          })
          .catch(() => {
            if (mounted) setPendingFeedbackScreenshot({ status: "failed", uri: null });
          })
          .finally(() => {
            if (!mounted) {
              gate.current.reset();
              return;
            }
            router.push({ pathname: "/feedback", params: { source: "shake", type: "bug" } });
          });
      });
    }).catch(() => undefined);

    return () => {
      mounted = false;
      sensorSubscription?.remove();
    };
  }, [foreground, pathname, router]);

  return null;
}
