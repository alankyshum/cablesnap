import { t } from "@lingui/core/macro";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import MuscleVolumeSegment from "../../components/MuscleVolumeSegment";
import WorkoutSegment from "@/components/progress/WorkoutSegment";
import BodySegment from "@/components/progress/BodySegment";
import NutritionSegment from "@/components/progress/NutritionSegment";
import MonthlyReportSegment from "@/components/progress/MonthlyReportSegment";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { MuscleGroup } from "../../lib/types";
import { PROGRESS_TAB_SPACING } from "@/constants/design-tokens";

export default function Progress() {
  const colors = useThemeColors();
  const router = useRouter();
  const { segment: paramSegment, muscle: paramMuscle } = useLocalSearchParams<{ segment?: string; muscle?: string }>();
  const [localSegment, setLocalSegment] = useState("workouts");

  const segment = paramSegment || localSegment;

  return (
    <View testID="progress-screen-container" style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabsContainer}>
        {/* ScrollableTabs handles its own edge padding via contentContainerStyle —
            do NOT wrap with horizontal padding or the trailing fade gets clipped. */}
        <ScrollableTabs
          value={segment}
          onValueChange={(val) => {
            setLocalSegment(val);
            router.setParams?.({ segment: undefined, muscle: undefined });
          }}
          buttons={[
            { value: "workouts", label: t({ id: "progress.tabs.workouts", message: "Workouts" }), accessibilityLabel: t({ id: "progress.tabs.workoutsA11y", message: "Workouts progress" }) },
            { value: "body", label: t({ id: "progress.tabs.body", message: "Body" }), accessibilityLabel: t({ id: "progress.tabs.bodyA11y", message: "Body metrics" }) },
            { value: "muscles", label: t({ id: "progress.tabs.muscles", message: "Muscles" }), accessibilityLabel: t({ id: "progress.tabs.musclesA11y", message: "Muscle volume analysis" }) },
            { value: "nutrition", label: t({ id: "progress.tabs.nutrition", message: "Nutrition" }), accessibilityLabel: t({ id: "progress.tabs.nutritionA11y", message: "Nutrition trends" }) },
            { value: "monthly", label: t({ id: "progress.tabs.monthly", message: "Monthly" }), accessibilityLabel: t({ id: "progress.tabs.monthlyA11y", message: "Monthly training report" }) },
          ]}
        />
      </View>
      {segment === "workouts"
        ? <WorkoutSegment />
        : segment === "body"
          ? <BodySegment />
          : segment === "muscles"
            ? <MuscleVolumeSegment initialMuscle={paramMuscle as MuscleGroup} />
            : segment === "nutrition"
              ? <NutritionSegment />
              : <MonthlyReportSegment />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabsContainer: {
    paddingTop: PROGRESS_TAB_SPACING,
    paddingBottom: PROGRESS_TAB_SPACING,
  },
});
