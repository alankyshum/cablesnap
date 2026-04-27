/**
 * BLD-561: Exercise illustration manifest completeness.
 *
 * Until the pilot images are generated (GEMINI_API_KEY or GOOGLE_API_KEY required for
 * `npm run generate:exercise-images`), the manifest is intentionally empty
 * and every pilot exercise falls back to text-only via the both-or-neither
 * rule in `resolveExerciseImages`. That's fine; the resolver test exercises
 * the null-path.
 *
 * When the generator populates the manifest, each pilot id MUST have all
 * four keys. We lock that in here: if a pilot id appears in the manifest
 * at all, it must be complete.
 */
import { manifest } from "../assets/exercise-illustrations/manifest.generated";
import { PILOT_EXERCISE_IDS } from "../assets/exercise-illustrations/pilot-ids";
import { seedExercises } from "../lib/seed";

describe("exercise-illustrations manifest", () => {
  it("has a valid module shape (empty or populated)", () => {
    expect(manifest).toBeDefined();
    expect(typeof manifest).toBe("object");
  });

  it("is deterministic-sorted by id (localeCompare)", () => {
    const ids = Object.keys(manifest);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it("every present pilot entry has all four keys", () => {
    for (const id of PILOT_EXERCISE_IDS) {
      const entry = manifest[id];
      if (!entry) continue; // allowed while pilot not yet generated
      expect(entry.start).toBeDefined();
      expect(entry.end).toBeDefined();
      expect(typeof entry.startAlt).toBe("string");
      expect(typeof entry.endAlt).toBe("string");
      expect(entry.startAlt.length).toBeGreaterThan(0);
      expect(entry.endAlt.length).toBeGreaterThan(0);
    }
  });

  it("contains only known seeded exercise ids", () => {
    const seededIds = new Set(seedExercises().map((exercise) => exercise.id));
    for (const id of Object.keys(manifest)) {
      expect(seededIds.has(id)).toBe(true);
    }
  });
});
