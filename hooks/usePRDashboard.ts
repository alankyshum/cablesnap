import { useCallback, useRef, useState } from "react";
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
  reload: () => void;
};

export function usePRDashboard(): PRDashboardData {
  const [stats, setStats] = useState<PRStats>({ totalPRs: 0, prsThisMonth: 0 });
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([]);
  const [allTimeBests, setAllTimeBests] = useState<AllTimeBest[]>([]);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, r, a, settings] = await Promise.all([
        getPRStats(),
        getRecentPRsWithDelta(20),
        getAllTimeBests(),
        getBodySettings(),
      ]);
      if (cancelledRef.current) return;
      setStats(s);
      setRecentPRs(r);
      setAllTimeBests(a);
      setWeightUnit(settings.weight_unit as "kg" | "lb");
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load PR data");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cancelledRef.current = false;
      void load();
      return () => {
        cancelledRef.current = true;
      };
    }, [load])
  );

  const reload = useCallback(() => {
    cancelledRef.current = false;
    void load();
  }, [load]);

  return { stats, recentPRs, allTimeBests, weightUnit, loading, error, reload };
}
