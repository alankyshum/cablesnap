/**
 * useSessionPacing — TanStack Query hook for session pacing breakdown (BLD-1144).
 *
 * Cache key: ['session-pacing', sessionId, session.edited_at ?? session.completed_at]
 * Keyed on edited_at so completed-session edits automatically invalidate pacing.
 * staleTime: Infinity — safe because the key bumps on every edit.
 * See lib/db/sessions.ts:482-548 for the edit flow that stamps edited_at.
 */

import { useQuery } from "@tanstack/react-query";
import { computePacing, type PacingBreakdown } from "@/lib/session-pacing";
import { getSessionPacingSets, getPacingSession } from "@/lib/db/session-pacing";

type Props = {
  sessionId: string;
  /**
   * Pass session.edited_at ?? session.completed_at.
   * TanStack Query bumps the cache key whenever this changes, invalidating stale pacing.
   */
  editStamp: number | null | undefined;
};

async function fetchPacing(sessionId: string): Promise<PacingBreakdown> {
  const [sets, session] = await Promise.all([
    getSessionPacingSets(sessionId),
    getPacingSession(sessionId),
  ]);
  return computePacing(sets, session ?? { started_at: null, completed_at: null });
}

export function useSessionPacing({ sessionId, editStamp }: Props): {
  pacing: PacingBreakdown | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["session-pacing", sessionId, editStamp ?? null],
    queryFn: () => fetchPacing(sessionId),
    staleTime: Infinity,
    enabled: !!sessionId,
  });
  return { pacing: data, isLoading };
}
