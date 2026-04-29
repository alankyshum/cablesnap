import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  EQUIPMENT_LIST,
  EQUIPMENT_LABELS,
  MUSCLE_GROUPS_BY_REGION,
  MUSCLE_LABELS,
  type Equipment,
  type MuscleGroup,
} from "../lib/types";
import { EQUIPMENT_ICONS } from "../constants/theme";

type ExerciseFilterSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  selectedEquipment: Set<Equipment>;
  selectedMuscles: Set<MuscleGroup>;
  onApply: (equipment: Set<Equipment>, muscles: Set<MuscleGroup>) => void;
};

/**
 * Wrapper that only mounts the inner form when visible,
 * ensuring draft state is freshly initialized from props each time.
 */
export function ExerciseFilterSheet({
  isVisible,
  onClose,
  selectedEquipment,
  selectedMuscles,
  onApply,
}: ExerciseFilterSheetProps) {
  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title="Filters"
      snapPoints={[0.6, 0.85]}
    >
      {isVisible && (
        <ExerciseFilterSheetContent
          initialEquipment={selectedEquipment}
          initialMuscles={selectedMuscles}
          onApply={onApply}
          onClose={onClose}
        />
      )}
    </BottomSheet>
  );
}

type ContentProps = {
  initialEquipment: Set<Equipment>;
  initialMuscles: Set<MuscleGroup>;
  onApply: (equipment: Set<Equipment>, muscles: Set<MuscleGroup>) => void;
  onClose: () => void;
};

function ExerciseFilterSheetContent({
  initialEquipment,
  initialMuscles,
  onApply,
  onClose,
}: ContentProps) {
  const colors = useThemeColors();

  const [draftEquipment, setDraftEquipment] = useState<Set<Equipment>>(
    () => new Set(initialEquipment)
  );
  const [draftMuscles, setDraftMuscles] = useState<Set<MuscleGroup>>(
    () => new Set(initialMuscles)
  );

  const toggleEquipment = useCallback((eq: Equipment) => {
    setDraftEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(eq)) next.delete(eq);
      else next.add(eq);
      return next;
    });
  }, []);

  const toggleMuscle = useCallback((m: MuscleGroup) => {
    setDraftMuscles((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDraftEquipment(new Set());
    setDraftMuscles(new Set());
  }, []);

  const handleApply = useCallback(() => {
    onApply(draftEquipment, draftMuscles);
    onClose();
  }, [draftEquipment, draftMuscles, onApply, onClose]);

  const totalSelected = draftEquipment.size + draftMuscles.size;

  return (
    <>
      {/* Equipment Section */}
      <View
        style={styles.section}
        accessibilityRole="toolbar"
        accessibilityLabel="Equipment filters"
      >
        <Text
          variant="subtitle"
          style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}
        >
          Equipment
        </Text>
        <View style={styles.chipGrid}>
          {EQUIPMENT_LIST.map((eq) => {
            const active = draftEquipment.has(eq);
            return (
              <Chip
                key={eq}
                selected={active}
                onPress={() => toggleEquipment(eq)}
                style={StyleSheet.flatten([
                  styles.chip,
                  active && { backgroundColor: colors.primaryContainer },
                ])}
                compact
                icon={
                  EQUIPMENT_ICONS[eq] ? (
                    <MaterialCommunityIcons
                      name={
                        EQUIPMENT_ICONS[eq] as keyof typeof MaterialCommunityIcons.glyphMap
                      }
                      size={16}
                      color={
                        active
                          ? colors.onPrimaryContainer
                          : colors.onSurface
                      }
                    />
                  ) : undefined
                }
                accessibilityLabel={`Filter by equipment: ${EQUIPMENT_LABELS[eq]}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {EQUIPMENT_LABELS[eq]}
              </Chip>
            );
          })}
        </View>
      </View>

      {/* Muscle Group Sections */}
      <View
        style={styles.section}
        accessibilityRole="toolbar"
        accessibilityLabel="Muscle group filters"
      >
        <Text
          variant="subtitle"
          style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}
        >
          Muscle Groups
        </Text>
        {MUSCLE_GROUPS_BY_REGION.map((region) => (
          <View key={region.label} style={styles.regionBlock}>
            <Text
              variant="caption"
              style={[styles.regionLabel, { color: colors.onSurfaceVariant }]}
            >
              {region.label}
            </Text>
            <View style={styles.chipGrid}>
              {region.muscles.map((m) => {
                const active = draftMuscles.has(m);
                return (
                  <Chip
                    key={m}
                    selected={active}
                    onPress={() => toggleMuscle(m)}
                    style={StyleSheet.flatten([
                      styles.chip,
                      active && { backgroundColor: colors.primaryContainer },
                    ])}
                    compact
                    accessibilityLabel={`Filter by muscle: ${MUSCLE_LABELS[m]}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    {MUSCLE_LABELS[m]}
                  </Chip>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={clearAll}
          style={styles.clearButton}
          accessibilityLabel="Clear all filters"
          accessibilityRole="button"
        >
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant }}
          >
            Clear All
          </Text>
        </Pressable>
        <Pressable
          onPress={handleApply}
          style={[
            styles.applyButton,
            { backgroundColor: colors.primary },
          ]}
          accessibilityLabel={`Apply ${totalSelected} filters`}
          accessibilityRole="button"
        >
          <Text
            variant="body"
            style={{ color: colors.onPrimary, fontWeight: "600" }}
          >
            {totalSelected > 0 ? `Apply (${totalSelected})` : "Apply"}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

// --- Exported FilterButton for use in exercises.tsx ---

type FilterButtonProps = {
  activeCount: number;
  onPress: () => void;
  backgroundColor: string;
  activeColor: string;
  inactiveColor: string;
  badgeTextColor: string;
};

export function FilterButton({
  activeCount,
  onPress,
  backgroundColor,
  activeColor,
  inactiveColor,
  badgeTextColor,
}: FilterButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterButton, { backgroundColor }]}
      accessibilityLabel={`Open filters${activeCount > 0 ? `, ${activeCount} active` : ""}`}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons
        name="filter-variant"
        size={22}
        color={activeCount > 0 ? activeColor : inactiveColor}
      />
      {activeCount > 0 && (
        <View style={[styles.badge, { backgroundColor: activeColor }]}>
          <Text
            variant="caption"
            style={{ color: badgeTextColor, fontSize: 11, fontWeight: "700" }}
          >
            {activeCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    position: "relative" as const,
  },
  badge: {
    position: "absolute" as const,
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 8,
    fontWeight: "600",
  },
  regionBlock: {
    marginBottom: 12,
  },
  regionLabel: {
    marginBottom: 4,
    fontSize: 12,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    marginBottom: 2,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.3)",
  },
  clearButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  applyButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
});
