import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import * as Haptics from "expo-haptics";
import { useReducedMotion } from "react-native-reanimated";

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

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
