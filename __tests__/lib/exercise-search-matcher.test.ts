import { matchExerciseSearch, norm } from "../../lib/exercise-search-matcher";

describe("matchExerciseSearch", () => {
  it("normalizes search query strings correctly", () => {
    expect(norm("  Bench-Press_variant  ")).toBe("bench press variant");
  });

  it("handles word-order-independent matching", () => {
    // Given the exercise "Bench Press" exists When the user types "press bench" Then "Bench Press" matches.
    expect(matchExerciseSearch("Bench Press", "press bench")).toBe(true);
    expect(matchExerciseSearch("Seated Cable Row", "row cable seated")).toBe(true);
    expect(matchExerciseSearch("Bicep Curl", "curl bicep")).toBe(true);
  });

  it("handles AND token matching and narrowing", () => {
    // Given exercises "Seated Cable Row" and "Bent Over Row"
    // When the user types "cable row"
    // Then "Seated Cable Row" matches and "Bent Over Row" does not.
    expect(matchExerciseSearch("Seated Cable Row", "cable row")).toBe(true);
    expect(matchExerciseSearch("Bent Over Row", "cable row")).toBe(false);
  });

  it("handles glued queries (no regression)", () => {
    // Given the exercise "Bench Press" When the user types "benchpress" (glued) Then "Bench Press" still matches.
    expect(matchExerciseSearch("Bench Press", "benchpress")).toBe(true);
    expect(matchExerciseSearch("Seated Cable Row", "cablerow")).toBe(true);
  });

  it("handles single-token queries (no regression)", () => {
    // Given a single-token query "row" Then all exercises whose name contains "row" match.
    expect(matchExerciseSearch("Seated Cable Row", "row")).toBe(true);
    expect(matchExerciseSearch("Bent Over Row", "row")).toBe(true);
    expect(matchExerciseSearch("Bench Press", "row")).toBe(false);
  });

  it("handles empty and whitespace-only queries", () => {
    expect(matchExerciseSearch("Bench Press", "")).toBe(true);
    expect(matchExerciseSearch("Bench Press", "   ")).toBe(true);
  });

  it("normalizes special characters like - and _ in exercises and queries", () => {
    expect(matchExerciseSearch("Bench-Press", "bench press")).toBe(true);
    expect(matchExerciseSearch("Bench_Press", "bench press")).toBe(true);
    expect(matchExerciseSearch("Bench Press", "bench-press")).toBe(true);
    expect(matchExerciseSearch("Bench Press", "bench_press")).toBe(true);
  });

  it("returns false for non-matching multi-token query", () => {
    expect(matchExerciseSearch("Bench Press", "cable row")).toBe(false);
  });
});
