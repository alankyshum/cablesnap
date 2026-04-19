import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import * as Haptics from "expo-haptics";
import { useReducedMotion } from "react-native-reanimated";

export type PRCelebrationState = {
  visible: boolean;
  exerciseName: string;
  showConfetti: boolean;
};

export function usePRCelebration() {
  const [celebration, setCelebration] = useState<PRCelebrationState>({
    visible: false,
    exerciseName: "",
    showConfetti: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

  const triggerPR = useCallback(
    (exerciseName: string) => {
      // Clear any existing timer
      if (timerRef.current) clearTimeout(timerRef.current);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      AccessibilityInfo.announceForAccessibility(
        `New personal record for ${exerciseName}`
      );

      setCelebration({
        visible: true,
        exerciseName,
        showConfetti: !reducedMotion,
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
