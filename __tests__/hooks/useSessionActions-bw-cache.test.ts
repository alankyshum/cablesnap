// BLD-541: Verify the smart-default query-key contract.
//
// Reviewer blocker (PR #327): handleAddSet previously called
// getLastBodyweightModifier directly, so invalidations of
// ['bw-modifier-default', exerciseId] were no-ops. This test locks the
// contract by source-reading that:
//   1. handleAddSet routes the smart-default through queryClient.fetchQuery
//      keyed on ['bw-modifier-default', exerciseId].
//   2. handleCheck invalidates that key on set completion (so the next
//      add-set reflects the newly-completed modifier).
//   3. The write path in handleAddSet also invalidates after persisting.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("useSessionActions — bw-modifier-default cache contract (BLD-541)", () => {
  const src = readFileSync(
    resolve(__dirname, "../../hooks/useSessionActions.ts"),
    "utf8",
  );

  type Case =
    | { name: string; shouldMatch: RegExp }
    | { name: string; shouldNotMatch: RegExp }
    | { name: string; maxCount: number; pattern: RegExp };

  it.each<Case>([
    {
      name: "handleAddSet fetches via queryClient.fetchQuery with the locked key",
      shouldMatch: /queryClient\.fetchQuery\(\s*\{\s*queryKey:\s*\['bw-modifier-default', exerciseId\]/,
    },
    {
      name: "handleAddSet invalidates ['bw-modifier-default', exerciseId] after persist",
      shouldMatch: /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default', exerciseId\]/,
    },
    {
      name: "handleCheck invalidates ['bw-modifier-default', set.exercise_id] on set-complete",
      shouldMatch: /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default', set\.exercise_id\]/,
    },
    {
      name: "handleCheck invalidation is gated on is_bodyweight (NOT on modifier nullability)",
      // Reviewer R2 blocker: guarding on `set.bodyweight_modifier_kg != null`
      // leaves stale non-null defaults in cache when a BW-only (null
      // modifier) set completes. Must gate on whether the EXERCISE is
      // bodyweight, so BW-only completions also refresh the cache.
      shouldMatch: /group\?\.is_bodyweight\)\s*\{\s*queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default'/,
    },
    {
      name: "forbids the legacy `if (set.bodyweight_modifier_kg != null)` invalidation shape",
      shouldNotMatch: /if \(set\.bodyweight_modifier_kg != null\)\s*\{\s*queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default'/,
    },
    {
      name: "handleAddSet does NOT call getLastBodyweightModifier directly (only via fetchQuery queryFn)",
      pattern: /getLastBodyweightModifier\s*\(/g,
      maxCount: 1,
    },
  ])("$name", (c) => {
    if ("shouldMatch" in c) expect(src).toMatch(c.shouldMatch);
    else if ("shouldNotMatch" in c) expect(src).not.toMatch(c.shouldNotMatch);
    else expect((src.match(c.pattern) ?? []).length).toBeLessThanOrEqual(c.maxCount);
  });
});
