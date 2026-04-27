import { Platform, StyleSheet, Switch, View } from "react-native";
import { AccessibilityInfo } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Activity, AlertCircle, ExternalLink, HeartPulse } from "lucide-react-native";
import ErrorBoundary from "@/components/ErrorBoundary";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import { setAppSetting } from "@/lib/db";
import {
  disableHealthConnect,
  openHealthConnectSettings,
  requestHealthConnectPermission,
} from "@/lib/health-connect";
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
  hcEnabled: boolean;
  setHcEnabled: (v: boolean) => void;
  hcLoading: boolean;
  setHcLoading: (v: boolean) => void;
  hcPermissionDenied: boolean;
  setHcPermissionDenied: (v: boolean) => void;
  hcSdkStatus: "available" | "needs_install" | "needs_update" | "unavailable";
};

export default function IntegrationsCard({
  colors, toast,
  stravaAthlete, setStravaAthlete, stravaLoading, setStravaLoading,
  hcEnabled, setHcEnabled, hcLoading, setHcLoading,
  hcPermissionDenied, setHcPermissionDenied, hcSdkStatus,
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

          {Platform.OS === "android" && hcSdkStatus !== "unavailable" && (
            <View style={{ marginTop: 16 }}>
              <Separator style={{ marginBottom: 16 }} />
              {hcSdkStatus === "available" ? (
                <View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>Health Connect</Text>
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
                          let granted = false;
                          let permissionRequestFailed = false;
                          try {
                            granted = await requestHealthConnectPermission();
                          } catch {
                            permissionRequestFailed = true;
                          }
                          try {
                            if (permissionRequestFailed) {
                              setHcEnabled(false);
                              setHcPermissionDenied(true);
                              toast.error("Failed to enable Health Connect");
                            } else if (granted) {
                              await setAppSetting("health_connect_enabled", "true");
                              setHcEnabled(true);
                              setHcPermissionDenied(false);
                              toast.success("Health Connect enabled");
                            } else {
                              setHcEnabled(false);
                              setHcPermissionDenied(true);
                              toast.error("Health Connect permission denied");
                              AccessibilityInfo.announceForAccessibility("Health Connect permission denied. Open Health Connect settings to grant permission manually.");
                            }
                          } catch {
                            // Persistence failure on the granted branch — permission is fine,
                            // so don't surface the "permission required" CTA. Just toast.
                            setHcEnabled(false);
                            toast.error("Failed to enable Health Connect");
                          }
                          finally { setHcLoading(false); }
                        } else {
                          setHcLoading(true);
                          try {
                            await disableHealthConnect();
                            setHcEnabled(false);
                            setHcPermissionDenied(false);
                            toast.success("Health Connect disabled");
                          } catch { toast.error("Failed to disable Health Connect"); }
                          finally { setHcLoading(false); }
                        }
                      }}
                    />
                  </View>
                  {hcPermissionDenied && !hcEnabled ? (
                    <View
                      testID="hc-permission-denied"
                      style={[styles.deniedBlock, { backgroundColor: colors.errorContainer, borderColor: colors.error }]}
                    >
                      <View style={styles.deniedHeader}>
                        <AlertCircle size={16} color={colors.error} />
                        <Text variant="body" style={{ color: colors.onErrorContainer, fontSize: fontSizes.sm, fontWeight: "600", marginLeft: 6 }}>
                          Permission required
                        </Text>
                      </View>
                      <Text variant="caption" style={{ color: colors.onErrorContainer, marginTop: 4 }}>
                        Android did not grant CableSnap permission to write to Health Connect. If you tapped Deny earlier, the system may stop showing the prompt — open Health Connect settings and grant the “Write exercise sessions” permission manually, then come back and try the toggle again.
                      </Text>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={ExternalLink}
                        style={{ marginTop: 10, alignSelf: "flex-start", minHeight: 48 }}
                        onPress={async () => {
                          try {
                            await openHealthConnectSettings();
                          } catch {
                            toast.error("Could not open Health Connect settings");
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Open Health Connect settings"
                      >
                        Open Health Connect settings
                      </Button>
                    </View>
                  ) : (
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>Completed workouts appear in Google Fit, Samsung Health, and other Health Connect apps.</Text>
                  )}
                </View>
              ) : (
                <View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>Health Connect</Text>
                      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{hcSdkStatus === "needs_update" ? "Update required" : "Not installed"}</Text>
                    </View>
                    <Button
                      variant="outline"
                      size="sm"
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
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  deniedBlock: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deniedHeader: { flexDirection: "row", alignItems: "center" },
});
