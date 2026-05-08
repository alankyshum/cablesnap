/**
 * hooks/useMediaSurfaceMounted.ts
 *
 * Call this hook at the root of every component that renders a native
 * camera preview, video player, thumbnail grid, or compare view.
 *
 * Mount increments the Sentry replay-gate counter so
 * `beforeErrorSampling` returns false while the surface is visible.
 * Unmount decrements it. See lib/media/replay-gate.ts for the full
 * AC12 rationale.
 */
import { useEffect } from "react";
import { increment, decrement } from "@/lib/media/replay-gate";

export function useMediaSurfaceMounted(): void {
  useEffect(() => {
    increment();
    return () => {
      decrement();
    };
  }, []);
}
