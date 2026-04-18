/**
 * Structural tests verifying FTA batch 3 decomposition.
 * Ensures extracted components, hooks, and data files exist
 * and the parent files properly import from them.
 */
import * as fs from "fs";
import * as path from "path";

const resolve = (...parts: string[]) =>
  path.resolve(__dirname, "../..", ...parts);

const read = (filePath: string) =>
  fs.readFileSync(resolve(filePath), "utf-8");

describe("photos.tsx decomposition", () => {
  const mainSrc = read("app/body/photos.tsx");

  it("imports usePhotoActions hook", () => {
    expect(mainSrc).toContain("usePhotoActions");
  });

  it("imports PhotoFilterHeader component", () => {
    expect(mainSrc).toContain("PhotoFilterHeader");
  });

  it("imports PhotoMetaModal component", () => {
    expect(mainSrc).toContain("PhotoMetaModal");
  });

  it("imports PrivacyModal component", () => {
    expect(mainSrc).toContain("PrivacyModal");
  });

  it("main file is under 200 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(200);
  });

  it("extracted hook exists", () => {
    expect(fs.existsSync(resolve("hooks/usePhotoActions.ts"))).toBe(true);
  });

  it("extracted components exist", () => {
    expect(
      fs.existsSync(resolve("components/photos/PhotoFilterHeader.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(resolve("components/photos/PhotoMetaModal.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(resolve("components/photos/PrivacyModal.tsx"))
    ).toBe(true);
  });
});

describe("program/[id].tsx decomposition", () => {
  const mainSrc = read("app/program/[id].tsx");

  it("imports useProgramDetail hook", () => {
    expect(mainSrc).toContain("useProgramDetail");
  });

  it("imports WeeklySchedule component", () => {
    expect(mainSrc).toContain("WeeklySchedule");
  });

  it("imports ProgramHistory component", () => {
    expect(mainSrc).toContain("ProgramHistory");
  });

  it("main file is under 350 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(350);
  });

  it("extracted hook exists", () => {
    expect(fs.existsSync(resolve("hooks/useProgramDetail.ts"))).toBe(true);
  });

  it("extracted components exist", () => {
    expect(
      fs.existsSync(resolve("components/program/WeeklySchedule.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(resolve("components/program/ProgramHistory.tsx"))
    ).toBe(true);
  });
});

describe("WeeklySummary.tsx decomposition", () => {
  const mainSrc = read("components/WeeklySummary.tsx");

  it("imports useWeeklySummary hook", () => {
    expect(mainSrc).toContain("useWeeklySummary");
  });

  it("imports SummaryDetailSections component", () => {
    expect(mainSrc).toContain("SummaryDetailSections");
  });

  it("main file is under 250 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(250);
  });

  it("extracted hook exists", () => {
    expect(fs.existsSync(resolve("hooks/useWeeklySummary.ts"))).toBe(true);
  });

  it("extracted component exists", () => {
    expect(
      fs.existsSync(
        resolve("components/weekly-summary/SummaryDetailSections.tsx")
      )
    ).toBe(true);
  });
});

describe("template/[id].tsx decomposition", () => {
  const mainSrc = read("app/template/[id].tsx");

  it("imports useTemplateEditor hook", () => {
    expect(mainSrc).toContain("useTemplateEditor");
  });

  it("imports TemplateExerciseRow component", () => {
    expect(mainSrc).toContain("TemplateExerciseRow");
  });

  it("main file is under 200 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(200);
  });

  it("extracted hook exists", () => {
    expect(fs.existsSync(resolve("hooks/useTemplateEditor.ts"))).toBe(true);
  });

  it("extracted component exists", () => {
    expect(
      fs.existsSync(resolve("components/template/TemplateExerciseRow.tsx"))
    ).toBe(true);
  });
});
