/**
 * BLD-1158 AC1.3: Tempo inheritance in buildInitialSetsFromTemplate.
 *
 * Verifies that:
 *   - Rep-mode sets inherit exercise.default_tempo as exerciseDefaultTempo.
 *   - Duration-mode sets get exerciseDefaultTempo = null.
 *   - Sets with no exercise object get exerciseDefaultTempo = null.
 */

jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "test-uuid") }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn() }));
jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn() }));

import { buildInitialSetsFromTemplate } from "../../../lib/db/templates";
import type { WorkoutTemplate } from "../../../lib/types";
import { createTemplateExercise, createExercise } from "../../helpers/factories";

function makeTemplate(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return {
    id: "tpl-1",
    name: "Test Template",
    created_at: 0,
    updated_at: 0,
    exercises: [],
    ...overrides,
  };
}

describe("buildInitialSetsFromTemplate — BLD-1158 tempo inheritance (AC1.3)", () => {
  it("passes exerciseDefaultTempo from exercise.default_tempo for rep-mode sets", () => {
    const ex = createExercise({ default_tempo: "3-1-2-0" });
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          exercise_id: ex.id,
          target_sets: 2,
          target_duration_seconds: null,
          exercise: ex,
        }),
      ],
    });

    const seeds = buildInitialSetsFromTemplate(tpl, "session-1");
    expect(seeds).toHaveLength(2);
    for (const seed of seeds) {
      expect(seed.exerciseDefaultTempo).toBe("3-1-2-0");
    }
  });

  it("passes null exerciseDefaultTempo for duration-mode sets (AC1.6)", () => {
    const ex = createExercise({ default_tempo: "3-1-2-0" });
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          exercise_id: ex.id,
          target_sets: 2,
          target_duration_seconds: 60, // duration mode
          exercise: ex,
        }),
      ],
    });

    const seeds = buildInitialSetsFromTemplate(tpl, "session-1");
    expect(seeds).toHaveLength(2);
    for (const seed of seeds) {
      expect(seed.exerciseDefaultTempo).toBeNull();
    }
  });

  it("passes null exerciseDefaultTempo when exercise has no default_tempo", () => {
    const ex = createExercise({ default_tempo: null });
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          exercise_id: ex.id,
          target_sets: 1,
          target_duration_seconds: null,
          exercise: ex,
        }),
      ],
    });

    const seeds = buildInitialSetsFromTemplate(tpl, "session-1");
    expect(seeds).toHaveLength(1);
    expect(seeds[0].exerciseDefaultTempo).toBeNull();
  });

  it("passes null exerciseDefaultTempo when no exercise object is attached", () => {
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          target_sets: 1,
          target_duration_seconds: null,
          exercise: undefined, // no exercise joined
        }),
      ],
    });

    const seeds = buildInitialSetsFromTemplate(tpl, "session-1");
    expect(seeds).toHaveLength(1);
    expect(seeds[0].exerciseDefaultTempo).toBeNull();
  });
});
