import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import MuscleVolumeSegment from "../../components/MuscleVolumeSegment";
import WorkoutSegment from "@/components/progress/WorkoutSegment";
import BodySegment from "@/components/progress/BodySegment";
import NutritionSegment from "@/components/progress/NutritionSegment";
import MonthlyReportSegment from "@/components/progress/MonthlyReportSegment";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function Progress() {
  const colors = useThemeColors();
  const [segment, setSegment] = useState("workouts");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabsContainer}>
        {/* ScrollableTabs handles its own edge padding via contentContainerStyle —
            do NOT wrap with horizontal padding or the trailing fade gets clipped. */}
        <ScrollableTabs
          value={segment}
          onValueChange={setSegment}
          buttons={[
            { value: "workouts", label: "Workouts", accessibilityLabel: "Workouts progress" },
            { value: "body", label: "Body", accessibilityLabel: "Body metrics" },
            { value: "muscles", label: "Muscles", accessibilityLabel: "Muscle volume analysis" },
            { value: "nutrition", label: "Nutrition", accessibilityLabel: "Nutrition trends" },
            { value: "monthly", label: "Monthly", accessibilityLabel: "Monthly training report" },
          ]}
        />
      </View>
      {segment === "workouts"
        ? <WorkoutSegment />
        : segment === "body"
          ? <BodySegment />
          : segment === "muscles"
            ? <MuscleVolumeSegment />
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
    paddingTop: 16,
    paddingBottom: 0,
  },
});
