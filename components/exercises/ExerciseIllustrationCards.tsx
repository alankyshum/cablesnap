// BLD-561: Inline start/end position illustrations for exercise detail views.
//
// Renders above the numbered text steps in both ExerciseDetailDrawer and
// ExerciseDetailPane. Uses viewport-agnostic intrinsic flex-wrap flow:
// two cards flow side-by-side when there's room and wrap to stacked when narrow.
//
// Tap any image opens ExerciseImageZoomModal with full-screen pinch-zoom.
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Exercise } from "@/lib/types";
import { resolveExerciseImages, type ResolvedExerciseImages } from "../../assets/exercise-illustrations/resolve";
import { ExerciseImageZoomModal } from "./ExerciseImageZoomModal";

interface Props {
  exercise: Pick<Exercise, "id" | "name" | "is_custom" | "start_image_uri" | "end_image_uri">;
}

export function ExerciseIllustrationCards({ exercise }: Props) {
  const colors = useThemeColors();
  const [zoom, setZoom] = useState<"start" | "end" | null>(null);

  const resolved = useMemo<ResolvedExerciseImages | null>(
    () => resolveExerciseImages(exercise),
    [exercise]
  );

  // Hint for custom exercises without images. For seeded exercises with a
  // missing manifest entry we render nothing (no placeholder, no error) per
  // the R2 renderer decisions.
  if (!resolved) {
    if (exercise.is_custom) {
      return (
        <View style={styles.hintWrap}>
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant, fontSize: 12 }}
            accessibilityLabel="Add your own illustration — coming soon"
          >
            Add your own illustration — coming soon
          </Text>
        </View>
      );
    }
    return null;
  }

  const cardStyle = [styles.card, { backgroundColor: colors.surfaceAlt }];

  return (
    <>
      <View
        style={styles.row}
        testID="exercise-illustration-row"
      >
        <Pressable
          onPress={() => setZoom("start")}
          accessibilityRole="button"
          accessibilityLabel={resolved.startAlt}
          accessibilityHint="Tap to view full-screen"
          style={cardStyle}
          testID="exercise-illustration-start"
        >
          <Image
            source={resolved.start}
            style={styles.image}
            contentFit="contain"
            transition={0}
            accessible={false}
          />
          <Text style={[styles.caption, { color: colors.onSurfaceVariant }]}>Start position</Text>
        </Pressable>
        <Pressable
          onPress={() => setZoom("end")}
          accessibilityRole="button"
          accessibilityLabel={resolved.endAlt}
          accessibilityHint="Tap to view full-screen"
          style={cardStyle}
          testID="exercise-illustration-end"
        >
          <Image
            source={resolved.end}
            style={styles.image}
            contentFit="contain"
            transition={0}
            accessible={false}
          />
          <Text style={[styles.caption, { color: colors.onSurfaceVariant }]}>End position</Text>
        </Pressable>
      </View>
      {resolved.safetyNote ? (
        <View
          style={styles.safetyRow}
          accessibilityRole="text"
          accessibilityLabel={resolved.safetyNote}
          testID="exercise-safety-note"
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={colors.onSurfaceVariant}
            style={styles.safetyIcon}
          />
          <Text
            variant="body"
            style={[styles.safetyText, { color: colors.onSurfaceVariant }]}
          >
            {resolved.safetyNote}
          </Text>
        </View>
      ) : null}
      <ExerciseImageZoomModal
        visible={zoom !== null}
        source={zoom === "start" ? resolved.start : zoom === "end" ? resolved.end : null}
        accessibilityLabel={zoom === "start" ? resolved.startAlt : resolved.endAlt}
        safetyNote={resolved.safetyNote}
        onClose={() => setZoom(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 8,
    marginBottom: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    maxWidth: "100%",
    padding: 8,
    borderRadius: 12,
    alignItems: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: "100%",
    maxHeight: 240,
  },
  caption: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "500",
  },
  hintWrap: {
    marginTop: 12,
    marginBottom: 8,
  },
  safetyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  safetyIcon: {
    marginRight: 6,
    marginTop: 1,
  },
  safetyText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
});
