import React, { useCallback, useMemo, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import { Chip, Text } from "react-native-paper";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import type { Exercise, Equipment } from "../lib/types";
import { EQUIPMENT_LABELS, DIFFICULTY_LABELS, MUSCLE_LABELS } from "../lib/types";
import {
  findSubstitutions,
  type SubstitutionScore,
} from "../lib/exercise-substitutions";
import { radii } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  sourceExercise: Exercise | null;
  allExercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  onDismiss: () => void;
};

function matchColor(score: number): string {
  if (score >= 80) return "#2e7d32";
  if (score >= 60) return "#f57f17";
  return "#c62828";
}

function matchBgColor(score: number): string {
  if (score >= 80) return "#e8f5e9";
  if (score >= 60) return "#fff8e1";
  return "#ffebee";
}

function SubstitutionItem({
  item,
  onPress,
}: {
  item: SubstitutionScore;
  onPress: (exercise: Exercise) => void;
}) {
  const colors = useThemeColors();
  const ex = item.exercise;

  return (
    <Pressable
      style={[styles.item, { backgroundColor: colors.surface }]}
      onPress={() => onPress(ex)}
      accessibilityRole="button"
      accessibilityLabel={`${ex.name}, ${item.score}% match, ${EQUIPMENT_LABELS[ex.equipment]}, ${DIFFICULTY_LABELS[ex.difficulty]}`}
    >
      <View style={styles.itemHeader}>
        <Text
          variant="titleSmall"
          numberOfLines={1}
          style={[styles.itemName, { color: colors.onSurface }]}
        >
          {ex.name}
        </Text>
        <View
          style={[
            styles.matchBadge,
            { backgroundColor: matchBgColor(item.score) },
          ]}
        >
          <Text variant="labelSmall" style={[styles.matchText, { color: matchColor(item.score) }]}>
            {item.score}%
          </Text>
        </View>
      </View>
      <View style={styles.itemMeta}>
        <View
          style={[
            styles.equipBadge,
            { backgroundColor: colors.surfaceVariant },
          ]}
        >
          <Text variant="labelSmall"
            style={[styles.equipText, { color: colors.onSurfaceVariant }]}
          >
            {EQUIPMENT_LABELS[ex.equipment]}
          </Text>
        </View>
        <View
          style={[
            styles.equipBadge,
            { backgroundColor: colors.surfaceVariant },
          ]}
        >
          <Text variant="labelSmall"
            style={[styles.equipText, { color: colors.onSurfaceVariant }]}
          >
            {DIFFICULTY_LABELS[ex.difficulty]}
          </Text>
        </View>
      </View>
      {ex.primary_muscles.length > 0 && (
        <View style={styles.muscleRow}>
          {ex.primary_muscles.map((m) => (
            <View
              key={m}
              style={[
                styles.muscleChip,
                { backgroundColor: colors.secondaryContainer },
              ]}
            >
              <Text variant="labelSmall"
                style={[
                  styles.muscleText,
                  { color: colors.onSecondaryContainer },
                ]}
              >
                {MUSCLE_LABELS[m]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

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
            variant="titleMedium"
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
                  <Text variant="labelSmall"
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
                variant="bodyMedium"
                style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
              >
                No muscle data — cannot suggest alternatives
              </Text>
            </View>
          ) : (
            <>
              {availableEquipment.length > 1 && (
                <View style={styles.filterRow} accessibilityRole="toolbar" accessibilityLabel="Equipment filter">
                  <Chip
                    selected={equipmentFilter === null}
                    onPress={() => setEquipmentFilter(null)}
                    compact
                    style={styles.filterChip}
                    accessibilityLabel="Show all equipment"
                  >
                    All
                  </Chip>
                  {availableEquipment.map((eq) => (
                    <Chip
                      key={eq}
                      selected={equipmentFilter === eq}
                      onPress={() =>
                        setEquipmentFilter(equipmentFilter === eq ? null : eq)
                      }
                      compact
                      style={styles.filterChip}
                      accessibilityLabel={`Filter by ${EQUIPMENT_LABELS[eq]}`}
                    >
                      {EQUIPMENT_LABELS[eq]}
                    </Chip>
                  ))}
                </View>
              )}

              {scored.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text
                    variant="bodyMedium"
                    style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
                  >
                    No alternatives found. Try adding the exercise manually.
                  </Text>
                </View>
              ) : filtered.length === 0 && equipmentFilter ? (
                <View style={styles.emptyState}>
                  <Text
                    variant="bodyMedium"
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  filterChip: {
    marginBottom: 2,
  },
  listContent: {
    paddingBottom: 32,
  },
  item: {
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemName: {
    flex: 1,
    fontWeight: "600",
    marginRight: 8,
  },
  matchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  matchText: {
    fontWeight: "700",
  },
  itemMeta: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  equipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  equipText: {
  },
  emptyState: {
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
});
