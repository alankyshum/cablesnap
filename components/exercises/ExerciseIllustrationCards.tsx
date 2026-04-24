// BLD-561: Inline start/end position illustrations for exercise detail views.
//
// Renders above the numbered text steps in both ExerciseDetailDrawer and
// ExerciseDetailPane. Uses onLayout container width (≥480px → side-by-side,
// <480px → stacked) so tablet bottom-sheets render correctly too.
//
// Tap any image opens ExerciseImageZoomModal with full-screen pinch-zoom.
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Exercise } from "@/lib/types";
import { resolveExerciseImages, type ResolvedExerciseImages } from "../../assets/exercise-illustrations/resolve";
import { ExerciseImageZoomModal } from "./ExerciseImageZoomModal";

const SIDE_BY_SIDE_MIN_WIDTH = 480;

interface Props {
  exercise: Pick<Exercise, "id" | "name" | "is_custom" | "start_image_uri" | "end_image_uri">;
  /** Initial width hint (optional). We rely primarily on onLayout. */
  initialWidth?: number;
}

export function ExerciseIllustrationCards({ exercise, initialWidth }: Props) {
  const colors = useThemeColors();
  const [containerWidth, setContainerWidth] = useState<number>(initialWidth ?? 0);
  const [zoom, setZoom] = useState<"start" | "end" | null>(null);

  const resolved = useMemo<ResolvedExerciseImages | null>(
    () => resolveExerciseImages(exercise),
    [exercise]
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - containerWidth) > 1) setContainerWidth(w);
  }, [containerWidth]);

  // Hint for custom exercises without images. For seeded exercises with a
  // missing manifest entry we render nothing (no placeholder, no error) per
  // the R2 renderer decisions.
  if (!resolved) {
    if (exercise.is_custom) {
      return (
        <View onLayout={onLayout} style={styles.hintWrap}>
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
    return <View onLayout={onLayout} />;
  }

  const sideBySide = containerWidth >= SIDE_BY_SIDE_MIN_WIDTH;

  const cardStyle = [styles.card, { backgroundColor: colors.surfaceAlt }];

  return (
    <>
      <View
        onLayout={onLayout}
        style={[styles.row, sideBySide ? styles.rowHorizontal : styles.rowVertical]}
        testID="exercise-illustration-row"
      >
        <Pressable
          onPress={() => setZoom("start")}
          accessibilityRole="image"
          accessibilityLabel={resolved.startAlt}
          accessibilityHint="Tap to view full-screen"
          style={[cardStyle, sideBySide ? styles.halfWidth : styles.fullWidth]}
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
          accessibilityRole="image"
          accessibilityLabel={resolved.endAlt}
          accessibilityHint="Tap to view full-screen"
          style={[cardStyle, sideBySide ? styles.halfWidth : styles.fullWidth]}
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
      <ExerciseImageZoomModal
        visible={zoom !== null}
        source={zoom === "start" ? resolved.start : zoom === "end" ? resolved.end : null}
        accessibilityLabel={zoom === "start" ? resolved.startAlt : resolved.endAlt}
        onClose={() => setZoom(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 8,
    marginBottom: 16,
    gap: 8,
  },
  rowHorizontal: {
    flexDirection: "row",
  },
  rowVertical: {
    flexDirection: "column",
  },
  card: {
    padding: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  halfWidth: { flex: 1 },
  fullWidth: { width: "100%" },
  image: {
    width: "100%",
    aspectRatio: 1,
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
});
