import React, { useCallback, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import type { Exercise, Equipment } from "../lib/types";
import { findSubstitutions } from "../lib/exercise-substitutions";
import {
  composeSearchResults,
  isBlankQuery,
} from "../lib/exercise-substitution-search";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  SubstitutionSheetBody,
  type ListRow,
} from "./substitution/SubstitutionSheetBody";

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
  const [query, setQuery] = useState<string>("");

  const scored = useMemo(() => {
    if (!sourceExercise) return [];
    return findSubstitutions(sourceExercise, allExercises);
  }, [sourceExercise, allExercises]);

  const composed = useMemo(
    () =>
      composeSearchResults({
        query,
        scored,
        allExercises,
        sourceExercise,
        equipmentFilter,
      }),
    [query, scored, allExercises, sourceExercise, equipmentFilter]
  );

  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = composed.relevance.map((item) => ({
      kind: "item" as const,
      item,
    }));
    if (composed.other.length > 0) {
      out.push({ kind: "header", label: "Other exercises" });
      for (const item of composed.other) {
        out.push({ kind: "item", item });
      }
    }
    return out;
  }, [composed]);

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
        setQuery("");
      };

      if (Platform.OS === "web") {
        if (window.confirm(`Replace ${sourceExercise.name} with ${exercise.name}?`)) {
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
    setQuery("");
    onDismiss();
  }, [onDismiss]);

  const noMuscleData = Boolean(
    sourceExercise &&
      (!sourceExercise.primary_muscles ||
        sourceExercise.primary_muscles.length === 0)
  );

  const hasQuery = !isBlankQuery(query);
  const hasResults = rows.length > 0;
  const relevanceEmpty = composed.relevance.length === 0;

  let emptyMessage: string | null = null;
  if (hasQuery && !hasResults) {
    emptyMessage = `No exercises match "${query.trim()}"`;
  } else if (!hasQuery && noMuscleData) {
    emptyMessage = "No muscle data — search for any exercise above.";
  } else if (!hasQuery && !noMuscleData && scored.length === 0) {
    emptyMessage =
      "No alternatives found. Search above or add the exercise manually.";
  } else if (!hasQuery && !noMuscleData && relevanceEmpty && equipmentFilter) {
    emptyMessage = "No alternatives with this equipment. Try removing the filter.";
  }

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
        <SubstitutionSheetBody
          sourceExercise={sourceExercise}
          query={query}
          setQuery={setQuery}
          equipmentFilter={equipmentFilter}
          setEquipmentFilter={setEquipmentFilter}
          availableEquipment={availableEquipment}
          rows={rows}
          emptyMessage={emptyMessage}
          noMuscleData={noMuscleData}
          onSelect={handleSelect}
        />
      )}
    </BottomSheet>
  );
}
