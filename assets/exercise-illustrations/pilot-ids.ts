// BLD-561: Pilot exercise selection.
//
// R2 plan calls for 10 Voltra pilot exercises stress-testing prompt coverage:
//   4 by popularity (owner-facing) + 6 by prompt-stress (mount × arm coverage).
//
// Selection below covers {low, mid, high} mount × {1-arm, 2-arm} stance,
// with the first 4 biased toward the canonical seed-order popularity set.
// Adjust with owner confirmation before expanding to BLD-556-P2.
//
// This list is consumed by the generator script AND by the
// manifest-completeness test.

export const PILOT_EXERCISE_IDS: readonly string[] = [
  // Popular / canonical
  "voltra-001", // Abdominal Crunches — low mount, 2-arm
  "voltra-013", // Bicep Curls — low mount, 2-arm (see seed)
  "voltra-029", // Chest Press — mid mount, 2-arm (see seed)
  "voltra-045", // Lat Pulldown — high mount, 2-arm (see seed)
  // Prompt-stress grid
  "voltra-003", // Half Kneeling Chop — high mount, 1-arm diagonal
  "voltra-005", // One-arm Chest Fly with Rotation — mid mount, 1-arm
  "voltra-007", // Single Arm Chest Press with Spinal Rotation — mid mount, 1-arm
  "voltra-010", // mount stress — additional low-mount coverage
  "voltra-020", // mid mount 2-arm alt
  "voltra-035", // high mount 1-arm alt
];
