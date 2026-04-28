// BLD-561: Exercise illustration resolver.
//
// Single source of truth for "does this exercise have illustrations?".
// Enforces the both-or-neither rule: a lone start image reads as a data bug,
// so if either position is missing we return null and the caller falls back
// to text-only rendering.
import type { Exercise } from "@/lib/types";
import { manifest } from "./manifest.generated";

export type ResolvedExerciseImages = {
  start: number | { uri: string };
  end: number | { uri: string };
  startAlt: string;
  endAlt: string;
};

export function resolveExerciseImages(
  ex: Pick<
    Exercise,
    "id" | "name" | "is_custom" | "start_image_uri" | "end_image_uri"
  >
): ResolvedExerciseImages | null {
  if (ex.is_custom) {
    if (!ex.start_image_uri || !ex.end_image_uri) return null;
    return {
      start: { uri: ex.start_image_uri },
      end: { uri: ex.end_image_uri },
      startAlt: `${ex.name} start position — user-supplied illustration.`,
      endAlt: `${ex.name} end position — user-supplied illustration.`,
    };
  }
  const entry = manifest[ex.id];
  if (!entry) return null;
  if (!entry.start || !entry.end) return null;
  if (!entry.startAlt || !entry.endAlt) return null;
  return {
    start: entry.start,
    end: entry.end,
    startAlt: entry.startAlt,
    endAlt: entry.endAlt,
  };
}
