import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { PoseCategory } from "../../lib/db/photos";

interface PhotoFilterHeaderProps {
  poseFilter: PoseCategory | undefined;
  compareMode: boolean;
  selectedIds: string[];
  total: number;
  onPoseChange: (pose: PoseCategory | undefined) => void;
  onToggleCompare: () => void;
  onCancelCompare: () => void;
  poseOptions: { label: string; value: PoseCategory }[];
}

export default function PhotoFilterHeader({
  poseFilter,
  compareMode,
  selectedIds,
  total,
  onPoseChange,
  onToggleCompare,
  onCancelCompare,
  poseOptions,
}: PhotoFilterHeaderProps) {
  const colors = useThemeColors();

  return (
    <>
      <View style={styles.filterRow}>
        <View style={styles.chips}>
          <Chip
            selected={!poseFilter}
            onPress={() => onPoseChange(undefined)}
            style={styles.chip}
            accessibilityLabel="All poses filter"
            accessibilityRole="checkbox"
          >
            All
          </Chip>
          {poseOptions.map((p) => (
            <Chip
              key={p.value}
              selected={poseFilter === p.value}
              onPress={() => onPoseChange(poseFilter === p.value ? undefined : p.value)}
              style={styles.chip}
              accessibilityLabel={`${p.label} pose filter`}
              accessibilityRole="checkbox"
            >
              {p.label}
            </Chip>
          ))}
        </View>
        <TouchableOpacity
          onPress={onToggleCompare}
          disabled={total < 2 && !compareMode}
          accessibilityLabel="Compare photos"
          accessibilityRole="button"
          accessibilityHint={total < 2 ? "Need at least 2 photos to compare" : "Select two photos to compare side by side"}
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="compare" size={24} color={colors.onSurface} />
        </TouchableOpacity>
      </View>
      {compareMode && (
        <View style={[styles.compareBanner, { backgroundColor: colors.primaryContainer }]}>
          <Text variant="body" style={{ color: colors.onPrimaryContainer, flex: 1 }}>
            Select 2 photos ({selectedIds.length}/2)
          </Text>
          <Button
            variant="ghost"
            onPress={onCancelCompare}
            label="Cancel"
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
    gap: 4,
  },
  chip: {
    marginBottom: 4,
  },
  compareBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
});
