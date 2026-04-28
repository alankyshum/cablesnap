// BLD-771: Lock the variant autofill contract in handleAddSet.
//
// Source-grep pattern (mirrors BLD-541 bw-cache.test.ts) — verifies the
// implementation maintains the invariants defined in the plan:
//
//   1. Autofill is gated on isCableExercise() — never runs for non-cable.
//   2. History fetch goes through queryClient.fetchQuery keyed on
//      ['variant-history', exerciseId] so siblings within staleTime share.
//   3. Autofill is persisted via updateSetVariant() — the SAME entry point
//      the picker uses (single write path → uniform silent-default closure).
//   4. The write path invalidates ['variant-history', exerciseId] after
//      persisting so the next add-set reflects the just-written values.
//   5. Resolution uses the pure getLastVariant(history) helper — never reads
//      from exercises.attachment / exercises.mount_position (the QD-B2 trap).
//   6. The persist write is gated on `last.attachment !== null || last.mount_position !== null`
//      so a no-history exercise creates a NULL/NULL set without a redundant
//      DB write.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("useSessionActions — cable variant autofill contract (BLD-771)", () => {
  const src = readFileSync(
    resolve(__dirname, "../../hooks/useSessionActions.ts"),
    "utf8",
  );

  type Case =
    | { name: string; shouldMatch: RegExp }
    | { name: string; shouldNotMatch: RegExp };

  it.each<Case>([
    {
      name: "autofill is gated on isCableExercise(group.equipment)",
      shouldMatch: /isCableExercise\(\s*\{\s*equipment:\s*group\.equipment\s*\}\s*\)/,
    },
    {
      name: "history fetch routes through queryClient.fetchQuery with ['variant-history', exerciseId]",
      shouldMatch:
        /queryClient\.fetchQuery\(\s*\{\s*queryKey:\s*\['variant-history', exerciseId\]/,
    },
    {
      name: "queryFn is getRecentVariantHistory(exerciseId)",
      shouldMatch: /queryFn:\s*\(\)\s*=>\s*getRecentVariantHistory\(exerciseId\)/,
    },
    {
      name: "resolution uses the pure getLastVariant helper",
      shouldMatch: /getLastVariant\(history\)/,
    },
    {
      name: "persist routes through updateSetVariant — same as the picker",
      shouldMatch:
        /updateSetVariant\(\s*newSet\.id,\s*last\.attachment,\s*last\.mount_position\s*\)/,
    },
    {
      name: "persist is gated on at least one non-null attribute (no redundant NULL/NULL writes)",
      shouldMatch:
        /last\.attachment\s*!==\s*null\s*\|\|\s*last\.mount_position\s*!==\s*null/,
    },
    {
      name: "invalidates ['variant-history', exerciseId] after persisting",
      shouldMatch:
        /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['variant-history', exerciseId\]/,
    },
    {
      // Reviewer blocker #1 (PR #426): persistence to DB alone is not
      // enough — the newly-added in-memory row must also reflect the
      // autofilled attachment/mount_position so the chips render with the
      // resolved values immediately, without waiting for a DB round-trip.
      name: "in-memory setWithModifier reflects autofilled attachment",
      shouldMatch:
        /attachment:\s*autofilledAttachment\s*\?\?\s*newSet\.attachment/,
    },
    {
      // Reviewer blocker #1 (PR #426): same for mount_position — the
      // in-memory row carries the autofilled value, not just whatever
      // the DB row was created with.
      name: "in-memory setWithModifier reflects autofilled mount_position",
      shouldMatch:
        /mount_position:\s*autofilledMountPosition\s*\?\?\s*newSet\.mount_position/,
    },
    {
      name: "does NOT call getRecentVariantHistory directly outside the fetchQuery queryFn",
      // Source mentions: import + queryFn + this assertion comment. Anything
      // beyond ~3 references would suggest a direct call bypassing React Query.
      shouldNotMatch: /\bawait getRecentVariantHistory\b/,
    },
    {
      name: "does NOT silent-default from exercises.attachment / exercises.mount_position",
      // QD-B2: the autofill must read only workout_sets history. Any
      // reference to exercise.attachment / exercise.mount_position in the
      // autofill block would reintroduce the silent-default trap.
      shouldNotMatch: /exercise\.(attachment|mount_position)/,
    },
  ])("$name", (c) => {
    if ("shouldMatch" in c) expect(src).toMatch(c.shouldMatch);
    else expect(src).not.toMatch(c.shouldNotMatch);
  });
});
