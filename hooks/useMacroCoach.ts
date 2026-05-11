import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { computeMacroCoach, clearMacroCoachMemo } from "../lib/db/macro-coach";
import type { CoachStatus, MacroCoachResult } from "../lib/db/macro-coach";
import type { CoachSuggestion, SkipReason } from "../lib/macro-coach";

export type { CoachStatus };

export interface UseMacroCoachResult {
  status: CoachStatus;
  suggestion?: CoachSuggestion;
  skipReason?: SkipReason;
  safetyFloorKcal?: number;
  userWeightKg?: number;
  loading: boolean;
  refetch: () => void;
  clearCache: () => void;
}

export function useMacroCoach(): UseMacroCoachResult {
  const [result, setResult] = useState<MacroCoachResult>({ status: "loading" });
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await computeMacroCoach(new Date());
      if (mounted.current) setResult(r);
    } catch {
      if (mounted.current) setResult({ status: "hidden" });
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetch(); }, [fetch]));

  const clearCache = useCallback(() => {
    clearMacroCoachMemo();
    fetch();
  }, [fetch]);

  return {
    status: result.status,
    suggestion: result.suggestion,
    skipReason: result.skipReason,
    safetyFloorKcal: result.safetyFloorKcal,
    userWeightKg: result.userWeightKg,
    loading,
    refetch: fetch,
    clearCache,
  };
}
