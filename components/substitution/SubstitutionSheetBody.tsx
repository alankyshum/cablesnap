import React from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { MUSCLE_LABELS } from "../../lib/types";
import type { Exercise, Equipment } from "../../lib/types";
import type { SubstitutionScore } from "../../lib/exercise-substitutions";
import { SubstitutionItem } from "./SubstitutionItem";
import { EquipmentFilter } from "./EquipmentFilter";
import { SearchAllInput } from "./SearchAllInput";

export type ListRow =
  | { kind: "item"; item: SubstitutionScore }
  | { kind: "header"; label: string };

type Props = {
  sourceExercise: Exercise;
  query: string;
  setQuery: (q: string) => void;
  equipmentFilter: Equipment | null;
  setEquipmentFilter: (eq: Equipment | null) => void;
  availableEquipment: Equipment[];
  rows: ListRow[];
  emptyMessage: string | null;
  noMuscleData: boolean;
  onSelect: (exercise: Exercise) => void;
};

export function SubstitutionSheetBody(props: Props) {
  const {
    sourceExercise,
    query,
    setQuery,
    equipmentFilter,
    setEquipmentFilter,
    availableEquipment,
    rows,
    emptyMessage,
    noMuscleData,
    onSelect,
  } = props;
  const colors = useThemeColors();

  const renderItem = ({ item }: { item: ListRow }) => {
    if (item.kind === "header") {
      return (
        <Text
          variant="caption"
          style={[styles.sectionHeader, { color: colors.onSurfaceVariant }]}
        >
          {item.label}
        </Text>
      );
    }
    return <SubstitutionItem item={item.item} onPress={onSelect} />;
  };

  const keyExtractor = (row: ListRow, index: number) =>
    row.kind === "header" ? `header-${row.label}-${index}` : row.item.exercise.id;

  return (
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
              <Text
                variant="caption"
                style={[styles.muscleText, { color: colors.onPrimaryContainer }]}
              >
                {MUSCLE_LABELS[m]}
              </Text>
            </View>
          ))}
        </View>
      )}

      <SearchAllInput value={query} onChange={setQuery} />

      {!noMuscleData && (
        <EquipmentFilter
          availableEquipment={availableEquipment}
          equipmentFilter={equipmentFilter}
          onFilterChange={setEquipmentFilter}
        />
      )}

      {emptyMessage ? (
        <View style={styles.emptyState}>
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
          >
            {emptyMessage}
          </Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { fontWeight: "700", marginBottom: 8 },
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
  muscleText: { lineHeight: 16 },
  listContent: { paddingBottom: 32 },
  emptyState: { paddingVertical: 48, paddingHorizontal: 24 },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 6,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
