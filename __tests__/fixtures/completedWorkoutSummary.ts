import { createExercise, createSession, createSet } from '../helpers/factories'
import type { Exercise, WorkoutSession, WorkoutSet } from '../../lib/types'

export type CompletedWorkoutFixture = {
  session: WorkoutSession
  exercises: Record<string, Exercise>
  sets: (WorkoutSet & { exercise_name?: string })[]
}

/**
 * Creates a realistic completed-workout summary fixture suitable for
 * rendering the Summary screen (app/session/summary/[id].tsx).
 *
 * Default: a completed bench-press session (chest primary,
 * shoulders + triceps secondary) with two working sets.
 */
export function createCompletedWorkoutFixture(
  overrides: Partial<{
    sessionId: string
    exercise: Exercise
    setCount: number
    weight: number
    reps: number
    durationSeconds: number
  }> = {},
): CompletedWorkoutFixture {
  const sessionId = overrides.sessionId ?? 'sess-completed'
  const exercise =
    overrides.exercise ??
    createExercise({
      id: 'ex-bench',
      name: 'Bench Press',
      primary_muscles: ['chest'],
      secondary_muscles: ['shoulders', 'triceps'],
    })
  const setCount = overrides.setCount ?? 2
  const weight = overrides.weight ?? 100
  const reps = overrides.reps ?? 5
  const durationSeconds = overrides.durationSeconds ?? 1800
  const completedAt = Date.now()

  const session = createSession({
    id: sessionId,
    name: 'Chest Day',
    started_at: completedAt - durationSeconds * 1000,
    completed_at: completedAt,
    duration_seconds: durationSeconds,
  })

  const sets = Array.from({ length: setCount }, (_, i) => ({
    ...createSet({
      id: `${sessionId}-set-${i + 1}`,
      session_id: sessionId,
      exercise_id: exercise.id,
      set_number: i + 1,
      weight,
      reps,
      completed: true,
      completed_at: completedAt,
    }),
    exercise_name: exercise.name,
  }))

  return {
    session,
    exercises: { [exercise.id]: exercise },
    sets,
  }
}
