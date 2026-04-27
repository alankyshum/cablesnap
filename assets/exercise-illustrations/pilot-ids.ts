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
  "voltra-013", // High Pulley Overhead Triceps Extension — high mount, rope
  "voltra-029", // Crossover Fly — high mount, 2-arm
  "voltra-045", // Side Kicks — low mount, ankle strap
  // Prompt-stress grid
  "voltra-003", // Half Kneeling Chop — high mount, 1-arm diagonal
  "voltra-005", // One-arm Chest Fly with Rotation — mid mount, 1-arm
  "voltra-007", // Single Arm Chest Press with Spinal Rotation — mid mount, 1-arm
  "voltra-010", // Biceps Curls (Low Pulley) — low mount, 1-arm
  "voltra-020", // Close Grip Lat Pull-down — high mount, bar
  "voltra-035", // Standing Chest Press (Handle) — mid mount, 1-arm
];
