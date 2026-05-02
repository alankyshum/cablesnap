import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import { MUSCLE_GROUPS_BY_REGION, MUSCLE_LABELS, type MuscleGroup } from "@/lib/types";

type MuscleGroupFilterSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  /** Muscle groups present in the user's completed sessions. */
  availableMuscleGroups: string[];
  selectedMuscleGroup: string | null;
  onSelect: (muscleGroup: string | null) => void;
};

/**
 * Bottom-sheet for the Muscle Group filter (BLD-938). Single-select,
 * grouped by body region.
 *
 * Only muscle groups present in the user's exercise pool (returned by
 * `getMuscleGroupsWithSessions`) are shown — users never see filters
 * that would always return zero results.
 */
export function MuscleGroupFilterSheet({
  isVisible,
  onClose,
  availableMuscleGroups,
  selectedMuscleGroup,
  onSelect,
}: MuscleGroupFilterSheetProps) {
  const colors = useThemeColors();

  const availableSet = useMemo(
    () => new Set(availableMuscleGroups),
    [availableMuscleGroups]
  );

  const regions = useMemo(() => {
    return MUSCLE_GROUPS_BY_REGION.map((region) => ({
      ...region,
      muscles: region.muscles.filter((m) => availableSet.has(m)),
    })).filter((r) => r.muscles.length > 0);
  }, [availableSet]);

  const handleSelect = (muscle: string) => {
    onSelect(muscle);
    onClose();
  };

  const handleClear = () => {
    onSelect(null);
    onClose();
  };

  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title="Filter by muscle group"
      snapPoints={[0.6, 0.9]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={handleClear}
          style={styles.clearButton}
          accessibilityLabel="Clear muscle group filter"
          accessibilityRole="button"
        >
          <Text variant="body" style={{ color: colors.primary }}>
            Clear
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list}>
        {regions.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
              No muscle groups in your history yet
            </Text>
          </View>
        ) : (
          regions.map((region) => (
            <View key={region.label} style={styles.regionBlock}>
              <Text
                variant="caption"
                style={[styles.regionLabel, { color: colors.onSurfaceVariant }]}
              >
                {region.label}
              </Text>
              {region.muscles.map((m: MuscleGroup) => {
                const isSelected = m === selectedMuscleGroup;
                return (
                  <Pressable
                    key={m}
                    onPress={() => handleSelect(m)}
                    style={[
                      styles.row,
                      isSelected && { backgroundColor: colors.primaryContainer },
                    ]}
                    accessibilityLabel={`${MUSCLE_LABELS[m]}${
                      isSelected ? ", selected" : ""
                    }`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text variant="body" style={{ color: colors.onSurface }}>
                      {MUSCLE_LABELS[m]}
                    </Text>
                    {isSelected ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  list: {
    maxHeight: 520,
  },
  regionBlock: {
    marginBottom: 12,
  },
  regionLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  empty: {
    paddingVertical: 32,
    alignItems: "center",
  },
});
