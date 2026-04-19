import { Platform, StyleSheet, Switch, View } from "react-native";
import { AccessibilityInfo } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Activity, HeartPulse } from "lucide-react-native";
import ErrorBoundary from "@/components/ErrorBoundary";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { setAppSetting } from "@/lib/db";
import { connectStrava, disconnect as disconnectStrava } from "@/lib/strava";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  stravaAthlete: string | null;
  setStravaAthlete: (v: string | null) => void;
  stravaLoading: boolean;
  setStravaLoading: (v: boolean) => void;
  hcEnabled: boolean;
  setHcEnabled: (v: boolean) => void;
  hcLoading: boolean;
  setHcLoading: (v: boolean) => void;
  hcSdkStatus: "available" | "needs_install" | "needs_update" | "unavailable";
};

export default function IntegrationsCard({
  colors, toast,
  stravaAthlete, setStravaAthlete, stravaLoading, setStravaLoading,
  hcEnabled, setHcEnabled, hcLoading, setHcLoading, hcSdkStatus,
}: Props) {
  if (Platform.OS === "web") return null;

  return (
    <ErrorBoundary>
      <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>Integrations</Text>

          {stravaAthlete ? (
            <View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ color: colors.onSurface }}>Strava</Text>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Connected as {stravaAthlete}</Text>
                </View>
                <Button
                  variant="outline"
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
                icon={Activity}
                onPress={async () => {
                  setStravaLoading(true);
                  try {
                    const result = await connectStrava();
                    if (result) { setStravaAthlete(result.athleteName); toast.success("Connected to Strava!"); }
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Connection failed");
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

          {Platform.OS === "android" && hcSdkStatus !== "unavailable" && (
            <View style={{ marginTop: 16 }}>
              <Separator style={{ marginBottom: 16 }} />
              {hcSdkStatus === "available" ? (
                <View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text variant="body" style={{ color: colors.onSurface }}>Health Connect</Text>
                      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{hcEnabled ? "Enabled" : "Disabled"}</Text>
                    </View>
                    <Switch
                      value={hcEnabled}
                      disabled={hcLoading}
                      accessibilityRole="switch"
                      accessibilityLabel="Sync workouts to Health Connect"
                      onValueChange={async (value) => {
                        if (value) {
                          setHcLoading(true);
                          try {
                            const { requestHealthConnectPermission } = await import("../../lib/health-connect");
                            const granted = await requestHealthConnectPermission();
                            if (granted) {
                              await setAppSetting("health_connect_enabled", "true");
                              setHcEnabled(true);
                              toast.success("Health Connect enabled");
                            } else {
                              setHcEnabled(false);
                              toast.error("Health Connect permission denied");
                              AccessibilityInfo.announceForAccessibility("Health Connect permission denied");
                            }
                          } catch { setHcEnabled(false); toast.error("Failed to enable Health Connect"); }
                          finally { setHcLoading(false); }
                        } else {
                          setHcLoading(true);
                          try {
                            const { disableHealthConnect } = await import("../../lib/health-connect");
                            await disableHealthConnect();
                            setHcEnabled(false);
                            toast.success("Health Connect disabled");
                          } catch { toast.error("Failed to disable Health Connect"); }
                          finally { setHcLoading(false); }
                        }
                      }}
                    />
                  </View>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>Completed workouts appear in Google Fit, Samsung Health, and other Health Connect apps.</Text>
                </View>
              ) : (
                <View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text variant="body" style={{ color: colors.onSurface }}>Health Connect</Text>
                      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{hcSdkStatus === "needs_update" ? "Update required" : "Not installed"}</Text>
                    </View>
                    <Button
                      variant="outline"
                      icon={HeartPulse}
                      style={{ minHeight: 48 }}
                      onPress={() => { import("../../lib/health-connect").then(({ openHealthConnectPlayStore }) => openHealthConnectPlayStore()); }}
                      accessibilityRole="button"
                      accessibilityLabel={hcSdkStatus === "needs_update" ? "Update Health Connect" : "Install Health Connect from Play Store"}
                    >
                      {hcSdkStatus === "needs_update" ? "Update" : "Install"}
                    </Button>
                  </View>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>Completed workouts appear in Google Fit, Samsung Health, and other Health Connect apps.</Text>
                </View>
              )}
            </View>
          )}
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
});
