// BLD-541: Lock the sign-axis semantics of getExerciseRecords'
// weighted-bodyweight aggregate.
//
// Reviewer blocker (PR #327): MIN over assisted negatives returns the
// WORST (most-assisted) value; "best assisted" semantics are "closest to
// zero" = least assistance = MAX of negatives. This test reads the source
// to prevent regression.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("getExerciseRecords — weighted-bodyweight SQL contract (BLD-541)", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../lib/db/exercise-history.ts"),
    "utf8",
  );

  it.each([
    {
      name: "best_added uses MAX over positive modifiers",
      needle: /MAX\(CASE WHEN ws\.bodyweight_modifier_kg > 0/,
    },
    {
      name: "best_assisted uses MAX over negative modifiers (closest to zero)",
      needle: /MAX\(CASE WHEN ws\.bodyweight_modifier_kg < 0/,
    },
  ])("$name", ({ needle }) => {
    expect(src).toMatch(needle);
  });

  it("best_assisted MUST NOT use MIN (regression guard for reviewer finding)", () => {
    // MIN would return -30 when -10 is the true "best" (least-assisted) set.
    expect(src).not.toMatch(/MIN\(CASE WHEN ws\.bodyweight_modifier_kg < 0/);
  });
});
