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

  it.each([
    {
      name: "handleAddSet fetches via queryClient.fetchQuery with the locked key",
      needle: /queryClient\.fetchQuery\(\s*\{\s*queryKey:\s*\['bw-modifier-default', exerciseId\]/,
    },
    {
      name: "handleAddSet invalidates ['bw-modifier-default', exerciseId] after persist",
      needle: /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default', exerciseId\]/,
    },
    {
      name: "handleCheck invalidates ['bw-modifier-default', set.exercise_id] on set-complete",
      needle: /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default', set\.exercise_id\]/,
    },
  ])("$name", ({ needle }) => {
    expect(src).toMatch(needle);
  });

  it("handleAddSet does NOT call getLastBodyweightModifier directly (must go through fetchQuery)", () => {
    // Direct call bypasses cache and makes invalidation meaningless.
    // The only direct call should live inside the fetchQuery queryFn closure.
    const directCalls = src.match(/getLastBodyweightModifier\s*\(/g) ?? [];
    // One call inside queryFn closure is allowed; anything above that leaks.
    expect(directCalls.length).toBeLessThanOrEqual(1);
  });
});
