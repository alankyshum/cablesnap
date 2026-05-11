/**
 * BLD-1158b: CoachOverlay — shows the active Tempo Coach state.
 *
 * Displayed as a compact overlay banner when the coach is running.
 * Shows the current phase label + a visual phase ring (AC5 reduce-motion).
 * Stop Coach button cancels the session (AC12).
 */
import React, { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import type { CoachPhase, CoachAbortReason } from "@/lib/workout/tempo-coach";

export type CoachOverlayProps = {
  currentPhase: CoachPhase | null;
  tempo: string; // e.g. "3-1-2-0"
  onStop: (reason?: CoachAbortReason) => void;
};

const PHASE_LABELS: Record<CoachPhase, string> = {
  eccentric: "Lower ↓",
  bottom_pause: "Hold ⏸",
  concentric: "Lift ↑",
  top_pause: "Hold ⏸",
};

const PHASE_ORDER: CoachPhase[] = ["eccentric", "bottom_pause", "concentric", "top_pause"];

export function CoachOverlay({ currentPhase, tempo, onStop }: CoachOverlayProps) {
  const colors = useThemeColors();

  const handleStop = useCallback(() => {
    onStop("manual");
  }, [onStop]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.primaryContainer }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        currentPhase ? `Tempo Coach: ${PHASE_LABELS[currentPhase]}` : "Tempo Coach running"
      }
    >
      {/* Phase ring — visual indicator (also satisfies AC5 reduce-motion users) */}
      <View style={styles.phaseRingRow}>
        {PHASE_ORDER.map((phase) => (
          <View
            key={phase}
            style={[
              styles.phaseSegment,
              {
                backgroundColor:
                  phase === currentPhase ? colors.primary : colors.outlineVariant,
              },
            ]}
            accessibilityElementsHidden
          />
        ))}
      </View>

      <View style={styles.contentRow}>
        <View style={{ flex: 1 }}>
          <Text
            variant="caption"
            style={{ color: colors.onPrimaryContainer, fontSize: fontSizes.xs, opacity: 0.8 }}
          >
            Tempo Coach · {tempo}
          </Text>
          {currentPhase ? (
            <Text
              variant="body"
              style={{ color: colors.onPrimaryContainer, fontWeight: "700", fontSize: fontSizes.sm }}
              accessibilityLiveRegion="polite"
            >
              {PHASE_LABELS[currentPhase]}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleStop}
          style={[styles.stopButton, { backgroundColor: colors.errorContainer }]}
          accessibilityRole="button"
          accessibilityLabel="Stop Tempo Coach"
          hitSlop={12}
        >
          <Text
            style={{ color: colors.onErrorContainer, fontSize: fontSizes.xs, fontWeight: "700" }}
          >
            Stop
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  phaseRingRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
  },
  phaseSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stopButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
});
