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

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  stravaAthlete: string | null;
  setStravaAthlete: (v: string | null) => void;
  stravaLoading: boolean;
  setStravaLoading: (v: boolean) => void;
};

export default function IntegrationsCard({
  colors, toast,
  stravaAthlete, setStravaAthlete, stravaLoading, setStravaLoading,
}: Props) {
  if (Platform.OS === "web") return null;

  return (
    <ErrorBoundary>
      <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>Integrations</Text>

          {stravaAthlete ? (
            <View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>Strava</Text>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Connected as {stravaAthlete}</Text>
                </View>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={async () => {
                    setStravaLoading(true);
                    try { await disconnectStrava(); setStravaAthlete(null); toast.success("Strava disconnected"); }
                    catch { toast.error("Failed to disconnect Strava"); }
                    finally { setStravaLoading(false); }
                  }}
                  loading={stravaLoading}
                  disabled={stravaLoading}
                  accessibilityRole="button"
                  accessibilityLabel={`Disconnect Strava account (${stravaAthlete})`}
                >
                  Disconnect
                </Button>
              </View>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>Completed workouts are automatically uploaded to Strava.</Text>
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
                    if (result) { setStravaAthlete(result.athleteName); toast.success("Connected to Strava!"); }
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
                accessibilityLabel="Connect your Strava account"
              >
                Connect Strava
              </Button>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>Automatically upload completed workouts to your Strava account.</Text>
            </View>
          )}
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
});
