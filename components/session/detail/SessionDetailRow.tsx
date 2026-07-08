import React from "react";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { ExerciseGroup } from "@/hooks/useSessionDetail";
import { EditableExerciseGroupRow, type DraftSet } from "./EditableExerciseGroupRow";
import { ExerciseGroupRow } from "./ExerciseGroupRow";

interface SessionDetailRowProps {
  group: ExerciseGroup | { name: string; sets: DraftSet[]; groupKey: string };
  index: number;
  editing: boolean;
  updateSet: (groupIndex: number, setIdx: number, fields: Partial<DraftSet>) => void;
  removeSet: (groupIndex: number, setIdx: number) => void;
  addSet: (groupIndex: number) => void;
  removeExercise: (groupIndex: number) => void;
  groups: ExerciseGroup[];
  linkIds: string[];
  palette: string[];
  colors: ThemeColors;
}

export function SessionDetailRow({
  group,
  index,
  editing,
  updateSet,
  removeSet,
  addSet,
  removeExercise,
  groups,
  linkIds,
  palette,
  colors,
}: SessionDetailRowProps) {
  if (editing) {
    const dg = group as { name: string; sets: DraftSet[]; groupKey: string };
    return (
      <EditableExerciseGroupRow
        exerciseName={dg.name}
        sets={dg.sets}
        onChangeWeight={(setIdx, v) => updateSet(index, setIdx, { weight: v })}
        onChangeReps={(setIdx, v) => updateSet(index, setIdx, { reps: v })}
        onChangeRpe={(setIdx, v) => updateSet(index, setIdx, { rpe: v })}
        onToggleCompleted={(setIdx, v) => updateSet(index, setIdx, { completed: v })}
        onRemoveSet={(setIdx) => removeSet(index, setIdx)}
        onAddSet={() => addSet(index)}
        onRemoveExercise={() => removeExercise(index)}
      />
    );
  }
  return (
    <ExerciseGroupRow
      group={group as ExerciseGroup}
      groups={groups}
      linkIds={linkIds}
      palette={palette}
      colors={colors}
    />
  );
}
