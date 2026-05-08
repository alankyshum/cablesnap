/**
 * CompareView.tsx
 *
 * Side-by-side (1x1 vertical split) comparison of two form-check clips.
 * Each clip plays independently with its own play/pause controls.
 *
 * AC4: VoiceOver/TalkBack focus order: clip 1 controls → clip 2 controls.
 * AC4: RTL invariant — vertical split, no inversion.
 * useMediaSurfaceMounted() called at root (AC12 Sentry gate).
 */
import React, { useCallback } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { radii } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useMediaSurfaceMounted } from "@/hooks/useMediaSurfaceMounted";
import { toAbsPath } from "@/lib/media/form-clips";
import type { SetMediaRow } from "@/lib/db/form-clips";

type Props = {
  isVisible: boolean;
  clipA: SetMediaRow;
  clipB: SetMediaRow;
  onClose: () => void;
};

export function CompareView({ isVisible, clipA, clipB, onClose }: Props) {
  if (!isVisible) return null;
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={isVisible}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <CompareBody clipA={clipA} clipB={clipB} onClose={onClose} />
    </Modal>
  );
}

type BodyProps = Omit<Props, "isVisible">;

function CompareBody({ clipA, clipB, onClose }: BodyProps) {
  const colors = useThemeColors();

  // AC12: increment replay-gate counter while both players are mounted.
  useMediaSurfaceMounted();

  return (
    // eslint-disable-next-line no-restricted-syntax
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* Close */}
      <Pressable
        style={styles.closeBtn}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close comparison"
      >
        {/* eslint-disable-next-line no-restricted-syntax */}
        <MaterialCommunityIcons name="close" size={28} color="#fff" />
      </Pressable>
      {/* Clip A — top half */}
      <ClipPane clip={clipA} label="A" accessibilityOrder={1} />
      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.outline }]} />
      {/* Clip B — bottom half */}
      <ClipPane clip={clipB} label="B" accessibilityOrder={2} />
    </View>
  );
}

type PaneProps = {
  clip: SetMediaRow;
  label: string;
  accessibilityOrder: number;
};

function ClipPane({ clip, label, accessibilityOrder }: PaneProps) {
  const player = useVideoPlayer({ uri: toAbsPath(clip.rel_path) }, (p) => {
    p.loop = true;
  });

  const toggle = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const dateStr = new Date(clip.created_at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={styles.pane} importantForAccessibility="yes" accessibilityViewIsModal={false}>
      <Sentry_Mask>
        <VideoView
          player={player}
          style={styles.video}
          nativeControls={false}
          contentFit="contain"
          accessibilityLabel={`Clip ${label}, recorded ${dateStr}. Clip ${accessibilityOrder} of 2.`}
        />
      </Sentry_Mask>
      {/* Overlay controls */}
      <Pressable
        style={styles.playOverlay}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={player.playing ? `Pause clip ${label}` : `Play clip ${label}`}
      >
        {!player.playing && (
          <View style={styles.playIcon}>
            {/* eslint-disable-next-line no-restricted-syntax */}
            <MaterialCommunityIcons name="play" size={28} color="#fff" />
          </View>
        )}
      </Pressable>
      <View style={styles.dateLabel} pointerEvents="none">
        <Text style={styles.dateLabelText}>{label} · {dateStr}</Text>
      </View>
    </View>
  );
}

function Sentry_Mask({ children }: { children: React.ReactNode }) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
    // eslint-disable-next-line react-hooks/error-boundaries
    return <Sentry.Mask>{children}</Sentry.Mask>;
  } catch {
    return <>{children}</>;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  divider: { height: 2 },
  pane: { flex: 1, position: "relative" },
  video: { flex: 1 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  dateLabel: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // eslint-disable-next-line no-restricted-syntax
  dateLabelText: { color: "#fff", fontSize: 11 },
});
