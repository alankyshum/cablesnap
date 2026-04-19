import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { useToast } from "@/components/ui/bna-toast";
import { getAppSetting, setAppSetting } from "@/lib/db";
import { handleResponse, getPermissionStatus, addNotificationResponseReceivedListener } from "@/lib/notifications";

/** Bridges notification/permission events to BNA toast (must be inside ToastProvider) */
export function LayoutToastBridge() {
  const { info, warning } = useToast();
  const router = useRouter();

  useEffect(() => {
    const sub = addNotificationResponseReceivedListener((response) => {
      handleResponse(
        response,
        (path, params) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Expo Router dynamic route type
          if (params) router.push({ pathname: path as any, params });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          else router.push(path as any);
        },
        (msg: string) => info(msg)
      );
    });
    return () => sub?.remove();
  }, [router, info]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        const status = await getPermissionStatus();
        if (status !== "granted") {
          const enabled = await getAppSetting("reminders_enabled");
          if (enabled === "true") {
            await setAppSetting("reminders_enabled", "false");
            warning("Notification permission was revoked. Reminders disabled.");
          }
        }
      } catch {
        // Permission check failed — non-critical background operation
      }
    });
    return () => sub.remove();
  }, [warning]);

  return null;
}
