import * as fs from "fs";
import * as path from "path";

const sessionSrc = [
  fs.readFileSync(path.resolve(__dirname, "../../components/session/ExerciseGroupCard.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"), "utf-8"),
].join("\n");

describe("Workout session exercise header two-row layout (BLD-203, updated BLD-390)", () => {
  it("uses two-row header structure with headerWrap", () => {
    expect(sessionSrc).toContain("headerWrap");
    expect(sessionSrc).toContain("headerRow1");
    expect(sessionSrc).toContain("headerRow2");
    const wrapMatch = sessionSrc.match(/headerWrap:\s*\{[^}]+\}/s);
    expect(wrapMatch).not.toBeNull();
  });

  it("row 1 has exercise name and swap/notes buttons", () => {
    const row1Match = sessionSrc.match(/headerRow1:\s*\{[^}]+\}/s);
    expect(row1Match).not.toBeNull();
    expect(row1Match![0]).toContain('flexDirection: "row"');
    expect(sessionSrc).toContain("headerActions");
    expect(sessionSrc).toContain("swap-horizontal");
  });

  it("row 2 has Details and training mode", () => {
    const row2Match = sessionSrc.match(/headerRow2:\s*\{[^}]+\}/s);
    expect(row2Match).not.toBeNull();
    expect(row2Match![0]).toContain('flexDirection: "row"');
    expect(sessionSrc).toContain("Details");
    expect(sessionSrc).toContain("TrainingModeSelector");
  });

  it("exercise name is never truncated (no numberOfLines)", () => {
    // The exercise name Text should not have numberOfLines
    expect(sessionSrc).toContain("styles.groupTitle");
    expect(sessionSrc).not.toContain("numberOfLines");
  });

  it("header contains exercise name and Details button", () => {
    expect(sessionSrc).toContain("styles.groupTitle");
    expect(sessionSrc).toContain("Details");
  });
});
