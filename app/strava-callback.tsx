import { t } from "@lingui/core/macro";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/bna-toast";
import {
  completeStravaCallback,
  getStravaUserMessage,
  getStravaSupportAction,
  APP_DEEP_LINK,
} from "@/lib/strava";

export default function StravaCallbackScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams();
  const toast = useToast();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function processCallback() {
      const search = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null) {
          const valueStr = Array.isArray(val) ? val[0] : val;
          search.set(key, valueStr);
        }
      }
      const callbackUrl = `${APP_DEEP_LINK}?${search.toString()}`;

      try {
        const result = await completeStravaCallback(callbackUrl);
        if (result) {
           toast.success(t({ id: "stravaCallback.connected", message: "Connected to Strava!" }));
        }
      } catch (err) {
        toast.error(getStravaUserMessage(err), {
          action: getStravaSupportAction(err),
        });
      } finally {
        router.replace("/(tabs)/settings");
      }
    }

    processCallback();
  }, [params, toast]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="body" style={[styles.text, { color: colors.onBackground }]}>
        {t({ id: "stravaCallback.connecting", message: "Connecting to Strava…" })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  text: {
    fontSize: 16,
    textAlign: "center",
  },
});
