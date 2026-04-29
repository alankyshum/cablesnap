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

  it("carries link_id and assigns round numbers for linked supersets", () => {
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          id: "te-a",
          exercise_id: "ex-a",
          position: 0,
          target_sets: 2,
          link_id: "link-x",
        }),
        createTemplateExercise({
          id: "te-b",
          exercise_id: "ex-b",
          position: 1,
          target_sets: 2,
          link_id: null,
        }),
      ],
    });
    const seeds = buildInitialSetsFromTemplate(tpl, "s");
    const linked = seeds.filter((s) => s.exerciseId === "ex-a");
    expect(linked.map((s) => s.round)).toEqual([1, 2]);
    expect(linked.every((s) => s.linkId === "link-x")).toBe(true);
    const unlinked = seeds.filter((s) => s.exerciseId === "ex-b");
    expect(unlinked.every((s) => s.round === null && s.linkId === null)).toBe(true);
  });

  it("emits setType for each seeded set using template set_types", () => {
    const tpl = makeTemplate({
      exercises: [
        createTemplateExercise({
          exercise_id: "ex-1",
          target_sets: 3,
          set_types: ["warmup", "normal", "failure"],
        }),
      ],
    });
    const seeds = buildInitialSetsFromTemplate(tpl, "s");
    expect(seeds.map((seed) => seed.setType)).toEqual(["warmup", "normal", "failure"]);
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
