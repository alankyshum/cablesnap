import React, { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { getPhotoById } from "../../lib/db/photos";
import type { ProgressPhoto } from "../../lib/db/photos";
import { radii, scrim } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function CompareScreen() {
  const colors = useThemeColors();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ id1: string; id2: string }>();
  const [photo1, setPhoto1] = useState<ProgressPhoto | null>(null);
  const [photo2, setPhoto2] = useState<ProgressPhoto | null>(null);

  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (params.id1 && params.id2) {
      Promise.all([
        getPhotoById(params.id1),
        getPhotoById(params.id2),
      ]).then(([p1, p2]) => {
        if (mounted) {
          setPhoto1(p1);
          setPhoto2(p2);
        }
      }).catch(() => {
        if (mounted) {
          setError(true);
        }
      });
    }
    return () => { mounted = false; };
  }, [params.id1, params.id2]);

  const isLandscape = width > height;

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
        <View style={styles.center}>
          <Text variant="bodyLarge" style={{ color: colors.error }}>
            Could not load photos. They may have been deleted.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!photo1 || !photo2) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
        <View style={styles.center}>
          <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
            Loading photos...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderPhoto = (photo: ProgressPhoto) => (
    <View style={isLandscape ? styles.halfHorizontal : styles.halfVertical}>
      <Image
        source={{ uri: photo.file_path }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel={`${photo.pose_category ?? "Progress"} photo from ${photo.display_date}`}
      />
      <View style={styles.label}>
        {/* White text on dark overlay for WCAG AA contrast on photos */}
        <Text style={[styles.labelText, { color: colors.onPrimary }]}>{photo.display_date}</Text>
        {photo.pose_category && (
          <Text style={[styles.labelPose, { color: colors.onPrimary }]}>{photo.pose_category.replace("_", " ")}</Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: colors.background },
        isLandscape ? styles.row : styles.column,
      ]}
      edges={["bottom"]}
    >
      {renderPhoto(photo1)}
      <View style={[
        isLandscape ? styles.dividerVertical : styles.dividerHorizontal,
        { backgroundColor: colors.outlineVariant },
      ]} />
      {renderPhoto(photo2)}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
  },
  column: {
    flexDirection: "column",
  },
  halfHorizontal: {
    flex: 1,
    position: "relative",
  },
  halfVertical: {
    flex: 1,
    position: "relative",
  },
  image: {
    flex: 1,
    width: "100%",
  },
  label: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: scrim.dark,
    borderRadius: radii.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  labelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  labelPose: {
    fontSize: 12,
    textTransform: "capitalize",
  },
  dividerVertical: {
    width: 2,
  },
  dividerHorizontal: {
    height: 2,
  },
});
