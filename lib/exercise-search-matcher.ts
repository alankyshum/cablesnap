/**
 * Normalizes a string for search matching by lowercasing, replacing hyphens
 * and underscores with spaces, collapsing multiple spaces, and trimming.
 */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Word-order-independent exercise search matching (token AND matching).
 * Match if EVERY token satisfies n.includes(token) || nNoSpace.includes(token).
 *
 * Empty query or query containing only whitespace returns true (no-op).
 */
export function matchExerciseSearch(exerciseName: string, query: string): boolean {
  const q = norm(query);
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const n = norm(exerciseName);
  const nNoSpace = n.replace(/ /g, "");

  return tokens.every((token) => n.includes(token) || nNoSpace.includes(token));
}
