/**
 * BLD-593 — ExerciseTutorialLink integration parity.
 *
 * AC: Same behavior ships in both ExerciseDetailPane.tsx AND
 * ExerciseDetailDrawer.tsx. In the Drawer, the link must be a sibling
 * of the `instructions` expansion, appearing in BOTH branches of the
 * `atLeastMedium` layout ternary (otherwise the zero-steps AC fails).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const paneSrc = readFileSync(
  resolve(__dirname, "../../../components/exercises/ExerciseDetailPane.tsx"),
  "utf8",
);
const drawerSrc = readFileSync(
  resolve(__dirname, "../../../components/session/ExerciseDetailDrawer.tsx"),
  "utf8",
);

describe("ExerciseTutorialLink — parity across detail surfaces", () => {
  it("ExerciseDetailPane imports and renders ExerciseTutorialLink", () => {
    expect(paneSrc).toMatch(
      /import \{ ExerciseTutorialLink \} from ["']\.\/ExerciseTutorialLink["']/,
    );
    expect(paneSrc).toMatch(/<ExerciseTutorialLink\s+exerciseName=\{detail\.name\}/);
  });

  it("ExerciseDetailDrawer imports and renders ExerciseTutorialLink", () => {
    expect(drawerSrc).toMatch(
      /import \{ ExerciseTutorialLink \} from ["']\.\.\/exercises\/ExerciseTutorialLink["']/,
    );
    // Must appear in both layout branches — at least two occurrences.
    const matches = drawerSrc.match(/<ExerciseTutorialLink\b/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(drawerSrc).toMatch(
      /<ExerciseTutorialLink\s+exerciseName=\{exercise\.name\}/,
    );
  });
});
