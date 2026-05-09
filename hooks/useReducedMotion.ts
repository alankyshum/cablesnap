/**
 * useReducedMotion — wraps AccessibilityInfo.isReduceMotionEnabled() with
 * a live addEventListener('reduceMotionChanged') listener (BLD-1110 Tech N3).
 *
 * Returns true when the OS "Reduce Motion" accessibility setting is ON.
 * Components should skip slide-in animations and use instant-appear transitions.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
