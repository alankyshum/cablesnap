import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  buildAchievementContext,
  getEarnedAchievementMap,
  saveEarnedAchievements,
  hasSeenRetroactiveBanner,
  markRetroactiveBannerSeen,
} from "../lib/db";
import {
  getAllAchievementProgress,
  evaluateAchievements,
} from "../lib/achievements";
import type { AchievementCategory } from "../lib/achievements";

export type AchievementItem = {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  earned: boolean;
  earnedAt: number | null;
  progress: number;
};

export function useAchievements() {
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retroBanner, setRetroBanner] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const [ctx, earnedMap] = await Promise.all([
            buildAchievementContext(),
            getEarnedAchievementMap(),
          ]);

          // Retroactive evaluation: earn any new achievements silently
          const alreadyEarnedIds = new Set(earnedMap.keys());
          const newlyEarned = evaluateAchievements(ctx, alreadyEarnedIds);

          if (newlyEarned.length > 0) {
            const now = Date.now();
            await saveEarnedAchievements(
              newlyEarned.map((n) => n.achievement.id),
              now,
            );
            for (const n of newlyEarned) {
              earnedMap.set(n.achievement.id, now);
            }
          }

          // Show retroactive banner on first open
          const seenBanner = await hasSeenRetroactiveBanner();
          if (cancelled) return;
          if (!seenBanner && earnedMap.size > 0) {
            setRetroBanner(earnedMap.size);
            await markRetroactiveBannerSeen();
          }

          const progress = getAllAchievementProgress(ctx, earnedMap);
          if (cancelled) return;

          setItems(
            progress.map((p) => ({
              id: p.achievement.id,
              name: p.achievement.name,
              description: p.achievement.description,
              category: p.achievement.category,
              icon: p.achievement.icon,
              earned: p.earned,
              earnedAt: p.earnedAt,
              progress: p.progress,
            })),
          );
          setEarnedCount(earnedMap.size);
        } catch (e) {
          if (__DEV__) console.warn("Achievement evaluation failed:", e);
          if (!cancelled) setError("Could not load achievements. Please try again later.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  return { items, earnedCount, loading, error, retroBanner };
}
