import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ShareCardExercise, ShareCardPR } from "@/components/ShareCard";
import { toDisplay } from "@/lib/units";
import { formatTime } from "@/lib/format";
import { getBodySettings, getEffectivePromoCaption, getShareSettings, getSyncLogForSession, type StravaSyncLog } from "@/lib/db";
import type { ExerciseGroup } from "@/hooks/useSessionDetail";

type SessionLike = {
  name?: string | null;
  started_at?: number | null;
  duration_seconds?: number | null;
};

type PR = { name: string; weight: number };

export function useSessionShareData(
  session: SessionLike | null,
  groups: ExerciseGroup[],
  prs: PR[],
  completedSetCount: number,
  sessionId?: string,
) {
  const shareSheetRef = useRef<BottomSheetModal>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [promoCaption, setPromoCaption] = useState<string>("");
  const [promoEnabled, setPromoEnabled] = useState<boolean>(false);
  const [stravaActivityId, setStravaActivityId] = useState<string | null>(null);
  const [stravaSynced, setStravaSynced] = useState<boolean>(false);

  const fetchSyncLog = useCallback((id: string, onDone?: (log: StravaSyncLog | null) => void) => {
    getSyncLogForSession(id)
      .then((log) => {
        if (onDone) {
          onDone(log);
        } else if (id === sessionId) {
          if (log && log.status === "synced" && log.strava_activity_id) {
            setStravaActivityId(log.strava_activity_id);
            setStravaSynced(true);
          } else {
            setStravaActivityId(null);
            setStravaSynced(false);
          }
        }
      })
      .catch(() => {
        if (id === sessionId) {
          setStravaActivityId(null);
          setStravaSynced(false);
        }
      });
  }, [sessionId]);

  const refreshSyncLog = useCallback(() => {
    if (sessionId) {
      fetchSyncLog(sessionId);
    }
  }, [sessionId, fetchSyncLog]);

  useEffect(() => {
    let cancelled = false;

    // Reset state before/at fetch when sessionId changes
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale strava state on sessionId change
    setStravaActivityId(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale strava state on sessionId change
    setStravaSynced(false);

    getBodySettings()
      .then((s) => {
        if (!cancelled) setUnit(s.weight_unit as "kg" | "lb");
      })
      .catch(() => {});
    getEffectivePromoCaption()
      .then((c) => {
        if (!cancelled) setPromoCaption(c);
      })
      .catch(() => {});
    getShareSettings()
      .then((s) => {
        if (!cancelled) setPromoEnabled(!!s.promo_caption_enabled);
      })
      .catch(() => {});
    if (sessionId) {
      const activeSessionId = sessionId;
      fetchSyncLog(activeSessionId, (log) => {
        if (!cancelled && activeSessionId === sessionId) {
          if (log && log.status === "synced" && log.strava_activity_id) {
            setStravaActivityId(log.strava_activity_id);
            setStravaSynced(true);
          } else {
            setStravaActivityId(null);
            setStravaSynced(false);
          }
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [sessionId, fetchSyncLog]);

  const duration = session?.duration_seconds ? formatTime(session.duration_seconds) : "0:00";
  const volumeRaw = groups.reduce((sum, g) => {
    for (const s of g.sets) {
      // BLD-1174: use cached_volume_kg (segment-aware); fall back to weight*reps for legacy rows
      if (s.completed && s.set_type !== 'warmup') {
        sum += s.cached_volume_kg ?? (s.weight ?? 0) * (s.reps ?? 0);
      }
    }
    return sum;
  }, 0);
  const volumeDisplay = toDisplay(volumeRaw, unit);

  const sessionStartedAt = session?.started_at;
  const shareCardDate = useMemo(() => {
    if (!sessionStartedAt) return "";
    return new Date(sessionStartedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [sessionStartedAt]);

  const shareCardPrs = useMemo(
    (): ShareCardPR[] =>
      prs.map((pr) => ({ name: pr.name, value: `${toDisplay(pr.weight, unit)} ${unit}` })),
    [prs, unit],
  );

  const shareCardExercises = useMemo((): ShareCardExercise[] => {
    return groups.map((g) => {
      const done = g.sets.filter((s) => s.completed);
      const maxW = Math.max(0, ...done.map((s) => s.weight ?? 0));
      const reps = done.length > 0 ? (done[0].reps ?? 0) : 0;
      return {
        name: g.name,
        sets: done.length,
        reps: String(reps),
        weight: maxW > 0 ? `${toDisplay(maxW, unit)} ${unit}` : undefined,
      };
    });
  }, [groups, unit]);

  const handleShareButtonPress = useCallback(() => {
    console.log("CABLESNAP_DEBUG: handleShareButtonPress called!", !!shareSheetRef.current);
    shareSheetRef.current?.present();
  }, []);

  const handleShareText = useCallback(async () => {
    if (!session) return;
    const lines = [
      `\u{1F3CB}\u{FE0F} ${session.name ?? "Workout"} Complete!`,
      `Duration: ${duration}`,
      `Sets: ${completedSetCount}`,
      `Volume: ${volumeDisplay.toLocaleString()} ${unit}`,
    ];
    if (prs.length > 0) {
      lines.push("", "\u{1F3C6} New PRs:");
      for (const pr of prs) lines.push(`  ${pr.name}: ${toDisplay(pr.weight, unit)} ${unit}`);
    }
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      /* cancelled */
    }
  }, [session, duration, completedSetCount, volumeDisplay, unit, prs]);

  return {
    shareSheetRef,
    unit,
    duration,
    volumeDisplay,
    shareCardDate,
    shareCardPrs,
    shareCardExercises,
    promoCaption,
    promoEnabled,
    stravaActivityId,
    stravaSynced,
    handleShareButtonPress,
    handleShareText,
    refreshSyncLog,
  };
}
