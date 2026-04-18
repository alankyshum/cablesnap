import React, { useCallback } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ProgressPhoto } from "../lib/db/photos";
import { radii, scrim } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  photos: ProgressPhoto[];
  onPhotoPress: (photo: ProgressPhoto) => void;
  onPhotoLongPress: (photo: ProgressPhoto) => void;
  onEndReached?: () => void;
  compareMode?: boolean;
  selectedIds?: string[];
  ListHeaderComponent?: React.ReactElement;
};

const TABLET_BREAKPOINT = 768;

export default function PhotoGrid({
  photos,
  onPhotoPress,
  onPhotoLongPress,
  onEndReached,
  compareMode,
  selectedIds = [],
  ListHeaderComponent,
}: Props) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const numColumns = width >= TABLET_BREAKPOINT ? 4 : 3;
  const spacing = 2;
  const itemSize = (width - spacing * (numColumns + 1)) / numColumns;

  const renderItem = useCallback(
    ({ item }: { item: ProgressPhoto }) => {
      const isSelected = selectedIds.includes(item.id);
      const selectionIndex = selectedIds.indexOf(item.id) + 1;
      const dateLabel = item.display_date.slice(5); // MM-DD

      return (
        <Pressable
          onPress={() => onPhotoPress(item)}
          onLongPress={() => onPhotoLongPress(item)}
          style={[
            styles.item,
            {
              width: itemSize,
              height: itemSize,
              margin: spacing / 2,
            },
            isSelected && { borderWidth: 3, borderColor: colors.primary },
          ]}
          accessibilityLabel={`${item.pose_category ?? "Progress"} pose photo, ${item.display_date}`}
          accessibilityRole="button"
          accessibilityHint="Tap to view full screen, long press for options"
        >
          <Image
            source={{ uri: item.thumbnail_path || item.file_path }}
            style={styles.image}
            resizeMode="cover"
          />
          {/* Date overlay — white text for WCAG AA contrast on photo backgrounds */}
          <View style={styles.dateOverlay}>
            <Text style={[styles.dateText, { color: colors.onPrimary }]}>{dateLabel}</Text>
          </View>
          {/* Pose icon */}
          {item.pose_category && (
            <View style={[styles.poseIcon, { backgroundColor: colors.primaryContainer }]}>
              <MaterialCommunityIcons
                name={getPoseIcon(item.pose_category) as React.ComponentProps<typeof MaterialCommunityIcons>["name"]}
                size={14}
                color={colors.onPrimaryContainer}
              />
            </View>
          )}
          {/* Compare mode badge */}
          {compareMode && isSelected && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.onPrimary }]}>
                {selectionIndex}
              </Text>
            </View>
          )}
          {compareMode && !isSelected && (
            <View style={[styles.checkbox, { borderColor: colors.onSurface, backgroundColor: colors.backdrop }]} />
          )}
        </Pressable>
      );
    },
    [itemSize, spacing, compareMode, selectedIds, onPhotoPress, onPhotoLongPress, colors]
  );

  return (
    <FlashList
      data={photos}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={ListHeaderComponent}
    />
  );
}

function getPoseIcon(pose: string): string {
  switch (pose) {
    case "front":
      return "human-handsup";
    case "back":
      return "human-handsdown";
    case "side_left":
      return "human-male-female";
    case "side_right":
      return "human-male-female";
    default:
      return "camera";
  }
}

const styles = StyleSheet.create({
  item: {
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  dateOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: scrim.dark,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "600",
  },
  poseIcon: {
    position: "absolute",
    top: 4,
    left: 4,
    borderRadius: radii.lg,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  checkbox: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 12,
    width: 24,
    height: 24,
    borderWidth: 2,
  },
});
