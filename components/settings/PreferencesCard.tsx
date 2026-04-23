import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import { getAppSetting, setAppSetting } from "@/lib/db";
import { setEnabled as setAudioEnabled } from "@/lib/audio";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  children?: React.ReactNode;
};

export default function PreferencesCard({
  colors, toast,
  soundEnabled, setSoundEnabled,
  children,
}: Props) {
  const [soundTooltipVisible, setSoundTooltipVisible] = useState(false);

  // Intelligent Rest Timer (BLD-531) settings — default-on via `setting !== "false"`.
  const [adaptiveRest, setAdaptiveRest] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [restAfterWarmup, setRestAfterWarmup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting("rest_adaptive_enabled"),
      getAppSetting("rest_show_breakdown"),
      getAppSetting("rest_after_warmup_enabled"),
    ]).then(([adaptive, show, warmup]) => {
      if (cancelled) return;
      setAdaptiveRest(adaptive !== "false");
      setShowBreakdown(show !== "false");
      setRestAfterWarmup(warmup === "true");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const updateAdaptive = async (val: boolean) => {
    setAdaptiveRest(val);
    try { await setAppSetting("rest_adaptive_enabled", val ? "true" : "false"); }
    catch { toast.error("Failed to save adaptive rest setting"); }
  };

  const updateShowBreakdown = async (val: boolean) => {
    setShowBreakdown(val);
    try { await setAppSetting("rest_show_breakdown", val ? "true" : "false"); }
    catch { toast.error("Failed to save chip setting"); }
  };

  const updateRestAfterWarmup = async (val: boolean) => {
    setRestAfterWarmup(val);
    try { await setAppSetting("rest_after_warmup_enabled", val ? "true" : "false"); }
    catch { toast.error("Failed to save warmup rest setting"); }
  };

  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>Preferences</Text>

        {children}

        <View style={[styles.row, { marginTop: 16 }]}>
          <Pressable
            onPress={() => setSoundTooltipVisible(!soundTooltipVisible)}
            accessibilityRole="button"
            accessibilityLabel="Timer Sound. Tap for more info"
            style={{ flex: 1 }}
          >
            <View style={styles.labelWithIcon}>
              <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>Timer Sound</Text>
              <Text variant="caption" style={{ color: colors.primary, fontSize: fontSizes.xs, marginLeft: 4 }}>ⓘ</Text>
            </View>
          </Pressable>
          <Switch
            value={soundEnabled}
            onValueChange={async (val) => {
              setSoundEnabled(val);
              setAudioEnabled(val);
              try { await setAppSetting("timer_sound_enabled", val ? "true" : "false"); }
              catch { toast.error("Failed to save timer sound setting"); }
            }}
            accessibilityLabel="Timer Sound"
            accessibilityRole="switch"
            accessibilityHint="Enable or disable audio cues for workout timers"
          />
        </View>
        {soundTooltipVisible && (
          <Text variant="caption" style={[styles.tooltipText, { color: colors.onSurfaceVariant, backgroundColor: colors.surfaceVariant }]}>
            Audio cues for interval timers and rest countdowns.
          </Text>
        )}

        {/* Intelligent Rest Timer (BLD-531) */}
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
            Adaptive rest timer
          </Text>
          <Switch
            value={adaptiveRest}
            onValueChange={updateAdaptive}
            accessibilityLabel="Adaptive rest timer"
            accessibilityRole="switch"
            accessibilityHint="Adjust rest duration automatically by set type, RPE, and equipment"
          />
        </View>
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
            Show adaptive reason chip
          </Text>
          <Switch
            value={showBreakdown}
            onValueChange={updateShowBreakdown}
            accessibilityLabel="Show adaptive reason chip"
            accessibilityRole="switch"
            accessibilityHint="Show why the timer picked this rest duration"
            disabled={!adaptiveRest}
          />
        </View>
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
            Rest after warmup sets
          </Text>
          <Switch
            value={restAfterWarmup}
            onValueChange={updateRestAfterWarmup}
            accessibilityLabel="Rest after warmup sets"
            accessibilityRole="switch"
            accessibilityHint="Start a short rest timer after warmup sets"
          />
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  labelWithIcon: { flexDirection: "row", alignItems: "center" },
  tooltipText: { fontSize: fontSizes.xs, padding: 10, borderRadius: 6, marginBottom: 8, lineHeight: 18 },
});
