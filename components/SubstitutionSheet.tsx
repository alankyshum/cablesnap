import React, { useCallback, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import type { Exercise, Equipment } from "../lib/types";
import { MUSCLE_LABELS } from "../lib/types";
import {
  findSubstitutions,
  type SubstitutionScore,
} from "../lib/exercise-substitutions";
import { useThemeColors } from "@/hooks/useThemeColors";
import { SubstitutionItem } from "./substitution/SubstitutionItem";
import { EquipmentFilter } from "./substitution/EquipmentFilter";

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  sourceExercise: Exercise | null;
  allExercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  onDismiss: () => void;
};

export default function SubstitutionSheet({
  sheetRef,
  sourceExercise,
  allExercises,
  onSelect,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["50%", "90%"], []);
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | null>(null);

  const scored = useMemo(() => {
    if (!sourceExercise) return [];
    return findSubstitutions(sourceExercise, allExercises);
  }, [sourceExercise, allExercises]);

  const filtered = useMemo(() => {
    if (!equipmentFilter) return scored;
    return scored.filter((s) => s.exercise.equipment === equipmentFilter);
  }, [scored, equipmentFilter]);

  const availableEquipment = useMemo(() => {
    const set = new Set<Equipment>();
    for (const s of scored) set.add(s.exercise.equipment);
    return [...set];
  }, [scored]);

  const handleSelect = useCallback(
    (exercise: Exercise) => {
      if (!sourceExercise) return;
      if (exercise.id === sourceExercise.id) {
        sheetRef.current?.close();
        return;
      }

      const doSwap = () => {
        onSelect(exercise);
        sheetRef.current?.close();
        setEquipmentFilter(null);
      };

      if (Platform.OS === "web") {
        if (
          window.confirm(
            `Replace ${sourceExercise.name} with ${exercise.name}?`
          )
        ) {
          doSwap();
        }
      } else {
        Alert.alert(
          `Replace ${sourceExercise.name} with ${exercise.name}?`,
          undefined,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Replace", onPress: doSwap },
          ]
        );
      }
    },
    [sourceExercise, onSelect, sheetRef]
  );

  const handleClose = useCallback(() => {
    setEquipmentFilter(null);
    onDismiss();
  }, [onDismiss]);

  const noMuscleData =
    sourceExercise &&
    (!sourceExercise.primary_muscles ||
      sourceExercise.primary_muscles.length === 0);

  const renderItem = useCallback(
    ({ item }: { item: SubstitutionScore }) => (
      <SubstitutionItem item={item} onPress={handleSelect} />
    ),
    [handleSelect]
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      onClose={handleClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
    >
      {sourceExercise && (
        <View style={styles.container}>
          <Text
            variant="subtitle"
            style={[styles.header, { color: colors.onSurface }]}
          >
            Alternatives for {sourceExercise.name}
          </Text>

          {sourceExercise.primary_muscles.length > 0 && (
            <View style={styles.muscleRow}>
              {sourceExercise.primary_muscles.map((m) => (
                <View
                  key={m}
                  style={[
                    styles.muscleChip,
                    { backgroundColor: colors.primaryContainer },
                  ]}
                >
                  <Text variant="caption"
                    style={[
                      styles.muscleText,
                      { color: colors.onPrimaryContainer },
                    ]}
                  >
                    {MUSCLE_LABELS[m]}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {noMuscleData ? (
            <View style={styles.emptyState}>
              <Text
                variant="body"
                style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
              >
                No muscle data — cannot suggest alternatives
              </Text>
            </View>
          ) : (
            <>
              <EquipmentFilter
                availableEquipment={availableEquipment}
                equipmentFilter={equipmentFilter}
                onFilterChange={setEquipmentFilter}
              />

              {scored.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
                  >
                    No alternatives found. Try adding the exercise manually.
                  </Text>
                </View>
              ) : filtered.length === 0 && equipmentFilter ? (
                <View style={styles.emptyState}>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
                  >
                    No alternatives with this equipment. Try removing the
                    filter.
                  </Text>
                </View>
              ) : (
                <BottomSheetFlatList
                  data={filtered}
                  keyExtractor={(item) => item.exercise.id}
                  renderItem={renderItem}
                  contentContainerStyle={styles.listContent}
                />
              )}
            </>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    fontWeight: "700",
    marginBottom: 8,
  },
  muscleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 8,
  },
  muscleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  muscleText: {
    lineHeight: 16,
  },
  listContent: {
    paddingBottom: 32,
  },
  emptyState: {
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
});
