/**
 * BLD-1111: One-time RPE capture discoverability nudge.
 *
 * Rendered only from ExerciseDetailPane (out-of-session context).
 * Shows once, never again after explicit dismiss or enable.
 * Psychologist-approved Variant B copy (plan-locked; do not paraphrase).
 */
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import { exerciseHasHistoricalRpe } from "@/lib/db/exercise-history";
import {
  hasSeenRpeCaptureNudge,
  markRpeCaptureNudgeSeen,
} from "@/lib/db/achievements";
import { getAppSetting, setAppSetting } from "@/lib/db";
import { bumpQueryVersion } from "@/lib/query";
import { useToast } from "@/components/ui/bna-toast";

export const RPE_NUDGE_HEADLINE = "Capture how each set feels";
export const RPE_NUDGE_BODY =
  "You've logged RPE before. One tap after each set, and your rest adapts.";

interface Props {
  exerciseId: string;
  onDismiss?: () => void;
}

export function RpeCaptureNudge({ exerciseId, onDismiss }: Props) {
  const colors = useThemeColors();
  const { toast } = useToast();
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [writeInFlight, setWriteInFlight] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    async function check() {
      try {
        const [seen, hasRpe, captureRpePref] = await Promise.all([
          hasSeenRpeCaptureNudge(),
          exerciseHasHistoricalRpe(exerciseId),
          getAppSetting("session.captureRpe"),
        ]);
        if (!alive.current) return;
        setEligible(!seen && hasRpe && captureRpePref !== "true");
      } catch {
        // predicate failure → silently skip banner (safe degradation)
        if (alive.current) setEligible(false);
      }
    }
    check();
    return () => { alive.current = false; };
  }, [exerciseId]);

  if (!eligible) return null;

  /** "Turn on" — write nudgeShown FIRST, then captureRpe. AC15 write order. */
  async function handleTurnOn() {
    if (writeInFlight) return;
    setWriteInFlight(true);
    try {
      await markRpeCaptureNudgeSeen();
    } catch {
      setWriteInFlight(false);
      toast({ description: "Couldn't save — try again." });
      return;
    }
    try {
      await setAppSetting("session.captureRpe", "true");
      bumpQueryVersion("preferences");
    } catch {
      // nudgeShown already written — banner will never show again
      toast({ description: "Saved your dismissal but couldn't enable capture — open Settings to retry." });
    }
    setEligible(false);
    onDismiss?.();
  }

  /** "Not now" — write nudgeShown only. */
  async function handleNotNow() {
    if (writeInFlight) return;
    setWriteInFlight(true);
    try {
      await markRpeCaptureNudgeSeen();
    } catch {
      setWriteInFlight(false);
      toast({ description: "Couldn't save — try again." });
      return;
    }
    setEligible(false);
    onDismiss?.();
  }

  return (
    <View
      testID="rpe-capture-nudge"
      accessibilityLabel={`${RPE_NUDGE_HEADLINE}. ${RPE_NUDGE_BODY}`}
      style={[
        styles.banner,
        {
          backgroundColor: colors.surfaceVariant,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      <Text
        variant="body"
        style={{ color: colors.onSurface, fontSize: fontSizes.sm, fontWeight: "600", marginBottom: 4 }}
      >
        {RPE_NUDGE_HEADLINE}
      </Text>
      <Text
        variant="body"
        style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm, lineHeight: 18, marginBottom: 12 }}
      >
        {RPE_NUDGE_BODY}
      </Text>
      <View style={styles.buttonRow}>
        <Pressable
          testID="rpe-capture-nudge-turn-on"
          onPress={handleTurnOn}
          disabled={writeInFlight}
          accessibilityRole="button"
          accessibilityLabel="Turn on live RPE capture"
          accessibilityState={{ disabled: writeInFlight }}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: colors.primary, fontSize: fontSizes.sm, fontWeight: "600" }}>
            Turn on
          </Text>
        </Pressable>
        <Pressable
          testID="rpe-capture-nudge-not-now"
          onPress={handleNotNow}
          disabled={writeInFlight}
          accessibilityRole="button"
          accessibilityLabel="Dismiss RPE capture suggestion"
          accessibilityState={{ disabled: writeInFlight }}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}>
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  btnPrimary: {
    // No fill — text button matching BodyweightModifierNotice aesthetic
  },
});
