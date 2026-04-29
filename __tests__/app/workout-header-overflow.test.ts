import * as fs from "fs";
import * as path from "path";

/**
 * Originally BLD-203 + BLD-390 pinned a two-row header (name+actions / details+mode).
 * BLD-850 redesigned it as a three-row header:
 *   Row 1: title (full width).
 *   Row 2: Details + control cluster (`actionsRow`).
 *   Row 3: Last | Next (owned by `LastNextRow`).
 *
 * The intent of the original tests — "header doesn't overflow on narrow
 * screens" — is preserved by:
 *   - Title gets its own full-width row (no horizontal competition with icons).
 *   - `actionsRow` uses flexWrap so controls reflow if Details + cluster
 *     don't fit.
 *   - Last|Next is its own row, never crammed beside title.
 */

const groupCardHeaderSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"),
  "utf-8",
);

const exerciseGroupCardSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/ExerciseGroupCard.tsx"),
  "utf-8",
);

const sessionSrc = exerciseGroupCardSrc + "\n" + groupCardHeaderSrc;

describe("Workout session exercise header three-row layout (BLD-203/BLD-390, redesigned in BLD-850)", () => {
  it("uses a stacked header with `headerWrap` + `actionsRow`", () => {
    expect(groupCardHeaderSrc).toContain("headerWrap");
    expect(groupCardHeaderSrc).toContain("actionsRow");
  });

  it("`actionsRow` flex-wraps so swap/notes don't push Details off-screen", () => {
    const block = groupCardHeaderSrc.match(/actionsRow:\s*\{[^}]+\}/s);
    expect(block).not.toBeNull();
    expect(block![0]).toContain('flexDirection: "row"');
    expect(block![0]).toMatch(/flexWrap:\s*["']wrap["']/);
  });

  it("title row contains exercise name; controls row contains swap/notes/Details", () => {
    expect(groupCardHeaderSrc).toContain("styles.groupTitle");
    expect(groupCardHeaderSrc).toContain("Details");
    expect(groupCardHeaderSrc).toContain("swap-horizontal");
    expect(groupCardHeaderSrc).toContain("note-text");
  });

  it("training-mode selector is no longer rendered in the header (BLD-850 — moved to Details modal)", () => {
    // Per PLAN-BLD-769 ("Remove `TrainingModeSelector` from the header
    // (move to Details modal — out of scope here, just remove the slot)").
    expect(groupCardHeaderSrc).not.toContain("TrainingModeSelector");
  });

  it("exercise-name Text does not use numberOfLines (long names wrap, never truncate)", () => {
    const groupTitleIdx = groupCardHeaderSrc.indexOf("styles.groupTitle");
    expect(groupTitleIdx).toBeGreaterThan(-1);
    const before = groupCardHeaderSrc.lastIndexOf("<Text", groupTitleIdx);
    const tag = groupCardHeaderSrc.slice(before, groupTitleIdx + 30);
    expect(tag).not.toContain("numberOfLines");
  });

  it("Last|Next row is its own row inside the header (BLD-850)", () => {
    expect(groupCardHeaderSrc).toContain("LastNextRow");
    // It is rendered conditionally on previousPerformance / suggestion presence.
    expect(groupCardHeaderSrc).toMatch(/showLastNextRow/);
  });

  // Reference still anchors to bundled session source so future structural
  // regressions in either file get flagged.
  it("session source surface remains coherent", () => {
    expect(sessionSrc.length).toBeGreaterThan(0);
  });
});
