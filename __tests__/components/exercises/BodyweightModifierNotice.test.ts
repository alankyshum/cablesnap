// BLD-541 AC-23: v1 user-trust microcopy regression guard.
//
// The plan (§Acceptance Criteria) requires the exact wording on bodyweight
// exercise detail surfaces so users understand the weighted-bodyweight
// modifier contributes to PR tracking but NOT yet to weekly/monthly volume
// totals. The copy is the compensating control for the deferred 6-aggregate
// refactor; paraphrasing defeats the user-trust goal.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BW_MODIFIER_VOLUME_NOTICE } from "../../../components/exercises/BodyweightModifierNotice";

describe("BodyweightModifierNotice — AC-23 plan-locked copy", () => {
  const expected =
    "Weighted-bodyweight modifier is tracked as a PR dimension but does not yet contribute to weekly/monthly volume totals.";

  it("exports the exact plan-locked wording (no paraphrase)", () => {
    expect(BW_MODIFIER_VOLUME_NOTICE).toBe(expected);
  });

  it.each([
    {
      name: "app/exercise/[id].tsx (main exercise detail)",
      path: "../../../app/exercise/[id].tsx",
    },
    {
      name: "components/exercises/ExerciseDetailPane.tsx (tablet split-pane)",
      path: "../../../components/exercises/ExerciseDetailPane.tsx",
    },
  ])(
    "$name renders BodyweightModifierNotice gated on equipment === 'bodyweight'",
    ({ path }) => {
      const src = readFileSync(resolve(__dirname, path), "utf8");
      expect(src).toMatch(/import \{ BodyweightModifierNotice \} from/);
      expect(src).toMatch(
        /equipment === ['"]bodyweight['"][\s\S]{0,80}BodyweightModifierNotice/,
      );
    },
  );
});
