import { aggregateMuscles } from "../../lib/aggregate-muscles";
import type { MuscleGroup } from "../../lib/types";

describe("aggregateMuscles", () => {
  it("separates primary/secondary, deduplicates, and primary wins over secondary", () => {
    // Basic separation
    const simple = aggregateMuscles([
      { primary_muscles: ["chest" as MuscleGroup], secondary_muscles: ["triceps" as MuscleGroup] },
    ]);
    expect(simple.primary).toEqual(["chest"]);
    expect(simple.secondary).toEqual(["triceps"]);

    // Empty input
    const empty = aggregateMuscles([]);
    expect(empty.primary).toEqual([]);
    expect(empty.secondary).toEqual([]);

    // Primary wins when muscle appears as both across exercises + deduplication
    const multi = aggregateMuscles([
      { primary_muscles: ["chest" as MuscleGroup, "shoulders" as MuscleGroup], secondary_muscles: ["triceps" as MuscleGroup] },
      { primary_muscles: ["chest" as MuscleGroup], secondary_muscles: ["shoulders" as MuscleGroup, "core" as MuscleGroup] },
    ]);
    expect(multi.primary).toEqual(expect.arrayContaining(["chest", "shoulders"]));
    expect(multi.primary.filter((m) => m === "chest")).toHaveLength(1);
    expect(multi.secondary).toEqual(expect.arrayContaining(["triceps", "core"]));
    expect(multi.secondary).not.toContain("shoulders");
  });
});
