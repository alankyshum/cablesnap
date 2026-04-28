// @generated — do not edit. Regenerate via `npm run generate:exercise-images`.
//
// BLD-561: Exercise illustrations pilot manifest.
// Entries are deterministic-sorted by exercise id (localeCompare).
// Each entry must have ALL FOUR keys (start, end, startAlt, endAlt) or
// resolveExerciseImages() will return null per the both-or-neither rule.
//
// To populate: run `npm run generate:exercise-images` with OPENAI_API_KEY in env.
// See scripts/generate-exercise-images.ts and CURATION.md.
/* eslint-disable */

export type ManifestEntry = {
  start: number;
  end: number;
  startAlt: string;
  endAlt: string;
};

export const manifest: Record<string, ManifestEntry> = {};
