import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import { getAppSetting, setAppSetting } from "@/lib/db";
import { setEnabled as setAudioCategoryEnabled } from "@/lib/audio";
import {
  setSetCompletionHaptic,
  setSetCompletionAudio,
} from "@/hooks/useSetCompletionFeedback";
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

  // Intelligent Rest Timer (BLD-531) settings — adaptive rest defaults ON
  // (`!== "false"`). Breakdown chip defaults OFF (BLD-616) — explicit "true"
  // required, so initial state is `false` to avoid a hydration flash.
  const [adaptiveRest, setAdaptiveRest] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [restAfterWarmup, setRestAfterWarmup] = useState(false);

  // BLD-559: set-completion confirmation feedback — haptic default ON,
  // audio default OFF.
  const [setCompleteHaptic, setSetCompleteHapticState] = useState(true);
  const [setCompleteAudio, setSetCompleteAudioState] = useState(false);

  // BLD-580 helper-row tri-state (PLAN-BLD-580 §Technical Approach):
  //   true  = hide helper (safe default; also post-interaction state)
  //   false = show helper (only after hydration resolves a null stored value)
  // Initialized `true` to guarantee the helper row CANNOT render before
  // hydration completes (AC-4: no FOUC flash for returning users).
  const [audioEverInteracted, setAudioEverInteracted] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting("rest_adaptive_enabled"),
      getAppSetting("rest_show_breakdown"),
      getAppSetting("rest_after_warmup_enabled"),
      getAppSetting("feedback.setComplete.haptic"),
      getAppSetting("feedback.setComplete.audio"),
    ]).then(([adaptive, show, warmup, scHaptic, scAudio]) => {
      if (cancelled) return;
      setAdaptiveRest(adaptive !== "false");
      setShowBreakdown(show === "true");
      setRestAfterWarmup(warmup === "true");
      setSetCompleteHapticState(scHaptic !== "false");
      setSetCompleteAudioState(scAudio === "true");
      setAudioEverInteracted(scAudio != null);
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

  const updateSetCompleteHaptic = async (val: boolean) => {
    setSetCompleteHapticState(val);
    try { await setSetCompletionHaptic(val); }
    catch { toast.error("Failed to save set-complete haptic setting"); }
  };

  const updateSetCompleteAudio = async (val: boolean) => {
    setSetCompleteAudioState(val);
    // BLD-580: any toggle interaction (either direction) permanently hides
    // the discoverability helper row for this session; persistence is via
    // feedback.setComplete.audio becoming non-null.
    setAudioEverInteracted(true);
    try { await setSetCompletionAudio(val); }
    catch { toast.error("Failed to save set-complete sound setting"); }
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
              setAudioCategoryEnabled("timer", val);
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

        {/* BLD-559: Set-completion confirmation feedback */}
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
            Haptic on set complete
          </Text>
          <Switch
            value={setCompleteHaptic}
            onValueChange={updateSetCompleteHaptic}
            accessibilityLabel="Haptic on set complete"
            accessibilityRole="switch"
            accessibilityHint="Vibrate briefly when you tap to complete a set"
          />
        </View>
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
            Sound on set complete
          </Text>
          <Switch
            value={setCompleteAudio}
            onValueChange={updateSetCompleteAudio}
            accessibilityLabel="Sound on set complete"
            accessibilityRole="switch"
            accessibilityHint="Play a short confirmation tone when you tap to complete a set"
          />
        </View>
        {/* BLD-580 discoverability helper row. Non-pressable (pure <Text>),
            rendered ONLY while the user has never interacted with the audio
            toggle. Auto-dismisses silently on first interaction. Locked
            copy — DO NOT edit without updating AC-2 snapshot test. */}
        {!audioEverInteracted && (
          <Text
            variant="caption"
            accessibilityRole="text"
            style={[styles.helperRow, { color: colors.onSurfaceVariant, fontSize: fontSizes.xs }]}
            testID="set-complete-audio-helper"
          >
            Plays a short confirmation cue when you complete a set.
          </Text>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  labelWithIcon: { flexDirection: "row", alignItems: "center" },
  tooltipText: { fontSize: fontSizes.xs, padding: 10, borderRadius: 6, marginBottom: 8, lineHeight: 18 },
  helperRow: { marginTop: -4, marginBottom: 8, lineHeight: 18 },
});
