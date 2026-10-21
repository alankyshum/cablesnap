import { File } from "expo-file-system";
import { captureScreen } from "react-native-view-shot";

export type PendingFeedbackScreenshot =
  | { status: "ready"; uri: string }
  | { status: "failed"; uri: null };

const CAPTURE_TIMEOUT_MS = 3000;
let pending: PendingFeedbackScreenshot | null = null;

export function removeFeedbackScreenshot(uri: string | null): void {
  if (!uri || uri.startsWith("data:") || uri.startsWith("http")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best-effort and must never prevent reporting a problem.
  }
}

export function setPendingFeedbackScreenshot(value: PendingFeedbackScreenshot): void {
  if (pending?.status === "ready" && pending.uri !== value.uri) {
    removeFeedbackScreenshot(pending.uri);
  }
  pending = value;
}

export function takePendingFeedbackScreenshot(): PendingFeedbackScreenshot | null {
  const value = pending;
  pending = null;
  return value;
}

export async function captureFeedbackScreenshot(): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const capture = captureScreen({ format: "png", quality: 1, result: "tmpfile" });
  void capture.then((lateUri) => {
    if (timedOut) removeFeedbackScreenshot(lateUri);
  }).catch(() => undefined);
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("Screenshot capture timed out"));
      }, CAPTURE_TIMEOUT_MS);
    });
    const uri = await Promise.race([
      capture,
      timeout,
    ]);
    if (!uri) throw new Error("Screenshot capture returned no URI");
    return uri;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
