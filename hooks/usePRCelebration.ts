import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
// BLD-559 (APPROVED R2): `triggerPR` is visual + a11y ONLY. The Medium
// haptic formerly fired here is now owned exclusively by
// `hooks/useSetCompletionFeedback.ts` and fires synchronously at tap
// time in `components/session/SetRow.tsx`. Do NOT re-introduce a
// `Haptics.impactAsync` / `Haptics.notificationAsync` / audio call in
// this file — stacking haptics on PR sets is a banned Dealer-drift
// vector per `.plans/PLAN-BLD-559.md` and will fail the static-source
// grep regression test.

export type PRCelebrationState = {
  visible: boolean;
  exerciseName: string;
  showConfetti: boolean;
  goalAchieved: boolean;
};

export function usePRCelebration() {
  const [celebration, setCelebration] = useState<PRCelebrationState>({
    visible: false,
    exerciseName: "",
    showConfetti: false,
    goalAchieved: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

  const triggerPR = useCallback(
    (exerciseName: string, goalAchieved = false) => {
      // Clear any existing timer
      if (timerRef.current) clearTimeout(timerRef.current);

      // BLD-559 R2: PR haptic intentionally removed — see file header.
      const announcement = goalAchieved
        ? `Goal achieved! New personal record for ${exerciseName}`
        : `New personal record for ${exerciseName}`;
      AccessibilityInfo.announceForAccessibility(announcement);

      setCelebration({
        visible: true,
        exerciseName,
        showConfetti: !reducedMotion,
        goalAchieved,
      });

      timerRef.current = setTimeout(() => {
        setCelebration((prev) => ({ ...prev, visible: false }));
        timerRef.current = null;
      }, 2000);
    },
    [reducedMotion]
  );

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { celebration, triggerPR, cleanup };
}
