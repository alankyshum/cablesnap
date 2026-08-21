import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { fontSizes } from "@/constants/design-tokens";
import { getAppSetting, setAppSetting } from "@/lib/db";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";
import { markRpeCaptureNudgeSeen } from "@/lib/db/achievements";
import { invalidateIntensityMode } from "@/hooks/useIntensityMode";
import { useQueryClient } from "@tanstack/react-query";
import type { IntensityMode } from "@/lib/intensity";
import { t } from "@/lib/i18n";

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function SessionPreferencesCard({
  colors,
  toast,
  bareContent = false,
}: Props) {
  const queryClient = useQueryClient();

  // BLD-1110: Live RPE capture — default OFF (opt-in via Settings).
  const [captureRpe, setCaptureRpeState] = useState(false);

  // BLD-2701: Intensity scale — "rpe" | "rir". Default "rpe" (backward-compatible).
  const [intensityMode, setIntensityModeState] = useState<IntensityMode>("rpe");

  // BLD-1114: Pulley pin tracking — default ON (opt-out via Settings).
  const [pulleyPinTracking, setPulleyPinTrackingState] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting("session.captureRpe"),
      getAppSetting("session.pulleyPinTracking"),
      getAppSetting("session.intensityMode"),
    ]).then(([captureRpeSetting, pulleyPin, intensityModeSetting]) => {
      if (cancelled) return;
      setCaptureRpeState(captureRpeSetting === "true");
      setPulleyPinTrackingState(pulleyPin !== "false");
      setIntensityModeState(intensityModeSetting === "rir" ? "rir" : "rpe");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const updateCaptureRpe = async (val: boolean) => {
    setCaptureRpeState(val);
    try { await setAppSetting("session.captureRpe", val ? "true" : "false"); }
    catch { toast.error(t({ id: "settings.sessionPreferences.saveRpeFailed", message: "Failed to save RPE capture setting" })); }
    // AC9: if the user enables captureRpe via Settings, suppress the nudge banner forever.
    if (val) { markRpeCaptureNudgeSeen().catch(() => {}); }
  };

  // BLD-2701: Update intensity scale preference and invalidate the react-query cache
  // so all surfaces (home, history, progress, session) re-render immediately.
  const updateIntensityMode = async (mode: IntensityMode) => {
    setIntensityModeState(mode);
    try {
      await setAppSetting("session.intensityMode", mode);
      invalidateIntensityMode(queryClient);
    } catch {
      toast.error(t({ id: "settings.sessionPreferences.saveIntensityFailed", message: "Failed to save intensity scale setting" }));
    }
  };

  const updatePulleyPinTracking = async (val: boolean) => {
    setPulleyPinTrackingState(val);
    try { await setAppSetting("session.pulleyPinTracking", val ? "true" : "false"); }
    catch { toast.error(t({ id: "settings.sessionPreferences.savePulleyFailed", message: "Failed to save pulley pin tracking setting" })); }
  };

  const preferencesContent = (
    <>
      {/* BLD-1114: Pulley pin tracking */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
            {t({ id: "settings.sessionPreferences.trackPulley", message: "Track pulley pin position" })}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs, marginTop: 2, lineHeight: 16 }}>
            {t({ id: "settings.sessionPreferences.trackPulleyHint", message: "Show a pin-number chip on cable sets to log which pulley pin you used." })}
          </Text>
        </View>
        <Switch
          value={pulleyPinTracking}
          onValueChange={updatePulleyPinTracking}
          accessibilityLabel={t({ id: "settings.sessionPreferences.trackPulley", message: "Track pulley pin position" })}
          accessibilityRole="switch"
          accessibilityHint={t({ id: "settings.sessionPreferences.trackPulleyA11y", message: "Show or hide the pulley pin chip on cable exercise sets" })}
        />
      </View>

      {/* BLD-559: Set-completion confirmation feedback */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
            {t({ id: "settings.sessionPreferences.captureRpe", message: "Capture set RPE during workouts" })}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs, marginTop: 2, lineHeight: 16 }}>
            {t({ id: "settings.sessionPreferences.captureRpeHint", message: "Tap a chip after each set to log how it felt. Powers the smart rest timer and progression suggestions." })}
          </Text>
        </View>
        <Switch
          testID="pref-capture-rpe-switch"
          value={captureRpe}
          onValueChange={updateCaptureRpe}
          accessibilityLabel={t({ id: "settings.sessionPreferences.captureRpe", message: "Capture set RPE during workouts" })}
          accessibilityRole="switch"
          accessibilityHint={t({ id: "settings.sessionPreferences.captureRpeA11y", message: "Shows effort chips after each set you complete" })}
        />
      </View>

      {/* BLD-2701: Intensity scale — RPE | RIR segmented control.
          Shown-disabled (not hidden) when RPE capture is OFF (Q1 decision). */}
      <View style={[styles.intensityScaleRow, !captureRpe && styles.rowDisabled]}>
        <View style={{ flex: 1 }}>
          <Text
            variant="body"
            style={{ color: captureRpe ? colors.onSurface : colors.onSurfaceVariant, fontSize: fontSizes.sm }}
          >
            {t({ id: "settings.sessionPreferences.intensityScale", message: "Intensity scale" })}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs, marginTop: 2, lineHeight: 16 }}>
            {captureRpe
              ? t({ id: "settings.sessionPreferences.rirHint", message: "RIR = reps left in reserve. RPE = 10 − RIR." })
              : t({ id: "settings.sessionPreferences.enableRpeHint", message: "Enable \"Capture set RPE\" above to use this setting." })}
          </Text>
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t({ id: "settings.sessionPreferences.intensityScale", message: "Intensity scale" })}
          style={[styles.segmentedControl, { borderColor: colors.outline }]}
          testID="pref-intensity-scale-control"
        >
          {(["rpe", "rir"] as const).map((mode) => {
            const isSelected = intensityMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => captureRpe && updateIntensityMode(mode)}
                disabled={!captureRpe}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: !captureRpe }}
                accessibilityLabel={mode.toUpperCase()}
                testID={`pref-intensity-scale-${mode}`}
                style={[
                  styles.segmentedOption,
                  { borderColor: colors.outline },
                  isSelected && { backgroundColor: colors.primary },
                  !captureRpe && styles.segmentedOptionDisabled,
                ]}
              >
                <Text
                  style={{
                    fontSize: fontSizes.xs,
                    fontWeight: "600",
                    color: isSelected
                      ? colors.onPrimary ?? "#fff"
                      : captureRpe
                        ? colors.onSurface
                        : colors.onSurfaceVariant,
                  }}
                >
                  {mode.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );

  if (bareContent) return <View>{preferencesContent}</View>;

  return (
    <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        {preferencesContent}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  intensityScaleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  rowDisabled: { opacity: 0.5 },
  segmentedControl: { flexDirection: "row", borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  segmentedOption: { paddingHorizontal: 14, paddingVertical: 7, alignItems: "center", justifyContent: "center" },
  segmentedOptionDisabled: {},
});
