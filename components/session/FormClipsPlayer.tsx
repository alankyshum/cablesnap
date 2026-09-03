import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/**
 * FormClipsPlayer.tsx
 *
 * Bottom-sheet player for a single form-check video clip.
 * Renders meta (date, weight, reps) above the player.
 *
 * useMediaSurfaceMounted() is called at the root (AC12 Sentry gate).
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useMediaSurfaceMounted } from "@/hooks/useMediaSurfaceMounted";
import { toAbsPath } from "@/lib/media/form-clips";
import type { SetMediaRow } from "@/lib/db/form-clips";

type Props = {
  isVisible: boolean;
  clip: SetMediaRow | null;
  /** Weight displayed in the meta row (formatted string, e.g. "100 kg"). */
  weightLabel?: string;
  /** Reps to display. */
  reps?: number | null;
  onClose: () => void;
  onDelete?: (clip: SetMediaRow) => void;
  /** Exercise this clip belongs to — needed to count sibling clips. */
  exerciseId?: string;
  /** Total number of clips for this exercise (including current). */
  siblingClipCount?: number;
  /** Called when user taps "Compare with another set…" — receiver opens CompareView. */
  onRequestCompare?: (clipA: SetMediaRow) => void;
};

export function FormClipsPlayer({ isVisible, clip, weightLabel, reps, onClose, onDelete, siblingClipCount, onRequestCompare }: Props) {
  if (!isVisible || !clip) return null;
  return (
    <BottomSheet isVisible={isVisible} onClose={onClose}>
      <PlayerBody
        key={clip.id}
        clip={clip}
        weightLabel={weightLabel}
        reps={reps}
        onDelete={onDelete}
        siblingClipCount={siblingClipCount}
        onRequestCompare={onRequestCompare}
      />
    </BottomSheet>
  );
}

type BodyProps = Pick<Props, "clip" | "weightLabel" | "reps" | "onDelete" | "siblingClipCount" | "onRequestCompare">;

function PlayerBody({ clip, weightLabel, reps, onDelete, siblingClipCount, onRequestCompare }: BodyProps) {
  const colors = useThemeColors();

  // AC12: increment replay-gate counter while this player surface is mounted.
  useMediaSurfaceMounted();

  const absPath = toAbsPath(clip!.rel_path);
  const player = useVideoPlayer({ uri: absPath }, (p) => {
    p.loop = true;
    p.play();
  });

  const [aspectRatio, setAspectRatio] = React.useState<number>(() => {
    const w = clip!.width;
    const h = clip!.height;
    return w && h && h > 0 ? w / h : 9 / 16;
  });

  React.useEffect(() => {
    const sub = player.addListener("sourceLoad", (payload: unknown) => {
      const typedPayload = payload as { videoSize?: { width: number; height: number }; videoSource?: { videoSize?: { width: number; height: number } } } | undefined;
      const size = typedPayload?.videoSize ?? typedPayload?.videoSource?.videoSize;
      const w = size?.width;
      const h = size?.height;
      if (w && h && h > 0) setAspectRatio(w / h);
    });
    return () => sub.remove();
  }, [player]);

  const dateStr = new Date(clip!.created_at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const durationStr = clip!.duration_ms
    ? `${Math.round(clip!.duration_ms / 1000)}s`
    : null;

  return (
    <View style={styles.container}>
      <Sentry_Mask>
        <VideoView
          player={player}
          style={[styles.video, { aspectRatio }]}
          nativeControls
          contentFit="contain"
          accessibilityLabel={
            `Form clip from ${dateStr}` +
            (weightLabel ? `, ${weightLabel}` : "") +
            (reps ? `, ${reps} reps` : "") +
            (durationStr ? `, ${durationStr}` : "")
          }
        />
      </Sentry_Mask>
      <View style={[styles.meta, { backgroundColor: colors.surfaceVariant }]}>
        <Text style={[styles.metaDate, { color: colors.onSurfaceVariant }]}>{dateStr}</Text>
        {weightLabel && <Text style={[styles.metaVal, { color: colors.onSurface }]}>{weightLabel}</Text>}
        {reps != null && <Text style={[styles.metaVal, { color: colors.onSurface }]}>{reps} reps</Text>}
        {durationStr && <Text style={[styles.metaVal, { color: colors.onSurfaceVariant }]}>{durationStr}</Text>}
      </View>
      {onDelete && (
        <Pressable
          style={[styles.deleteBtn, { borderColor: colors.error }]}
          onPress={() => onDelete(clip!)}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "session.formclipsplayer.str1", message: "Delete this clip" })}
        >
          <Text style={{ color: colors.error, fontWeight: "600" }}>{t({ id: "session.formclipsplayer.str3", message: "Delete clip" })}</Text>
        </Pressable>
      )}
      {/* AC2/AC7: "Compare with another set…" entry point */}
      {(() => {
        const canCompare = (siblingClipCount ?? 0) >= 2;
        return (
          <Pressable
            style={[styles.compareBtn, { borderColor: colors.primary, opacity: canCompare ? 1 : 0.4 }]}
            onPress={canCompare && onRequestCompare ? () => onRequestCompare(clip!) : undefined}
            disabled={!canCompare}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "session.formclipsplayer.str2", message: "Compare with another set…" })}
            accessibilityState={{ disabled: !canCompare }}
            accessibilityHint={
              !canCompare
                ? "You need at least two clips for this exercise to compare"
                : "Opens a side-by-side comparison with a clip you pick"
            }
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>{t({ id: "session.formclipsplayer.str4", message: "Compare with another set…" })}</Text>
          </Pressable>
        );
      })()}
    </View>
  );
}

/** Sentry.Mask wrapper — masks this element in Mobile Replay (defense-in-depth). */
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
  container: { paddingBottom: 24, alignItems: "stretch" },
  video: {
    width: "100%",
    // aspectRatio now supplied dynamically from video metadata (fallback 9/16)
    maxHeight: "70%",
    alignSelf: "center",
    // eslint-disable-next-line no-restricted-syntax
    backgroundColor: "#000",
    borderRadius: 8,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  metaDate: { fontSize: 13 },
  metaVal: { fontSize: 13, fontWeight: "600" },
  deleteBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginHorizontal: 4,
  },
  compareBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginHorizontal: 4,
  },
});
