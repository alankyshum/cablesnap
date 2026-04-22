import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  getPRStats,
  getRecentPRsWithDelta,
  getAllTimeBests,
} from "../lib/db/pr-dashboard";
import { getBodySettings } from "../lib/db";
import type { PRStats, RecentPR, AllTimeBest } from "../lib/db/pr-dashboard";

export type PRDashboardData = {
  stats: PRStats;
  recentPRs: RecentPR[];
  allTimeBests: AllTimeBest[];
  weightUnit: "kg" | "lb";
  loading: boolean;
  error: string | null;
};

export function usePRDashboard(): PRDashboardData {
  const [stats, setStats] = useState<PRStats>({ totalPRs: 0, prsThisMonth: 0 });
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([]);
  const [allTimeBests, setAllTimeBests] = useState<AllTimeBest[]>([]);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          setLoading(true);
          setError(null);
          const [s, r, a, settings] = await Promise.all([
            getPRStats(),
            getRecentPRsWithDelta(20),
            getAllTimeBests(),
            getBodySettings(),
          ]);
          if (cancelled) return;
          setStats(s);
          setRecentPRs(r);
          setAllTimeBests(a);
          setWeightUnit(settings.weight_unit as "kg" | "lb");
        } catch (e) {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Failed to load PR data");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  return { stats, recentPRs, allTimeBests, weightUnit, loading, error };
}
