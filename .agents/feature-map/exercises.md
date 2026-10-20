---
id: exercises
title: Exercise Library and Exercise Progress
aliases: ["exercise list", "movement library", "custom exercise", "exercise details", "exercise chart", "strength goal", "substitute exercise"]
routes: ["/exercise/[id]", "/exercise/create", "/exercise/edit/[id]", "/exercises"]
paths: ["app/(tabs)/exercises.tsx", "app/exercise/**", "components/exercise/**", "components/exercises/**", "components/ExerciseForm.tsx", "components/ExercisePickerSheet.tsx", "components/ExerciseFilterSheet.tsx", "components/SubstitutionSheet.tsx", "components/substitution/**", "hooks/useExerciseDetail.ts", "hooks/useExerciseForm.ts", "hooks/useExerciseManagement.ts", "hooks/useStrengthGoals.ts", "hooks/useStrengthLevel.ts", "lib/db/exercises.ts", "lib/db/exercise-history.ts", "lib/exercise-substitutions.ts", "lib/exercise-search-matcher.ts"]
---
# Exercise Library and Exercise Progress

Browse, search, create, and edit exercises; inspect an exercise's history, goals, records, instructions, and substitutions.

## Sub-features
- Filters, custom exercises, variants, tutorials, strength level, plateau/progression and goals.

## How to get to it (user POV)
- Tap **Exercises** in the tab bar, then an exercise card; use **+** for a custom exercise.
- Exercise pickers and substitution sheets also open from templates and active workouts.

## Code entry points
- `app/(tabs)/exercises.tsx` — library list.
- `app/exercise/[id].tsx` — detail/progress screen.
- `components/ExerciseForm.tsx` — create/edit fields.

## Gotchas
- Built-in and custom exercises have different edit/delete rules; variant-scoped records must stay consistent.
