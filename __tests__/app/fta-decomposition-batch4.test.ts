/**
 * Structural tests verifying FTA batch 4 decomposition.
 * Ensures extracted components, hooks exist and parent files import them.
 */
import * as fs from "fs";
import * as path from "path";

const resolve = (...parts: string[]) =>
  path.resolve(__dirname, "../..", ...parts);

const read = (filePath: string) =>
  fs.readFileSync(resolve(filePath), "utf-8");

describe("exercises.tsx decomposition", () => {
  const mainSrc = read("app/(tabs)/exercises.tsx");

  it("imports ExerciseCard component", () => {
    expect(mainSrc).toContain("ExerciseCard");
  });

  it("imports ExerciseDetailPane component", () => {
    expect(mainSrc).toContain("ExerciseDetailPane");
  });

  it("main file is under 300 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(300);
  });

  it("extracted components exist", () => {
    expect(
      fs.existsSync(resolve("components/exercises/ExerciseCard.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(resolve("components/exercises/ExerciseDetailPane.tsx"))
    ).toBe(true);
  });
});

describe("ExerciseForm.tsx decomposition", () => {
  const mainSrc = read("components/ExerciseForm.tsx");

  it("imports useExerciseForm hook", () => {
    expect(mainSrc).toContain("useExerciseForm");
  });

  it("imports MuscleGroupPicker component", () => {
    expect(mainSrc).toContain("MuscleGroupPicker");
  });

  it("main file is under 350 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(350);
  });

  it("extracted hook exists", () => {
    expect(fs.existsSync(resolve("hooks/useExerciseForm.ts"))).toBe(true);
  });

  it("extracted component exists", () => {
    expect(
      fs.existsSync(resolve("components/exercise-form/MuscleGroupPicker.tsx"))
    ).toBe(true);
  });
});

describe("MuscleVolumeSegment.tsx decomposition", () => {
  const mainSrc = read("components/MuscleVolumeSegment.tsx");

  it("imports useMuscleVolume hook", () => {
    expect(mainSrc).toContain("useMuscleVolume");
  });

  it("imports VolumeBarChart component", () => {
    expect(mainSrc).toContain("VolumeBarChart");
  });

  it("imports VolumeTrendChart component", () => {
    expect(mainSrc).toContain("VolumeTrendChart");
  });

  it("main file is under 300 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(300);
  });

  it("extracted hook exists", () => {
    expect(fs.existsSync(resolve("hooks/useMuscleVolume.ts"))).toBe(true);
  });

  it("extracted components exist", () => {
    expect(
      fs.existsSync(resolve("components/muscle-volume/VolumeBarChart.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(resolve("components/muscle-volume/VolumeTrendChart.tsx"))
    ).toBe(true);
  });
});

describe("ExerciseGroupCard.tsx decomposition", () => {
  const mainSrc = read("components/session/ExerciseGroupCard.tsx");

  it("imports GroupCardHeader component", () => {
    expect(mainSrc).toContain("GroupCardHeader");
  });

  it("imports SuggestionChip component", () => {
    expect(mainSrc).toContain("SuggestionChip");
  });

  it("main file is under 300 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(300);
  });

  it("extracted components exist", () => {
    expect(
      fs.existsSync(resolve("components/session/GroupCardHeader.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(resolve("components/session/SuggestionChip.tsx"))
    ).toBe(true);
  });
});
