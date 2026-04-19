import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { MuscleMap } from "../../components/MuscleMap";
import { useProfileGender } from "../../lib/useProfileGender";
import { useLayout } from "../../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { CATEGORY_LABELS, ATTACHMENT_LABELS } from "../../lib/types";
import { difficultyText, DIFFICULTY_COLORS } from "../../constants/theme";
import { ExerciseDrawerStats } from "./ExerciseDrawerStats";
import type { Exercise } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  exercise: Exercise;
  unit?: "kg" | "lb";
};

export function ExerciseDetailDrawerContent({ exercise, unit }: Props) {
  const colors = useThemeColors();
  const layout = useLayout();
  const profileGender = useProfileGender();
  const { width: screenWidth } = useWindowDimensions();

  const steps = exercise.instructions
    ?.split("\n")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

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
      {exercise.mount_position && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>
            Mount Position
          </Text>
          <Text variant="body" style={{ color: colors.onSurface, marginTop: 2 }}>
            {exercise.mount_position}
          </Text>
        </View>
      )}
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

  const instructions = steps.length > 0 ? (
    <View style={styles.detailSection}>
      <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>
        Instructions
      </Text>
      {steps.map((step, i) => (
        <Text key={i} variant="body" style={{ color: colors.onSurface, marginTop: 6, lineHeight: 22 }}>
          {step}
        </Text>
      ))}
    </View>
  ) : null;

  const mapWidth = layout.atLeastMedium
    ? Math.min(screenWidth - 64, 600)
    : screenWidth - 48;

  return (
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
                </View>
              </View>
              <MuscleMap
                primary={exercise.primary_muscles}
                secondary={exercise.secondary_muscles}
                width={mapWidth}
                gender={profileGender}
              />
            </>
          ) : (
            <>
              {musclesAndMeta}
              {instructions}
            </>
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
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
});
