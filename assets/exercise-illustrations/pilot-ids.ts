// BLD-561: Pilot exercise selection.
//
// R2 plan originally selected 10 Voltra pilot exercises stress-testing prompt
// coverage: 4 by popularity (owner-facing) + 6 by prompt-stress
// (mount × arm coverage). Selection covered {low, mid, high} mount × {1-arm,
// 2-arm} stance, with the first 4 biased toward the canonical seed-order set.
//
// BLD-743 Ship-9 ruling (CEO comment 9c5812a9, 2026-04-29):
// voltra-001 (Abdominal Crunches) and voltra-020 (Close-Grip Lat Pull-down)
// are dropped from the pilot. Both surfaced SAFETY_HIGH residuals that
// alt-text rewrites alone cannot mitigate (voltra-001 = inherent low-mount
// cable geometry near face; voltra-020 = grip-terminology disambiguation
// requiring schema work). They will be re-introduced via BLD-843
// (`safetyNote` schema + UI). Their round-2 panel output is preserved at
// the bottom of CURATION.md under "Dropped: voltra-001" / "Dropped:
// voltra-020" for audit and as raw input for that follow-up.
//
// This list is consumed by the generator, curate, regen, apply-rewrites, and
// gate-checker scripts AND by the manifest-completeness test.

export const PILOT_EXERCISE_IDS: readonly string[] = [
  // Popular / canonical
  "voltra-013", // Bicep Curls — low mount, 2-arm (see seed)
  "voltra-029", // Chest Press — mid mount, 2-arm (see seed)
  "voltra-045", // Lat Pulldown — high mount, 2-arm (see seed)
  // Prompt-stress grid
  "voltra-003", // Half Kneeling Chop — high mount, 1-arm diagonal
  "voltra-005", // One-arm Chest Fly with Rotation — mid mount, 1-arm
  "voltra-007", // Single Arm Chest Press with Spinal Rotation — mid mount, 1-arm
  "voltra-010", // mount stress — additional low-mount coverage
  "voltra-035", // high mount 1-arm alt
];
