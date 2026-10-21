import { t } from "@lingui/core/macro";
import { File } from "expo-file-system";
import { captureScreen } from "react-native-view-shot";
import { Alert } from "react-native";

export type FeedbackScreenshot = {
  uri: string | null;
  unavailable: boolean;
};

const CAPTURE_TIMEOUT_MS = 3000;
let pending: FeedbackScreenshot | null = null;

export function setPendingFeedbackScreenshot(value: FeedbackScreenshot): void {
  pending = value;
}

export function takePendingFeedbackScreenshot(): FeedbackScreenshot | null {
  const value = pending;
  pending = null;
  return value;
}

export async function captureFeedbackScreenshot(): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Screenshot capture timed out")), CAPTURE_TIMEOUT_MS);
  });
  const uri = await Promise.race([
    captureScreen({ format: "png", quality: 1, result: "tmpfile" }),
    timeout,
  ]).finally(() => clearTimeout(timer));
  if (!uri) throw new Error("Screenshot capture returned no URI");
  return uri;
}

export function removeFeedbackScreenshot(uri: string | null): void {
  if (!uri || uri.startsWith("data:") || uri.startsWith("http")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Temporary capture cleanup is best-effort; reporting must remain available.
  }
}

export function showScreenshotAttachmentNotice(onOpenGitHub: () => void, onShareScreenshot: () => void): void {
  Alert.alert(
    t({ id: "feedback.screenshot.manualAttachTitle", message: "Attach screenshot manually" }),
    t({ id: "feedback.screenshot.manualAttachMessage", message: "GitHub cannot attach the screenshot from this link. Share or save the PNG, then attach it to the GitHub issue manually." }),
    [
      { text: t({ id: "common.cancel", message: "Cancel" }), style: "cancel" },
      { text: t({ id: "feedback.screenshot.share", message: "Share Screenshot" }), onPress: onShareScreenshot },
      { text: t({ id: "feedback.github.continue", message: "Continue to GitHub" }), onPress: onOpenGitHub },
    ],
  );
}
