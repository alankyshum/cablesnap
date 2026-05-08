import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { MuscleMap } from "../../components/MuscleMap";
import { useProfileGender } from "../../lib/useProfileGender";
import { useLayout } from "../../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { CATEGORY_LABELS, ATTACHMENT_LABELS } from "../../lib/types";
import { difficultyText, DIFFICULTY_COLORS } from "../../constants/theme";
import { ExerciseDrawerStats } from "./ExerciseDrawerStats";
import { ExerciseTutorialLink } from "../exercises/ExerciseTutorialLink";
import { ExerciseInstructionsList } from "../exercises/ExerciseInstructionsList";
import { ExerciseIllustrationCards } from "../exercises/ExerciseIllustrationCards";
import { FormLibraryTab } from "./FormLibraryTab";
import type { Exercise } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  exercise: Exercise;
  unit?: "kg" | "lb";
};

type Tab = "details" | "clips";

export function ExerciseDetailDrawerContent({ exercise, unit }: Props) {
  const colors = useThemeColors();
  const layout = useLayout();
  const profileGender = useProfileGender();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>("details");

  // Hide Form Clips tab on web (AC16).
  const showClipsTab = Platform.OS !== "web";

  const musclesAndMeta = (
    <>
      <View style={styles.detailChips}>
        <View style={[styles.detailBadge, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[styles.detailBadgeText, { color: colors.onPrimaryContainer }]}>
            {CATEGORY_LABELS[exercise.category]}
          </Text>
        </View>
        <View style={[styles.detailBadge, { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] }]}>
          <Text style={[styles.detailBadgeText, { color: difficultyText(exercise.difficulty), fontWeight: "600" }]}>
            {exercise.difficulty}
          </Text>
        </View>
        <View style={[styles.detailBadge, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[styles.detailBadgeText, { color: colors.onSurfaceVariant }]}>
            {exercise.equipment}
          </Text>
        </View>
      </View>
      {exercise.attachment && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>
            Attachment
          </Text>
          <Text variant="body" style={{ color: colors.onSurface, marginTop: 2 }}>
            {ATTACHMENT_LABELS[exercise.attachment]}
          </Text>
        </View>
      )}
      {exercise.primary_muscles.length > 0 && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>
            Primary Muscles
          </Text>
          <View style={styles.detailChips}>
            {exercise.primary_muscles.map((m) => (
              <View key={m} style={[styles.detailBadge, { backgroundColor: colors.secondaryContainer }]}>
                <Text style={[styles.detailBadgeText, { color: colors.onSecondaryContainer }]}>{m}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {exercise.secondary_muscles.length > 0 && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>
            Secondary Muscles
          </Text>
          <View style={styles.detailChips}>
            {exercise.secondary_muscles.map((m) => (
              <View key={m} style={[styles.detailBadge, { backgroundColor: colors.tertiaryContainer }]}>
                <Text style={[styles.detailBadgeText, { color: colors.onTertiaryContainer }]}>{m}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );

  const instructions = (
    <View style={styles.detailSection}>
      {/* BLD-561: start/end illustrations above the numbered text steps. The
          cards component itself uses onLayout to flip side-by-side ≥480px and
          stacks vertically below; renders empty-state hint for custom
          exercises without images and renders null for seeded exercises with
          no manifest entry (both-or-neither rule). */}
      <ExerciseIllustrationCards exercise={exercise} />
      <ExerciseInstructionsList
        instructions={exercise.instructions}
        colors={colors}
        showHeading
        testIDPrefix="exercise-detail-drawer-instructions"
      />
    </View>
  );

  const mapWidth = layout.atLeastMedium
    ? Math.min(screenWidth - 64, 600)
    : screenWidth - 48;

  const muscleMap = (
    <MuscleMap
      primary={exercise.primary_muscles}
      secondary={exercise.secondary_muscles}
      width={mapWidth}
      gender={profileGender}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Tab bar */}
      {showClipsTab && (
        <View style={[styles.tabBar, { borderBottomColor: colors.outline }]}>
          <Pressable
            style={[styles.tab, activeTab === "details" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab("details")}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "details" }}
          >
            <Text style={[styles.tabLabel, { color: activeTab === "details" ? colors.primary : colors.onSurfaceVariant }]}>
              Details
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "clips" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab("clips")}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "clips" }}
          >
            <Text style={[styles.tabLabel, { color: activeTab === "clips" ? colors.primary : colors.onSurfaceVariant }]}>
              Form clips
            </Text>
          </Pressable>
        </View>
      )}
      {/* Tab contents */}
      {activeTab === "clips" && showClipsTab ? (
        <FormLibraryTab exerciseId={exercise.id} unit={unit} />
      ) : (
        <BottomSheetFlatList
          data={[]}
          renderItem={null}
          style={styles.detailBody}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListHeaderComponent={
            <>
              {unit && (
                <ExerciseDrawerStats exerciseId={exercise.id} unit={unit} />
              )}
              {layout.atLeastMedium ? (
                <>
                  <View style={styles.detailRow}>
                    <View style={styles.detailColLeft}>
                      {musclesAndMeta}
                    </View>
                    <View style={styles.detailColRight}>
                      {instructions}
                      <ExerciseTutorialLink
                        exerciseName={exercise.name}
                        testID="exercise-tutorial-link-drawer-wide"
                      />
                    </View>
                  </View>
                  {muscleMap}
                </>
              ) : (
                <>
                  {musclesAndMeta}
                  <View style={styles.detailMuscleMapNarrow}>
                    {muscleMap}
                  </View>
                  {instructions}
                  <ExerciseTutorialLink
                    exerciseName={exercise.name}
                    testID="exercise-tutorial-link-drawer"
                  />
                </>
              )}
            </>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  detailBody: {
    paddingHorizontal: 16,
  },
  detailChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  detailBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  detailBadgeText: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
  },
  detailRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 16,
  },
  detailColLeft: {
    flex: 1,
  },
  detailColRight: {
    flex: 1,
  },
  detailSection: {
    marginBottom: 16,
  },
  detailMuscleMapNarrow: {
    alignItems: "center",
    marginVertical: 8,
  },
});
