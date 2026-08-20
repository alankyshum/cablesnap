import { Platform, StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react-native";
import ErrorBoundary from "@/components/ErrorBoundary";
import { fontSizes } from "@/constants/design-tokens";
import { connectStrava, disconnect as disconnectStrava, getStravaSupportAction, getStravaUserMessage } from "@/lib/strava";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";
import { useLingui } from "@lingui/react/macro";

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  stravaAthlete: string | null;
  setStravaAthlete: (v: string | null) => void;
  stravaLoading: boolean;
  setStravaLoading: (v: boolean) => void;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function IntegrationsCard({
  colors, toast,
  stravaAthlete, setStravaAthlete, stravaLoading, setStravaLoading,
  bareContent = false,
}: Props) {
  const { t, i18n } = useLingui();
  if (Platform.OS === "web") return null;

  const content = (
    <>
      {!bareContent && (
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>{t({ id: "settings.integrations.title", message: "Integrations" })}</Text>
      )}

      {stravaAthlete ? (
        <View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>{t({ id: "settings.integrations.strava", message: "Strava" })}</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{i18n._({ id: "settings.integrations.connectedAs", message: "Connected as {athlete}", values: { athlete: stravaAthlete } })}</Text>
            </View>
            <Button
              variant="outline"
              size="sm"
              onPress={async () => {
                setStravaLoading(true);
                 try { await disconnectStrava(); setStravaAthlete(null); toast.success(t({ id: "settings.integrations.disconnected", message: "Strava disconnected" })); }
                 catch { toast.error(t({ id: "settings.integrations.disconnectFailed", message: "Failed to disconnect Strava" })); }
                finally { setStravaLoading(false); }
              }}
              loading={stravaLoading}
              disabled={stravaLoading}
              accessibilityRole="button"
              accessibilityLabel={i18n._({ id: "settings.integrations.disconnectA11y", message: "Disconnect Strava account ({athlete})", values: { athlete: stravaAthlete } })}
            >
              {t({ id: "settings.integrations.disconnect", message: "Disconnect" })}
            </Button>
          </View>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>{t({ id: "settings.integrations.connectedHint", message: "Completed workouts are automatically uploaded to Strava." })}</Text>
        </View>
      ) : (
        <View>
          <Button
            variant="default"
            size="sm"
            icon={Activity}
            onPress={async () => {
              setStravaLoading(true);
              try {
                const result = await connectStrava();
                 if (result) { setStravaAthlete(result.athleteName); toast.success(t({ id: "settings.integrations.connected", message: "Connected to Strava!" })); }
              } catch (err) {
                if (__DEV__) {
                  console.warn("Strava connect failed:", err);
                }
                toast.error(getStravaUserMessage(err), { action: getStravaSupportAction(err) });
              } finally { setStravaLoading(false); }
            }}
            loading={stravaLoading}
            disabled={stravaLoading}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "settings.integrations.connectA11y", message: "Connect your Strava account" })}
          >
            {t({ id: "settings.integrations.connect", message: "Connect Strava" })}
          </Button>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>{t({ id: "settings.integrations.connectHint", message: "Automatically upload completed workouts to your Strava account." })}</Text>
        </View>
      )}
    </>
  );

  if (bareContent) return <ErrorBoundary><View>{content}</View></ErrorBoundary>;

  return (
    <ErrorBoundary>
      <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>{content}</CardContent>
      </Card>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
});
