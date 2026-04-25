/**
 * BLD-621: session bootstrap inherits training_mode from template_exercise.
 *
 * Tests the pure helper used by hooks/useSessionData when a session is created
 * from a template — covers the "Session inheritance" acceptance criterion.
 */

jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "test-uuid") }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn() }));
jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn() }));

import { buildInitialSetsFromTemplate } from "../../lib/db/templates";
import type { WorkoutTemplate } from "../../lib/types";
import { createTemplateExercise } from "../helpers/factories";

function makeTemplate(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return {
    id: "tpl-1",
    name: "Push Day",
    created_at: 0,
    updated_at: 0,
    exercises: [],
    ...overrides,
  };
}

describe("buildInitialSetsFromTemplate (BLD-621)", () => {
  it("returns an empty list when the template has no exercises", () => {
    expect(buildInitialSetsFromTemplate(makeTemplate(), "s1")).toEqual([]);
    expect(buildInitialSetsFromTemplate({ exercises: undefined }, "s1")).toEqual([]);
  });

  it("inherits training_mode from each template_exercise into every set", () => {
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          id: "te-1",
          exercise_id: "ex-1",
          position: 0,
          target_sets: 3,
          training_mode: "eccentric_overload",
        }),
      ],
    });
    const seeds = buildInitialSetsFromTemplate(tpl, "session-1");
    expect(seeds).toHaveLength(3);
    for (const s of seeds) {
      expect(s.trainingMode).toBe("eccentric_overload");
      expect(s.sessionId).toBe("session-1");
      expect(s.exerciseId).toBe("ex-1");
    }
    expect(seeds.map((s) => s.setNumber)).toEqual([1, 2, 3]);
  });

  it("preserves null training_mode (legacy templates start with no preference)", () => {
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          exercise_id: "ex-2",
          target_sets: 2,
          training_mode: null,
        }),
      ],
    });
    const seeds = buildInitialSetsFromTemplate(tpl, "session-2");
    expect(seeds).toHaveLength(2);
    for (const s of seeds) {
      expect(s.trainingMode).toBeNull();
    }
  });

  it("carries link_id and assigns round numbers for linked supersets", () => {
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          id: "te-a",
          exercise_id: "ex-a",
          position: 0,
          target_sets: 2,
          link_id: "link-x",
          training_mode: "weight",
        }),
        createTemplateExercise({
          id: "te-b",
          exercise_id: "ex-b",
          position: 1,
          target_sets: 2,
          link_id: null,
          training_mode: null,
        }),
      ],
    });
    const seeds = buildInitialSetsFromTemplate(tpl, "s");
    const linked = seeds.filter((s) => s.exerciseId === "ex-a");
    expect(linked.map((s) => s.round)).toEqual([1, 2]);
    expect(linked.every((s) => s.linkId === "link-x" && s.trainingMode === "weight")).toBe(true);
    const unlinked = seeds.filter((s) => s.exerciseId === "ex-b");
    expect(unlinked.every((s) => s.round === null && s.linkId === null && s.trainingMode === null)).toBe(true);
  });

  it("emits exercise_position for each seed", () => {
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({ exercise_id: "ex-1", position: 5, target_sets: 1 }),
      ],
    });
    const [seed] = buildInitialSetsFromTemplate(tpl, "s");
    expect(seed.exercisePosition).toBe(5);
  });
});
