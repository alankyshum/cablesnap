/**
 * BLD-1130 G1 (closes BLD-1127 AC4): react-query hook for the one-time
 * stack-marker hint dismissal. Reads `app_settings.stackMarkerHintDismissedAt`
 * and exposes a `dismiss()` mutation that writes the current timestamp and
 * invalidates the query so every mounted hint hides at once.
 *
 * Visibility is the caller's responsibility — this hook only owns the
 * dismissal state, not the gating predicate (cable + uncalibrated). That keeps
 * the hook reusable for any future "did the user dismiss this hint" surface.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  STACK_MARKER_HINT_DISMISSED_AT_KEY,
  dismissStackMarkerHint,
  getStackMarkerHintDismissedAt,
} from "@/lib/stack-marker-hint";

const QUERY_KEY = ["app_settings", STACK_MARKER_HINT_DISMISSED_AT_KEY] as const;

export type StackMarkerHintState = {
  /** True when the user has never dismissed the hint. */
  dismissed: boolean;
  /** Synchronous dismisser; safe to call from onPress. */
  dismiss: () => void;
  /** Underlying ISO timestamp (null when never dismissed). */
  dismissedAt: string | null;
};

export function useStackMarkerHint(): StackMarkerHintState {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getStackMarkerHintDismissedAt,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: () => dismissStackMarkerHint(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  const dismissedAt = data ?? null;
  return {
    dismissed: dismissedAt !== null,
    dismissedAt,
    dismiss: () => {
      mutation.mutate();
    },
  };
}
